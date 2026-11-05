/**
 * @typedef {Object} Entry
 * @property {number} id
 * @property {File} file
 * @property {Uint8Array|null} bytes Kept only while a password attempt may still need it.
 * @property {"checking"|"unencrypted"|"unlocked"|"password"|"error"} status
 * @property {string} detail
 * @property {Record<string, string>} permissions Parsed `--show-encryption` output.
 * @property {string|null} downloadUrl
 * @property {string} outName
 */

export const state = {
  /** @type {Entry[]} */
  entries: [],
  nextId: 1,
  /** Skipped-files report; separate from the status line, which every render rewrites. */
  notice: "",
  /** @type {Array<() => Promise<void> | void>} */
  queue: [],
  processing: false,
};
