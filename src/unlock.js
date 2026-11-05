/**
 * unlock.js
 *
 * The core business logic: inspecting a PDF's encryption and removing it.
 *
 * Two-step flow per file:
 *  1. `checkAndUnlock()` runs `qpdf --show-encryption` to learn whether the file is
 *     encrypted, whether a user password is required, and which permissions are set.
 *     Owner-password-only files (restricted permissions) are decrypted immediately.
 *  2. `decrypt()` runs `qpdf --decrypt` and turns `/output.pdf` into a Blob download URL.
 *
 * Both steps are always executed through the serial job queue (see `queue.js`) so the
 * shared wasm instance is never re-entered.
 */

import { state } from "./state.js";
import { runQpdf } from "./qpdf.js";
import { render } from "./render.js";
import { clearDownload, triggerDownload } from "./download.js";
import { passwordInput } from "./dom.js";
import { enqueue } from "./queue.js";

/**
 * Inspect one entry and, when possible, unlock it without user input.
 *
 * Leaves the entry in one of the terminal states:
 * - `"unencrypted"` — the PDF is not protected at all,
 * - `"password"`    — a user password is required before decrypting,
 * - otherwise `decrypt()` is called with an empty password (owner-password case),
 * - `"error"`       — the file could not be read or inspected.
 *
 * @param {import("./state.js").Entry} entry Entry created by `addFiles()`.
 * @returns {Promise<void>} Resolves once the entry reached a terminal state.
 */
export async function checkAndUnlock(entry) {
  // Show an immediate "we are on it" state in the row.
  entry.status = "checking";
  entry.detail = "Checking…";
  // Reset any permissions left over from a previous attempt.
  entry.permissions = {};
  // Paint the row before the awaited wasm work starts.
  render();

  // Collected qpdf console output for this file.
  let lines;
  try {
    // Read the file into memory exactly once; reused by the later decrypt run.
    entry.bytes = new Uint8Array(await entry.file.arrayBuffer());
    // Ask qpdf about the file's encryption state (never modifies it).
    const result = await runQpdf(entry.bytes, [
      "--show-encryption",
      "/input.pdf",
    ]);
    // Keep the captured output for the checks below.
    lines = result.lines;

    // A non-zero exit plus a password hint means a user password is needed.
    if (result.exitCode !== 0 && lines.some((l) => /password/i.test(l))) {
      entry.status = "password";
      entry.detail = "Password-protected";
      render();
      // Wait for the user to supply the password via `unlockWithPassword()`.
      return;
    }

    // qpdf explicitly reports files that carry no encryption at all.
    if (lines.some((l) => l.includes("not encrypted"))) {
      entry.status = "unencrypted";
      entry.detail = "Not encrypted — nothing to do";
      render();
      // Nothing else to do for this file.
      return;
    }

    // Parse the `key: value` / `key = value` permission lines into a lookup object,
    // which `render()` then displays as allowed/restricted rows.
    entry.permissions = Object.fromEntries(
      lines
        // Split each line into its key and value halves.
        .map((l) => l.match(/^(.+?)\s*[=:]\s*(.*)$/))
        // Drop lines that do not follow the pattern (headers, blank lines, …).
        .filter(Boolean)
        // Normalise whitespace around key and value.
        .map((m) => [m[1].trim(), m[2].trim()]),
    );
  } catch (err) {
    // Reading the file or booting wasm failed — report it on the row.
    entry.status = "error";
    entry.detail = err.message || "Could not read file";
    render();
    return;
  }

  // Encrypted without a user password: unlock it straight away.
  await decrypt(entry, "");
}

/**
 * Decrypt an entry with `qpdf --decrypt` and expose the result as a download.
 *
 * On success the entry becomes downloadable and is queued for auto-download. On failure
 * it falls back to `"password"` when a password was supplied (i.e. the password was
 * wrong) or to `"error"` for the automatic (empty password) case.
 *
 * @param {import("./state.js").Entry} entry Entry whose `bytes` were already read.
 * @param {string} password User password, or `""` to attempt the owner-password unlock.
 * @returns {Promise<void>} Resolves after the entry was updated and re-rendered.
 */
export async function decrypt(entry, password) {
  // Reflect the running step in the row.
  entry.detail = "Decrypting…";
  entry.status = "checking";
  render();

  try {
    // Materialise the decrypted copy at `/output.pdf` inside the wasm file system.
    const args = ["--decrypt", "/input.pdf", "/output.pdf"];
    // qpdf wants the password as an option *before* the positional arguments.
    if (password) args.unshift("--password=" + password);

    // Run qpdf and grab the output file system back for reading `/output.pdf`.
    const { exitCode, lines, instance } = await runQpdf(entry.bytes, args);

    // Exit code 3 is a warning for qpdf (e.g. recovered damage) and still writes a file.
    if (exitCode !== 0 && exitCode !== 3) {
      // Prefer qpdf's own message over the bare exit code.
      throw new Error(
        lines.join("\n").trim() || `qpdf exited with code ${exitCode}`,
      );
    }

    // Read the produced bytes out of the virtual file system.
    const output = instance.FS.readFile("/output.pdf");
    // An empty result means the run silently failed; treat it as an error.
    if (!output || output.length === 0) {
      throw new Error("qpdf produced an empty file");
    }

    // Release a previous download for this entry, if the user retried.
    clearDownload(entry);
    // `<name>_unlocked.pdf` keeps the original name recognisable.
    entry.outName = entry.file.name.replace(/\.pdf$/i, "") + "_unlocked.pdf";
    // Wrap the bytes in a Blob and expose them through an object URL.
    entry.downloadUrl = URL.createObjectURL(
      new Blob([output], { type: "application/pdf" }),
    );
    // Mark the entry as finished.
    entry.status = "unlocked";
    entry.detail = "Unlocked";
    // Auto-download is triggered after the next render pass.
    state.autoDownloads.push(entry);
  } catch (err) {
    // A supplied password that fails means "wrong password" → ask again.
    // Without a password the failure is final → error state.
    entry.status = password ? "password" : "error";
    entry.detail = err.message || "Decryption failed";
  }

  // Repaint so the new status/download link are visible.
  render();

  // Download outside the render pass so the link also exists in the list.
  // `splice(0)` empties the buffer and returns the pending entries in one step.
  for (const done of state.autoDownloads.splice(0)) triggerDownload(done);
}

/**
 * Apply the password typed in the UI to every entry that is waiting for one.
 *
 * Bound to the unlock button and to the Enter key in the password field. Each file is
 * enqueued separately so a wrong password does not block the others.
 *
 * @returns {void}
 */
export function unlockWithPassword() {
  // Only entries blocked on a password are affected.
  const pending = state.entries.filter((e) => e.status === "password");
  // Nothing pending (e.g. stale click): do nothing.
  if (pending.length === 0) return;
  // Read the current field value; the field is not cleared so retries are quick.
  const password = passwordInput.value;
  for (const entry of pending) {
    // Queue one decrypt run per protected file.
    enqueue(() => decrypt(entry, password));
  }
}
