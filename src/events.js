/**
 * events.js
 *
 * All DOM event wiring in one place.
 *
 * `initEvents()` is called exactly once from `main.js`. Keeping the listeners together
 * makes the supported interaction surface easy to survey: click-to-select, drag & drop,
 * per-row removal, password submission (button + Enter) and the file input change.
 */

import {
  card,
  dropZone,
  fileInput,
  fileList,
  unlockBtn,
  passwordInput,
} from "./dom.js";
import { addFiles, removeEntry } from "./files.js";
import { unlockWithPassword } from "./unlock.js";

/**
 * Attach every event listener the widget needs.
 *
 * @returns {void}
 */
export function initEvents() {
  // Clicking anywhere on the drop zone opens the hidden file picker.
  dropZone.addEventListener("click", () => fileInput.click());

  // Delegated removal: the list is re-rendered wholesale, so a single listener on the
  // container survives every re-render.
  fileList.addEventListener("click", (e) => {
    // Find the closest remove button for the clicked target (the × is a text node).
    const btn = e.target.closest("[data-remove]");
    if (btn) {
      // Prevent the click from bubbling to the drop zone / card handlers.
      e.stopPropagation();
      // The id is stored as a string in the data attribute.
      removeEntry(Number(btn.dataset.remove));
    }
  });

  // Accept a drop anywhere on the card, but highlight the drop zone.
  card.addEventListener("dragover", (e) => {
    // Without preventDefault the browser navigates to the dropped file.
    e.preventDefault();
    // Visual affordance while a drag hovers the card.
    dropZone.classList.add("dragover");
  });

  // Remove the highlight when the pointer leaves the card entirely.
  card.addEventListener("dragleave", (e) => {
    // Ignore transitions between child elements inside the card.
    if (e.target === card && !card.contains(e.relatedTarget)) {
      dropZone.classList.remove("dragover");
    }
  });

  // Handle the actual drop.
  card.addEventListener("drop", (e) => {
    // Stop the browser from opening the file itself.
    e.preventDefault();
    // Drop ends the drag state regardless of the outcome.
    dropZone.classList.remove("dragover");
    // Hand the dropped files to the intake pipeline (if there are any).
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  });

  // Files chosen through the hidden picker.
  fileInput.addEventListener("change", () => {
    // Same intake path as drag & drop.
    if (fileInput.files?.length) addFiles(fileInput.files);
    // Reset the input so selecting the same file again fires `change` anew.
    fileInput.value = "";
  });

  // Apply the typed password to all pending files.
  unlockBtn.addEventListener("click", unlockWithPassword);

  // Pressing Enter in the password field behaves like clicking Unlock.
  passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") unlockWithPassword();
  });
}
