import createModule from "@neslinesli93/qpdf-wasm";
import wasmUrl from "@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url";

const card = document.getElementById("card");
const dropZone = document.getElementById("drop-zone");
const dropHint = document.getElementById("drop-hint");
const fileInput = document.getElementById("file-input");
const fileList = document.getElementById("file-list");
const passwordInput = document.getElementById("password");
const unlockBtn = document.getElementById("unlock-btn");
const statusEl = document.getElementById("status");
const downloadContainer = document.getElementById("download-container");
const passwordRow = document.querySelector(".password-row");
const downloadHint = document.getElementById("download-hint");
const passwordLabel = passwordRow.querySelector("label");

// Each entry: { id, file, bytes, status, detail, permissions, downloadUrl, outName }
// status: "checking" | "unencrypted" | "unlocked" | "password" | "error"
const entries = [];
let nextId = 1;

// Sequential job queue so files dropped mid-run are handled in order.
const queue = [];
let processing = false;
// Entries whose download should be started once rendering is done.
const autoDownloads = [];

function setStatus(text, type = "") {
  statusEl.textContent = text;
  statusEl.className = "status " + type;
}

// Emscripten hardcodes console.log.bind(console) at init time,
// so we must intercept before module creation.
let capturedLines = null;
const _log = console.log;
const _err = console.error;
console.log = (...a) =>
  capturedLines ? capturedLines.push(a.join(" ")) : _log(...a);
console.error = (...a) =>
  capturedLines ? capturedLines.push(a.join(" ")) : _err(...a);

// One lazily-created qpdf instance is reused for every file: instantiating the
// wasm module costs far more than a run, and batches can be dozens of files.
let qpdfInstance = null;

async function getQpdfInstance() {
  if (!qpdfInstance) {
    qpdfInstance = createModule({ locateFile: () => wasmUrl }).catch((err) => {
      qpdfInstance = null;
      throw err;
    });
  }
  return qpdfInstance;
}

async function runQpdf(bytes, args) {
  const lines = [];
  capturedLines = lines;
  try {
    const instance = await getQpdfInstance();
    // Clear leftovers from the previous run so outputs are never stale.
    for (const path of ["/input.pdf", "/output.pdf"]) {
      try {
        instance.FS.unlink(path);
      } catch {
        // file did not exist
      }
    }
    instance.FS.writeFile("/input.pdf", bytes);
    let exitCode;
    try {
      exitCode = instance.callMain(args);
    } catch (e) {
      exitCode = e?.status ?? -1;
    }
    return { exitCode, lines, instance };
  } finally {
    capturedLines = null;
  }
}

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

function escapeHtml(str) {
  return String(str).replace(
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

/* ---------------- rendering ---------------- */

function render() {
  const hasFiles = entries.length > 0;
  dropZone.classList.toggle("has-file", hasFiles);
  dropHint.textContent = hasFiles
    ? "Drop more PDFs here or click to select"
    : "Drop PDFs here or click to select";
  fileList.hidden = !hasFiles;

  fileList.innerHTML = entries
    .map((entry) => {
      const permissionLines = PERMISSIONS.filter((p) => entry.permissions[p])
        .map((p) => {
          const cls =
            entry.permissions[p] === "allowed" ? "allowed" : "restricted";
          return `<div><span class="label">${escapeHtml(p)}:</span> <span class="${cls}">${escapeHtml(entry.permissions[p])}</span></div>`;
        })
        .join("");

      return `
        <div class="file-row" data-id="${entry.id}">
          <div class="file-main">
            <div class="file-name">${escapeHtml(entry.file.name)}</div>
            <div class="file-meta">${formatSize(entry.file.size)}${
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
            ${processing ? "disabled" : ""}
          >&times;</button>
        </div>`;
    })
    .join("");

  const needsPassword = entries.filter((e) => e.status === "password");
  passwordRow.hidden = needsPassword.length === 0;
  passwordLabel.textContent =
    needsPassword.length > 1
      ? `Password (used for all ${needsPassword.length} protected files)`
      : "Password";
  unlockBtn.hidden = needsPassword.length === 0;
  unlockBtn.disabled = needsPassword.length === 0;

  renderDownloads();
  renderSummary();
}

function renderDownloads() {
  downloadContainer.innerHTML = "";
  for (const entry of entries) {
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

function renderSummary() {
  const unlocked = entries.filter((e) => e.downloadUrl);
  const failed = entries.filter((e) => e.status === "error");
  const pending = entries.filter((e) => e.status === "password");

  if (entries.length === 0) {
    setStatus("");
    return;
  }
  if (processing) {
    setStatus("Working…", "loading");
    return;
  }
  if (failed.length > 0 && unlocked.length > 0) {
    setStatus(
      `Unlocked ${unlocked.length}/${entries.length} PDFs. ${failed.length} failed.`,
      "error",
    );
    return;
  }
  if (failed.length > 0) {
    setStatus(failed[0].detail || "Unlocking failed.", "error");
    return;
  }
  if (pending.length > 0) {
    setStatus(
      pending.length === 1
        ? "Enter the password for the protected PDF."
        : `Enter the password for the ${pending.length} protected PDFs.`,
      "loading",
    );
    return;
  }
  if (unlocked.length > 0) {
    setStatus(
      unlocked.length === 1
        ? "Done! Download started."
        : `Done! Unlocked ${unlocked.length} PDFs — downloads started.`,
      "success",
    );
    return;
  }
  setStatus("Nothing to unlock — no encrypted PDFs.", "loading");
}

/* ---------------- processing ---------------- */

function enqueue(task) {
  queue.push(task);
  pump();
}

async function pump() {
  if (processing) return;
  processing = true;
  render();

  while (queue.length > 0) {
    const task = queue.shift();
    try {
      await task();
    } catch (err) {
      console.error(err);
    }
  }

  processing = false;
  render();
}

function triggerDownload(entry) {
  const link = document.createElement("a");
  link.href = entry.downloadUrl;
  link.download = entry.outName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function clearDownload(entry) {
  if (entry.downloadUrl) {
    URL.revokeObjectURL(entry.downloadUrl);
    entry.downloadUrl = null;
    entry.outName = "";
  }
}

async function checkAndUnlock(entry) {
  entry.status = "checking";
  entry.detail = "Checking…";
  entry.permissions = {};
  render();

  let lines;
  try {
    entry.bytes = new Uint8Array(await entry.file.arrayBuffer());
    const result = await runQpdf(entry.bytes, [
      "--show-encryption",
      "/input.pdf",
    ]);
    lines = result.lines;

    if (result.exitCode !== 0 && lines.some((l) => /password/i.test(l))) {
      entry.status = "password";
      entry.detail = "Password-protected";
      render();
      return;
    }

    if (lines.some((l) => l.includes("not encrypted"))) {
      entry.status = "unencrypted";
      entry.detail = "Not encrypted — nothing to do";
      render();
      return;
    }

    entry.permissions = Object.fromEntries(
      lines
        .map((l) => l.match(/^(.+?)\s*[=:]\s*(.*)$/))
        .filter(Boolean)
        .map((m) => [m[1].trim(), m[2].trim()]),
    );
  } catch (err) {
    entry.status = "error";
    entry.detail = err.message || "Could not read file";
    render();
    return;
  }

  // Encrypted without a user password: unlock it straight away.
  await decrypt(entry, "");
}

async function decrypt(entry, password) {
  entry.detail = "Decrypting…";
  entry.status = "checking";
  render();

  try {
    const args = ["--decrypt", "/input.pdf", "/output.pdf"];
    if (password) args.unshift("--password=" + password);

    const { exitCode, lines, instance } = await runQpdf(entry.bytes, args);

    if (exitCode !== 0 && exitCode !== 3) {
      throw new Error(
        lines.join("\n").trim() || `qpdf exited with code ${exitCode}`,
      );
    }

    const output = instance.FS.readFile("/output.pdf");
    if (!output || output.length === 0) {
      throw new Error("qpdf produced an empty file");
    }

    clearDownload(entry);
    entry.outName = entry.file.name.replace(/\.pdf$/i, "") + "_unlocked.pdf";
    entry.downloadUrl = URL.createObjectURL(
      new Blob([output], { type: "application/pdf" }),
    );
    entry.status = "unlocked";
    entry.detail = "Unlocked";
    autoDownloads.push(entry);
  } catch (err) {
    entry.status = password ? "password" : "error";
    entry.detail = err.message || "Decryption failed";
  }

  render();

  // Download outside the render pass so the link also exists in the list.
  for (const done of autoDownloads.splice(0)) triggerDownload(done);
}

/* ---------------- file intake ---------------- */

function addFiles(fileListLike) {
  const incoming = Array.from(fileListLike);
  if (incoming.length === 0) return;

  const rejected = [];
  const added = [];

  for (const file of incoming) {
    const isPdf =
      file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      rejected.push(file.name);
      continue;
    }
    const duplicate = entries.some(
      (e) => e.file.name === file.name && e.file.size === file.size,
    );
    if (duplicate) continue;

    const entry = {
      id: nextId++,
      file,
      bytes: null,
      status: "checking",
      detail: "Queued…",
      permissions: {},
      downloadUrl: null,
      outName: "",
    };
    entries.push(entry);
    added.push(entry);
  }

  render();

  if (rejected.length > 0) {
    setStatus(
      `Skipped ${rejected.length} non-PDF file${rejected.length > 1 ? "s" : ""}.`,
      "error",
    );
  }

  for (const entry of added) {
    enqueue(() => checkAndUnlock(entry));
  }
}

function removeEntry(id) {
  const index = entries.findIndex((e) => e.id === id);
  if (index === -1) return;
  const [entry] = entries.splice(index, 1);
  clearDownload(entry);
  render();
}

function unlockWithPassword() {
  const pending = entries.filter((e) => e.status === "password");
  if (pending.length === 0) return;
  const password = passwordInput.value;
  for (const entry of pending) {
    enqueue(() => decrypt(entry, password));
  }
}

/* ---------------- events ---------------- */

dropZone.addEventListener("click", () => fileInput.click());

fileList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-remove]");
  if (btn) {
    e.stopPropagation();
    removeEntry(Number(btn.dataset.remove));
  }
});

// Accept a drop anywhere on the card, but highlight the drop zone.
card.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

card.addEventListener("dragleave", (e) => {
  if (e.target === card && !card.contains(e.relatedTarget)) {
    dropZone.classList.remove("dragover");
  }
});

card.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
});

fileInput.addEventListener("change", () => {
  if (fileInput.files?.length) addFiles(fileInput.files);
  fileInput.value = "";
});

unlockBtn.addEventListener("click", unlockWithPassword);

passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") unlockWithPassword();
});

render();
