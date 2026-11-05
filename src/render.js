import { state } from "./state.js";

export const card = document.getElementById("card");
export const dropZone = document.getElementById("drop-zone");
export const fileInput = document.getElementById("file-input");
export const fileList = document.getElementById("file-list");
export const passwordInput = document.getElementById("password");
export const unlockBtn = document.getElementById("unlock-btn");
const dropHint = document.getElementById("drop-hint");
const passwordRow = document.querySelector(".password-row");
const passwordLabel = passwordRow.querySelector("label");
const statusEl = document.getElementById("status");
const noticeEl = document.getElementById("notice");
const downloadContainer = document.getElementById("download-container");
const downloadHint = document.getElementById("download-hint");

// Display order of the permissions reported by `qpdf --show-encryption`.
const PERMISSIONS = [
  "extract for accessibility",
  "extract for any purpose",
  "print low resolution",
  "print high resolution",
  "modify document assembly",
  "modify forms",
  "modify annotations",
  "modify other",
];

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

function formatSize(bytes) {
  return (bytes / 1024).toFixed(1) + " KB";
}

function setStatus(text, type = "") {
  statusEl.textContent = text;
  statusEl.className = "status " + type;
}

// The list is small, so every state change re-renders the whole widget.
export function render() {
  const hasFiles = state.entries.length > 0;
  dropZone.classList.toggle("has-file", hasFiles);
  dropHint.textContent = hasFiles
    ? "Drop more PDFs here or click to select"
    : "Drop PDFs here or click to select";
  fileList.hidden = !hasFiles;
  // File names and qpdf output are untrusted, so everything interpolated is escaped.
  fileList.innerHTML = state.entries.map(renderRow).join("");

  const needsPassword = state.entries.filter(
    (e) => e.status === "password",
  ).length;
  passwordRow.hidden = needsPassword === 0;
  unlockBtn.hidden = needsPassword === 0;
  passwordLabel.textContent =
    needsPassword > 1
      ? `Password (used for all ${needsPassword} protected files)`
      : "Password";

  noticeEl.textContent = state.notice;
  noticeEl.hidden = !state.notice;

  renderDownloads();
  renderSummary();
}

function renderRow(entry) {
  const permissions = PERMISSIONS.filter((p) => entry.permissions[p])
    .map((p) => {
      const cls = entry.permissions[p] === "allowed" ? "allowed" : "restricted";
      return `<div><span class="label">${escapeHtml(p)}:</span> <span class="${cls}">${escapeHtml(entry.permissions[p])}</span></div>`;
    })
    .join("");
  const status = entry.detail
    ? ` · <span class="file-status ${entry.status}">${escapeHtml(entry.detail)}</span>`
    : "";

  return `
    <div class="file-row">
      <div class="file-main">
        <div class="file-name">${escapeHtml(entry.file.name)}</div>
        <div class="file-meta">${formatSize(entry.file.size)}${status}</div>
        ${permissions ? `<div class="file-permissions">${permissions}</div>` : ""}
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
}

function renderDownloads() {
  downloadContainer.innerHTML = "";
  for (const entry of state.entries) {
    if (!entry.downloadUrl) continue;
    const link = document.createElement("a");
    link.href = entry.downloadUrl;
    link.download = entry.outName;
    link.className = "btn btn-download";
    link.textContent = "Download " + entry.outName;
    downloadContainer.appendChild(link);
  }
  downloadHint.hidden = downloadContainer.children.length === 0;
}

// Precedence: work in progress, then failures, then pending passwords, then success.
function renderSummary() {
  const unlocked = state.entries.filter((e) => e.downloadUrl);
  const failed = state.entries.filter((e) => e.status === "error");
  const pending = state.entries.filter((e) => e.status === "password");

  if (state.entries.length === 0) {
    setStatus("");
  } else if (state.processing) {
    setStatus("Working…", "loading");
  } else if (failed.length > 0 && unlocked.length > 0) {
    setStatus(
      `Unlocked ${unlocked.length}/${state.entries.length} PDFs. ${failed.length} failed.`,
      "error",
    );
  } else if (failed.length > 0) {
    setStatus(failed[0].detail || "Unlocking failed.", "error");
  } else if (pending.length > 0) {
    setStatus(
      pending.length === 1
        ? "Enter the password for the protected PDF."
        : `Enter the password for the ${pending.length} protected PDFs.`,
      "loading",
    );
  } else if (unlocked.length > 0) {
    setStatus(
      unlocked.length === 1
        ? "Done! Download started."
        : `Done! Unlocked ${unlocked.length} PDFs — downloads started.`,
      "success",
    );
  } else {
    setStatus("Nothing to unlock — no encrypted PDFs.", "loading");
  }
}
