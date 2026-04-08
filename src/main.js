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

function setStatus(text, type = "") {
  statusEl.textContent = text;
  statusEl.className = "status " + type;
}

async function runQpdf(pdfBytes, args) {
  const stdout = [];
  const stderr = [];
  const instance = await createModule({
    locateFile: () => wasmUrl,
    print: (text) => stdout.push(text),
    printErr: (text) => stderr.push(text),
  });

  instance.FS.writeFile("/input.pdf", pdfBytes);

  let exitCode;
  try {
    exitCode = instance.callMain(args);
  } catch (e) {
    if (e && typeof e === "object" && "status" in e) {
      exitCode = e.status;
    } else {
      throw e;
    }
  }

  return { exitCode, stdout, stderr, instance };
}

function renderEncryptionInfo(lines, needsPassword) {
  passwordRow.classList.remove("visible");

  if (needsPassword) {
    encryptionInfo.innerHTML =
      '<span class="value">File is password-protected</span>';
    encryptionInfo.classList.add("visible");
    passwordRow.classList.add("visible");
    unlockBtn.disabled = false;
    return;
  }

  const info = {};
  for (const line of lines) {
    const match = line.match(/^(.+?)\s*[=:]\s*(.*)$/);
    if (match) info[match[1].trim()] = match[2].trim();
  }

  if (lines.some((l) => l.includes("not encrypted"))) {
    encryptionInfo.innerHTML =
      '<span class="not-encrypted">File is not encrypted</span>';
    encryptionInfo.classList.add("visible");
    unlockBtn.disabled = true;
    return;
  }

  const permissions = [
    "extract for accessibility",
    "extract for any purpose",
    "print low resolution",
    "print high resolution",
    "modify document assembly",
    "modify forms",
    "modify annotations",
    "modify other",
  ];

  const permHtml = permissions
    .filter((p) => info[p])
    .map((p) => {
      const val = info[p];
      const cls = val === "allowed" ? "allowed" : "restricted";
      return `<span class="label">${p}:</span> <span class="${cls}">${val}</span>`;
    })
    .join("<br>");

  let html = "";
  if (permHtml) html += `<div>${permHtml}</div>`;

  encryptionInfo.innerHTML = html;
  encryptionInfo.classList.add("visible");
  unlockBtn.disabled = false;
}

async function checkEncryption(file) {
  encryptionInfo.classList.remove("visible");
  encryptionInfo.innerHTML = "";
  passwordRow.classList.remove("visible");

  try {
    setStatus("Checking encryption…", "loading");
    const buffer = await file.arrayBuffer();
    const pdfBytes = new Uint8Array(buffer);
    const { exitCode, stdout, stderr } = await runQpdf(pdfBytes, [
      "--show-encryption",
      "/input.pdf",
    ]);
    const allOutput = [...stdout, ...stderr];
    const needsPassword =
      exitCode !== 0 &&
      allOutput.some((l) => /password/i.test(l));
    renderEncryptionInfo(allOutput, needsPassword);
    setStatus("");
  } catch {
    setStatus("");
  }
}

function setFile(file) {
  if (!file || file.type !== "application/pdf") {
    setStatus("Please select a PDF file.", "error");
    return;
  }
  selectedFile = file;
  dropZone.innerHTML = `<p class="filename">${file.name}</p><p>${(file.size / 1024).toFixed(1)} KB</p>`;
  dropZone.classList.add("has-file");
  unlockBtn.disabled = true;
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
  const file = e.dataTransfer.files[0];
  if (file) setFile(file);
});

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) setFile(fileInput.files[0]);
});

unlockBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  unlockBtn.disabled = true;
  downloadContainer.innerHTML = "";
  setStatus("Loading WASM engine…", "loading");

  try {
    const buffer = await selectedFile.arrayBuffer();
    const pdfBytes = new Uint8Array(buffer);

    const args = ["--decrypt", "/input.pdf", "/output.pdf"];
    const password = passwordInput.value;
    if (password) {
      args.unshift("--password=" + password);
    }

    setStatus("Decrypting…", "loading");
    const { exitCode, stderr, instance } = await runQpdf(pdfBytes, args);

    if (exitCode !== 0) {
      const msg = stderr.join("\n").trim();
      throw new Error(msg || `qpdf exited with code ${exitCode}`);
    }

    const output = instance.FS.readFile("/output.pdf");
    const blob = new Blob([output], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    const outName = selectedFile.name.replace(/\.pdf$/i, "") + "_unlocked.pdf";

    downloadContainer.innerHTML = "";
    const link = document.createElement("a");
    link.href = url;
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
