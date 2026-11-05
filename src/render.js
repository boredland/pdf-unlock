/**
 * render.js
 *
 * All DOM writing lives here. The rest of the app mutates the entry objects in
 * `state.js` and then calls `render()`; it never manipulates the UI directly.
 *
 * Layout of the rendered widget, top to bottom:
 *   drop zone → file rows → password row + unlock button → status → download links
 */

import {
  dropZone,
  dropHint,
  fileList,
  passwordRow,
  passwordLabel,
  unlockBtn,
  statusEl,
  downloadContainer,
  downloadHint,
} from "./dom.js";
import { state } from "./state.js";
import { PERMISSIONS, escapeHtml, formatSize } from "./format.js";

/**
 * Write the single-line status message and its colour variant.
 *
 * @param {string} text Message to display (empty string clears the line).
 * @param {""|"error"|"success"|"loading"} [type] CSS modifier applied as `status <type>`.
 * @returns {void}
 */
export function setStatus(text, type = "") {
  // Replace the message text.
  statusEl.textContent = text;
  // Swap the class list so exactly one variant style is active.
  statusEl.className = "status " + type;
}

/* ---------------- rendering ---------------- */

/**
 * Re-render the whole widget from the current state.
 *
 * Called after every state change; it is cheap because the list is small and the markup
 * is regenerated wholesale (no diffing needed).
 *
 * @returns {void}
 */
export function render() {
  // Any tracked file means the drop zone leaves its "empty" look.
  const hasFiles = state.entries.length > 0;
  // Green border / smaller padding once files exist.
  dropZone.classList.toggle("has-file", hasFiles);
  // Reassure the user that dropping more files is still possible.
  dropHint.textContent = hasFiles
    ? "Drop more PDFs here or click to select"
    : "Drop PDFs here or click to select";
  // Hide the (empty) list container entirely when there is nothing to show.
  fileList.hidden = !hasFiles;

  // Rebuild every file row from scratch, escaping all user-controlled text.
  fileList.innerHTML = state.entries
    .map((entry) => {
      // Permission rows: only permissions that qpdf actually reported are shown.
      const permissionLines = PERMISSIONS.filter((p) => entry.permissions[p])
        .map((p) => {
          // Green when the permission is granted, red when restricted.
          const cls =
            entry.permissions[p] === "allowed" ? "allowed" : "restricted";
          // One `label: value` line per reported permission.
          return `<div><span class="label">${escapeHtml(p)}:</span> <span class="${cls}">${escapeHtml(entry.permissions[p])}</span></div>`;
        })
        .join("");

      return `
        <div class="file-row" data-id="${entry.id}">
          <div class="file-main">
            <div class="file-name">${escapeHtml(entry.file.name)}</div>
            <div class="file-meta">${formatSize(entry.file.size)}${
              // Status suffix is appended to the size only when there is something to say.
              entry.detail
                ? ` · <span class="file-status ${entry.status}">${escapeHtml(entry.detail)}</span>`
                : ""
            }</div>
            ${permissionLines ? `<div class="file-permissions">${permissionLines}</div>` : ""}
          </div>
          <button
            class="file-remove"
            type="button"
            data-remove="${entry.id}"
            title="Remove"
            aria-label="Remove ${escapeHtml(entry.file.name)}"
            ${state.processing ? "disabled" : ""}
          >&times;</button>
        </div>`;
    })
    .join("");

  // Entries still waiting for a password drive the password UI.
  const needsPassword = state.entries.filter((e) => e.status === "password");
  // Show the password row only when at least one file needs one.
  passwordRow.hidden = needsPassword.length === 0;
  // Clarify that a single password is applied to all protected files in the batch.
  passwordLabel.textContent =
    needsPassword.length > 1
      ? `Password (used for all ${needsPassword.length} protected files)`
      : "Password";
  // The unlock button is only meaningful together with pending protected files.
  unlockBtn.hidden = needsPassword.length === 0;
  unlockBtn.disabled = needsPassword.length === 0;

  // Download links and the status line are derived from the same state snapshot.
  renderDownloads();
  renderSummary();
}

/**
 * Render one download link per successfully unlocked entry.
 *
 * @returns {void}
 */
export function renderDownloads() {
  // Wipe the previous links (their Blob URLs are still owned by the entries).
  downloadContainer.innerHTML = "";
  for (const entry of state.entries) {
    // Skip entries that have no finished output yet.
    if (!entry.downloadUrl) continue;
    // Build the link element manually (no innerHTML needed here).
    const link = document.createElement("a");
    // Blob URL of the unlocked PDF.
    link.href = entry.downloadUrl;
    // Proposed file name when the user clicks it.
    link.download = entry.outName;
    // Reuse the green button styling.
    link.className = "btn btn-download";
    // Label names the exact output file.
    link.textContent = "Download " + entry.outName;
    // Append to the container.
    downloadContainer.appendChild(link);
  }
  // The "downloads may be blocked" hint is only relevant when links exist.
  downloadHint.hidden = downloadContainer.children.length === 0;
}

/**
 * Render the global status message from the aggregate entry state.
 *
 * The order of the checks defines precedence: processing beats failures, failures beat
 * pending passwords, pending passwords beat success.
 *
 * @returns {void}
 */
export function renderSummary() {
  // Entries that produced a downloadable file.
  const unlocked = state.entries.filter((e) => e.downloadUrl);
  // Entries that ended in an error.
  const failed = state.entries.filter((e) => e.status === "error");
  // Entries that are encrypted with a user password.
  const pending = state.entries.filter((e) => e.status === "password");

  // Nothing tracked: clear the status line and stop.
  if (state.entries.length === 0) {
    setStatus("");
    return;
  }
  // Work in progress takes priority over any per-file outcome.
  if (state.processing) {
    setStatus("Working…", "loading");
    return;
  }
  // Mixed outcome: report the success ratio plus how many files failed.
  if (failed.length > 0 && unlocked.length > 0) {
    setStatus(
      `Unlocked ${unlocked.length}/${state.entries.length} PDFs. ${failed.length} failed.`,
      "error",
    );
    return;
  }
  // Only failures: surface the first concrete error message.
  if (failed.length > 0) {
    setStatus(failed[0].detail || "Unlocking failed.", "error");
    return;
  }
  // Files are waiting for a password: prompt for it (singular/plural aware).
  if (pending.length > 0) {
    setStatus(
      pending.length === 1
        ? "Enter the password for the protected PDF."
        : `Enter the password for the ${pending.length} protected PDFs.`,
      "loading",
    );
    return;
  }
  // At least one file unlocked: confirm that downloads were started.
  if (unlocked.length > 0) {
    setStatus(
      unlocked.length === 1
        ? "Done! Download started."
        : `Done! Unlocked ${unlocked.length} PDFs — downloads started.`,
      "success",
    );
    return;
  }
  // Fallback: files were added but none of them is encrypted.
  setStatus("Nothing to unlock — no encrypted PDFs.", "loading");
}
