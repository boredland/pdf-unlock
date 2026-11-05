import { runQpdf } from "./qpdf.js";
import { render, passwordInput } from "./render.js";
import { state } from "./state.js";

function enqueue(task) {
  state.queue.push(task);
  pump();
}

async function pump() {
  if (state.processing) return;
  state.processing = true;
  render();
  while (state.queue.length > 0) {
    try {
      await state.queue.shift()();
    } catch (err) {
      // One broken file must not stall the rest of the batch.
      console.error(err);
    }
  }
  state.processing = false;
  render();
}

/**
 * @param {FileList|File[]} files
 */
export function addFiles(files) {
  const added = [];
  let nonPdf = 0;
  let duplicates = 0;
  for (const file of files) {
    // Some systems report an empty MIME type, so the extension counts too.
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      nonPdf++;
      continue;
    }
    // Name + size is the only identity a File offers without reading it.
    if (
      state.entries.some(
        (e) => e.file.name === file.name && e.file.size === file.size,
      )
    ) {
      duplicates++;
      continue;
    }
    const entry = {
      id: state.nextId++,
      file,
      bytes: null,
      status: "checking",
      detail: "Queued…",
      permissions: {},
      downloadUrl: null,
      outName: "",
    };
    state.entries.push(entry);
    added.push(entry);
  }

  state.notice = skippedNotice(nonPdf, duplicates);
  render();
  for (const entry of added) enqueue(() => checkAndUnlock(entry));
}

function skippedNotice(nonPdf, duplicates) {
  const parts = [];
  if (nonPdf) parts.push(`${nonPdf} non-PDF file${nonPdf > 1 ? "s" : ""}`);
  if (duplicates) {
    parts.push(
      `${duplicates} file${duplicates > 1 ? "s" : ""} already in the list`,
    );
  }
  return parts.length ? `Skipped ${parts.join(" and ")}.` : "";
}

export function removeEntry(id) {
  const index = state.entries.findIndex((e) => e.id === id);
  if (index === -1) return;
  const [entry] = state.entries.splice(index, 1);
  clearDownload(entry);
  render();
}

function finish(entry, status, detail) {
  entry.status = status;
  entry.detail = detail;
  if (status !== "password") entry.bytes = null;
  render();
}

async function checkAndUnlock(entry) {
  entry.detail = "Checking…";
  render();
  try {
    entry.bytes = new Uint8Array(await entry.file.arrayBuffer());
    const { exitCode, lines } = await runQpdf(entry.bytes, [
      "--show-encryption",
      "/input.pdf",
    ]);
    if (exitCode !== 0 && lines.some((l) => /password/i.test(l))) {
      finish(entry, "password", "Password-protected");
      return;
    }
    if (lines.some((l) => l.includes("not encrypted"))) {
      // Decrypting would only produce a rewritten copy of an already open file.
      finish(entry, "unencrypted", "Not encrypted — nothing to do");
      return;
    }
    entry.permissions = Object.fromEntries(
      lines
        .map((l) => l.match(/^(.+?)\s*[=:]\s*(.*)$/))
        .filter(Boolean)
        .map((m) => [m[1].trim(), m[2].trim()]),
    );
  } catch (err) {
    finish(entry, "error", err.message || "Could not read file");
    return;
  }
  // Only an owner password is set; it restricts permissions but qpdf can drop it.
  await decrypt(entry, "");
}

async function decrypt(entry, password) {
  entry.status = "checking";
  entry.detail = "Decrypting…";
  render();

  const args = ["--decrypt", "/input.pdf", "/output.pdf"];
  if (password) args.unshift("--password=" + password);

  let output;
  try {
    const { exitCode, lines, instance } = await runQpdf(entry.bytes, args);
    // Exit code 3 means qpdf recovered from warnings and still wrote the file.
    if (exitCode !== 0 && exitCode !== 3) {
      throw new Error(qpdfError(lines, exitCode));
    }
    output = instance.FS.readFile("/output.pdf");
    if (output.length === 0) throw new Error("qpdf produced an empty file");
  } catch (err) {
    // With a typed password the file stays retryable; the automatic attempt is final.
    finish(
      entry,
      password ? "password" : "error",
      err.message || "Decryption failed",
    );
    return;
  }

  clearDownload(entry);
  entry.outName = entry.file.name.replace(/\.pdf$/i, "") + "_unlocked.pdf";
  entry.downloadUrl = URL.createObjectURL(
    new Blob([output], { type: "application/pdf" }),
  );
  finish(entry, "unlocked", "Unlocked");
  triggerDownload(entry);
}

function qpdfError(lines, exitCode) {
  if (lines.some((l) => /invalid password/i.test(l))) return "Wrong password";
  // qpdf prefixes messages with the wasm program name and the virtual input path.
  const message = lines
    .map((l) => l.replace(/^this\.program: (\/input\.pdf: )?/, "").trim())
    .filter(Boolean)
    .join("\n");
  return message || `qpdf exited with code ${exitCode}`;
}

export function unlockWithPassword() {
  const password = passwordInput.value;
  // An empty attempt can only fail and would turn the files into errors.
  if (!password) return;
  const pending = state.entries.filter((e) => e.status === "password");
  if (pending.length === 0) return;

  // Leave the "password" state before queueing so a repeated submit while the queue is
  // busy cannot decrypt (and download) the same file twice.
  for (const entry of pending) {
    entry.status = "checking";
    entry.detail = "Queued…";
  }
  render();
  for (const entry of pending) enqueue(() => decrypt(entry, password));
  enqueue(() => {
    // Keep the password for a retry; drop it once no file needs it any more.
    if (!state.entries.some((e) => e.status === "password")) {
      passwordInput.value = "";
    }
  });
}

function triggerDownload(entry) {
  const link = document.createElement("a");
  link.href = entry.downloadUrl;
  link.download = entry.outName;
  // Some browsers ignore programmatic clicks on detached anchors.
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function clearDownload(entry) {
  if (!entry.downloadUrl) return;
  // Object URLs pin their Blob in memory until revoked.
  URL.revokeObjectURL(entry.downloadUrl);
  entry.downloadUrl = null;
}
