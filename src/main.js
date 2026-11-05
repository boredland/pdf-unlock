import {
  render,
  card,
  dropZone,
  fileInput,
  fileList,
  unlockBtn,
  passwordInput,
} from "./render.js";
import { addFiles, removeEntry, unlockWithPassword } from "./unlock.js";

dropZone.addEventListener("click", () => fileInput.click());

// Rows are re-rendered wholesale, so removal is delegated to the container.
fileList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-remove]");
  if (!btn) return;
  e.stopPropagation();
  removeEntry(Number(btn.dataset.remove));
});

// The whole card accepts drops so a new batch never needs precise aim.
card.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

card.addEventListener("dragleave", (e) => {
  // dragleave also fires when moving between children; only react on leaving the card.
  if (!card.contains(e.relatedTarget)) dropZone.classList.remove("dragover");
});

card.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
});

fileInput.addEventListener("change", () => {
  if (fileInput.files?.length) addFiles(fileInput.files);
  // Reset so picking the same file again still fires `change`.
  fileInput.value = "";
});

unlockBtn.addEventListener("click", unlockWithPassword);
passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") unlockWithPassword();
});

render();
