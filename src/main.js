import createModule from "@neslinesli93/qpdf-wasm";
import wasmUrl from "@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url";

const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const passwordInput = document.getElementById("password");
const unlockBtn = document.getElementById("unlock-btn");
const statusEl = document.getElementById("status");
const downloadContainer = document.getElementById("download-container");

let selectedFile = null;

function setStatus(text, type = "") {
  statusEl.textContent = text;
  statusEl.className = "status " + type;
}

function setFile(file) {
  if (!file || file.type !== "application/pdf") {
    setStatus("Please select a PDF file.", "error");
    return;
  }
  selectedFile = file;
  dropZone.innerHTML = `<p class="filename">${file.name}</p><p>${(file.size / 1024).toFixed(1)} KB</p>`;
  dropZone.classList.add("has-file");
  unlockBtn.disabled = false;
  downloadContainer.innerHTML = "";
  setStatus("");
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
    const errors = [];
    const instance = await createModule({
      locateFile: () => wasmUrl,
      print: () => {},
      printErr: (text) => errors.push(text),
    });

    setStatus("Decrypting…", "loading");

    const buffer = await selectedFile.arrayBuffer();
    instance.FS.writeFile("/input.pdf", new Uint8Array(buffer));

    const args = ["--decrypt", "/input.pdf", "/output.pdf"];
    const password = passwordInput.value;
    if (password) {
      args.unshift("--password=" + password);
    }

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

    if (exitCode !== 0) {
      const msg = errors.join("\n").trim();
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
