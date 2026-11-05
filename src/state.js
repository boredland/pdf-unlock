/**
 * state.js
 *
 * Mutable application state, kept in one object so that every module reads and writes
 * the *same* bindings.
 *
 * Implementation note: primitive `let` exports cannot be reassigned by an importing
 * module in ES modules (only the declaring module may assign them), so the counters and
 * flags live as properties of a single exported `state` object instead of loose variables.
 */

/**
 * @typedef {Object} Entry
 * @property {number} id             Stable identifier used in `data-*` attributes.
 * @property {File} file             Original File object picked/dropped by the user.
 * @property {Uint8Array|null} bytes Lazily read file contents (null until first read).
 * @property {"checking"|"unencrypted"|"unlocked"|"password"|"error"} status Current state.
 * @property {string} detail         Human readable status line for the row.
 * @property {Record<string, string>} permissions Parsed `--show-encryption` key/value pairs.
 * @property {string|null} downloadUrl Blob URL of the unlocked PDF, if any.
 * @property {string} outName        Download file name for the unlocked PDF.
 */

export const state = {
  /**
   * All files currently tracked, in insertion order.
   * @type {Entry[]}
   */
  entries: [],

  /**
   * Monotonic id counter so ids are never reused after a removal.
   * @type {number}
   */
  nextId: 1,

  /**
   * Sequential job queue: files dropped mid-run are appended and executed in order,
   * which keeps the single reusable wasm instance free of interleaved work.
   * @type {Array<() => Promise<void>>}
   */
  queue: [],

  /**
   * True while the queue pump is draining, used to disable remove buttons and
   * to show the "Working…" status instead of a per-file summary.
   * @type {boolean}
   */
  processing: false,

  /**
   * Entries whose download should be started once the current render pass finished.
   * Drained by `decrypt()` after `render()` so the row and the link both exist first.
   * @type {Entry[]}
   */
  autoDownloads: [],
};
