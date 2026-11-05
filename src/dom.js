/**
 * dom.js
 *
 * Single source of truth for every DOM node the app touches.
 *
 * Why a dedicated module?
 * - The markup lives in `index.html`, so element lookups are a cross-cutting concern.
 * - Capturing the references once here means no module has to repeat `getElementById`
 *   calls, and a renamed id only has to be fixed in one place.
 *
 * Every export is a live element reference resolved at import time (the script tag in
 * `index.html` is loaded after the markup, so all ids are guaranteed to exist).
 */

// Root card element. It also acts as the drag-and-drop surface for the whole widget,
// which is why the generic `card` id is needed in addition to `drop-zone`.
export const card = document.getElementById("card");

// The visible dashed rectangle users click or drop files onto.
export const dropZone = document.getElementById("drop-zone");

// Text inside the drop zone that changes once at least one file has been added.
export const dropHint = document.getElementById("drop-hint");

// Hidden `<input type="file" multiple>` triggered programmatically by clicks on the drop zone.
export const fileInput = document.getElementById("file-input");

// Container that holds one `.file-row` per queued/processed PDF.
export const fileList = document.getElementById("file-list");

// Password field shown only while at least one entry is password-protected.
export const passwordInput = document.getElementById("password");

// Primary action button that applies the entered password to all pending entries.
export const unlockBtn = document.getElementById("unlock-btn");

// Single-line status message area (success / error / progress feedback).
export const statusEl = document.getElementById("status");

// Container holding the "Download <name>" links for every unlocked PDF.
export const downloadContainer = document.getElementById("download-container");

// Wrapper row of the password label + input; shown/hidden as a unit.
export const passwordRow = document.querySelector(".password-row");

// Footnote explaining that downloads start automatically and may be blocked.
export const downloadHint = document.getElementById("download-hint");

// The `<label>` inside the password row; its text changes when several files need a password.
export const passwordLabel = passwordRow.querySelector("label");
