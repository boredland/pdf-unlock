/**
 * format.js
 *
 * Pure presentation helpers: permission labels, HTML escaping and byte formatting.
 * Nothing here touches the DOM or application state, so these functions are trivially
 * testable and safe to reuse anywhere.
 */

/**
 * Permission keywords reported by `qpdf --show-encryption`.
 *
 * The order below is also the display order in the UI, so it doubles as the list of
 * permission rows to look up on each entry.
 * @type {readonly string[]}
 */
export const PERMISSIONS = [
  "extract for accessibility",
  "extract for any purpose",
  "print low resolution",
  "print high resolution",
  "modify document assembly",
  "modify forms",
  "modify annotations",
  "modify other",
];

/**
 * Escape a value for safe interpolation into an HTML template string.
 *
 * File names are user input, so they are always escaped before being written into
 * `innerHTML` to prevent markup injection.
 *
 * @param {unknown} str Value to escape (coerced to string).
 * @returns {string} HTML-safe representation of `str`.
 */
export function escapeHtml(str) {
  // Replace each of the five HTML-significant characters with its entity.
  return String(str).replace(
    /[&<>"']/g,
    // Map the matched character to its entity via a lookup table.
    (c) =>
      ({
        "&": "&amp;", // ampersand must be replaced first in spirit, table lookup keeps it safe
        "<": "&lt;", // opening angle bracket
        ">": "&gt;", // closing angle bracket
        '"': "&quot;", // double quote (attribute values)
        "'": "&#39;", // single quote (attribute values)
      })[c],
  );
}

/**
 * Render a byte count as a short, human readable kilobyte string.
 *
 * @param {number} bytes File size in bytes.
 * @returns {string} Size such as `"12.3 KB"`.
 */
export function formatSize(bytes) {
  // Convert to kilobytes and keep a single decimal place for compactness.
  return (bytes / 1024).toFixed(1) + " KB";
}
