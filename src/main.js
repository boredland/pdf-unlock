import createModule from "@neslinesli93/qpdf-wasm";
import wasmUrl from "@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url";

const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const passwordInput = document.getElementById("password");
const unlockBtn = document.getElementById("unlock-btn");
const statusEl = document.getElementById("status");
const downloadContainer = document.getElementById("download-container");
const encryptionInfo = document.getElementById("encryption-info");
const passwordRow = document.querySelector(".password-row");

let selectedFile = null;
let pdfBytes = null;

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

async function runQpdf(bytes, args) {
  const lines = [];
  capturedLines = lines;
  try {
    const instance = await createModule({ locateFile: () => wasmUrl });
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

async function checkEncryption(file) {
  encryptionInfo.hidden = true;
  passwordRow.hidden = true;
  unlockBtn.disabled = true;

  setStatus("Checking encryption…", "loading");
  pdfBytes = new Uint8Array(await file.arrayBuffer());
  const { exitCode, lines } = await runQpdf(pdfBytes, [
    "--show-encryption",
    "/input.pdf",
  ]);
  setStatus("");

  if (exitCode !== 0 && lines.some((l) => /password/i.test(l))) {
    encryptionInfo.innerHTML =
      '<span class="value">File is password-protected</span>';
    encryptionInfo.hidden = false;
    passwordRow.hidden = false;
    unlockBtn.disabled = false;
    return;
  }

  if (lines.some((l) => l.includes("not encrypted"))) {
    encryptionInfo.innerHTML =
      '<span class="not-encrypted">File is not encrypted</span>';
    encryptionInfo.hidden = false;
    return;
  }

  const info = Object.fromEntries(
    lines
      .map((l) => l.match(/^(.+?)\s*[=:]\s*(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1].trim(), m[2].trim()]),
  );

  encryptionInfo.innerHTML = PERMISSIONS.filter((p) => info[p])
    .map((p) => {
      const cls = info[p] === "allowed" ? "allowed" : "restricted";
      return `<span class="label">${p}:</span> <span class="${cls}">${info[p]}</span>`;
    })
    .join("<br>");
  encryptionInfo.hidden = false;
  unlockBtn.disabled = false;
}

function setFile(file) {
  if (!file || file.type !== "application/pdf") {
    setStatus("Please select a PDF file.", "error");
    return;
  }
  selectedFile = file;
  dropZone.innerHTML = `<p class="filename">${file.name}</p><p>${(file.size / 1024).toFixed(1)} KB</p>`;
  dropZone.classList.add("has-file");
  downloadContainer.innerHTML = "";
  setStatus("");
  checkEncryption(file);
}

dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
});

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) setFile(fileInput.files[0]);
});

unlockBtn.addEventListener("click", async () => {
  if (!selectedFile || !pdfBytes) return;

  unlockBtn.disabled = true;
  downloadContainer.innerHTML = "";

  try {
    const args = ["--decrypt", "/input.pdf", "/output.pdf"];
    if (passwordInput.value) {
      args.unshift("--password=" + passwordInput.value);
    }

    setStatus("Decrypting…", "loading");
    const { exitCode, lines, instance } = await runQpdf(pdfBytes, args);

    if (exitCode !== 0 && exitCode !== 3) {
      throw new Error(lines.join("\n").trim() || `qpdf exited with code ${exitCode}`);
    }

    const output = instance.FS.readFile("/output.pdf");
    const blob = new Blob([output], { type: "application/pdf" });
    const outName = selectedFile.name.replace(/\.pdf$/i, "") + "_unlocked.pdf";

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = outName;
    link.className = "btn btn-download";
    link.textContent = "Download " + outName;
    downloadContainer.appendChild(link);

    setStatus("Done!", "success");
  } catch (err) {
    setStatus(err.message || "Decryption failed.", "error");
  } finally {
    unlockBtn.disabled = false;
  }
});
