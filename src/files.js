/**
 * files.js
 *
 * File intake and removal: everything that changes the *set* of tracked entries.
 *
 * `addFiles()` validates and deduplicates incoming files, registers new entries and hands
 * each one to the job queue. `removeEntry()` is the inverse and also releases the Blob URL
 * held by the removed entry.
 */

import { state } from "./state.js";
import { render, setStatus } from "./render.js";
import { clearDownload } from "./download.js";
import { enqueue } from "./queue.js";
import { checkAndUnlock } from "./unlock.js";

/**
 * Register files from an `<input>` or a drop event.
 *
 * Non-PDF files are skipped with a status message; files that are already tracked
 * (same name and size) are ignored silently. Every accepted file starts the
 * inspect-then-unlock pipeline.
 *
 * @param {FileList|File[]} fileListLike Files from an input element or a drop event.
 * @returns {void}
 */
export function addFiles(fileListLike) {
  // Normalise to a plain array so it can be iterated and measured.
  const incoming = Array.from(fileListLike);
  // Nothing was actually provided (e.g. cancelled file dialog).
  if (incoming.length === 0) return;

  // Names of files that were rejected as "not a PDF".
  const rejected = [];
  // Entries created during this call, queued after the DOM was updated.
  const added = [];

  for (const file of incoming) {
    // Trust both the MIME type and the extension; some systems report an empty type.
    const isPdf =
      file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      // Remember it so the user can be told how many files were skipped.
      rejected.push(file.name);
      continue;
    }
    // Skip files that are already in the list (same name *and* same size).
    const duplicate = state.entries.some(
      (e) => e.file.name === file.name && e.file.size === file.size,
    );
    if (duplicate) continue;

    // Build the entry in its "waiting in the queue" shape.
    const entry = {
      id: state.nextId++, // stable, never-reused id for the data attributes
      file, // original File object (name + size are displayed from it)
      bytes: null, // filled when the queue reaches this entry
      status: "checking", // pipeline starts here
      detail: "Queued…", // shown until processing begins
      permissions: {}, // parsed later from `--show-encryption`
      downloadUrl: null, // set once decryption succeeded
      outName: "", // download file name, set alongside downloadUrl
    };
    // Register the entry so `render()` can show a row for it.
    state.entries.push(entry);
    // Track it for the enqueue step below.
    added.push(entry);
  }

  // Show the new rows (and the drop zone's "has file" look) immediately.
  render();

  // Tell the user about skipped non-PDF files, if any.
  if (rejected.length > 0) {
    setStatus(
      `Skipped ${rejected.length} non-PDF file${rejected.length > 1 ? "s" : ""}.`,
      "error",
    );
  }

  // Enqueue each accepted file; the queue serialises the actual qpdf runs.
  for (const entry of added) {
    enqueue(() => checkAndUnlock(entry));
  }
}

/**
 * Remove a tracked entry by id and free the resources attached to it.
 *
 * @param {number} id Entry id taken from the `data-remove` attribute.
 * @returns {void}
 */
export function removeEntry(id) {
  // Locate the entry in the list.
  const index = state.entries.findIndex((e) => e.id === id);
  // Unknown id (e.g. double click after removal) — nothing to do.
  if (index === -1) return;
  // Detach it from the list and keep a reference for cleanup.
  const [entry] = state.entries.splice(index, 1);
  // Revoke the Blob URL so the decrypted bytes are released from memory.
  clearDownload(entry);
  // Repaint the list and the summary without the entry.
  render();
}
