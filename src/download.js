/**
 * download.js
 *
 * Everything related to getting an unlocked PDF onto the user's disk:
 * - starting a download programmatically (auto-download after unlocking), and
 * - releasing the Blob URL that backs an entry when it is no longer needed.
 *
 * Kept separate from the rendering code so that memory management (revoking object URLs)
 * happens in exactly one module.
 */

/**
 * Trigger a browser download of a finished entry's Blob using a temporary anchor.
 *
 * A real anchor element must be attached to the document for the synthetic click to be
 * honoured in every browser, hence the append/remove dance.
 *
 * @param {import("./state.js").Entry} entry Entry with a `downloadUrl` to save.
 * @returns {void}
 */
export function triggerDownload(entry) {
  // Create a throwaway anchor pointing at the Blob URL.
  const link = document.createElement("a");
  // `href` is the Blob URL created after a successful decrypt.
  link.href = entry.downloadUrl;
  // `download` forces a save instead of a navigation and sets the suggested file name.
  link.download = entry.outName;
  // Hint that the target must not get access to the opener window.
  link.rel = "noopener";
  // Attach to the DOM so the click is trusted by all engines.
  document.body.appendChild(link);
  // Fire the synthetic click that starts the download.
  link.click();
  // Detach again to leave no trace in the DOM.
  link.remove();
}

/**
 * Drop the download associated with an entry and release its Blob URL.
 *
 * Object URLs pin their Blob in memory until revoked, so this is called whenever an
 * entry is re-created (re-decrypt) or removed from the list.
 *
 * @param {import("./state.js").Entry} entry Entry whose download should be discarded.
 * @returns {void}
 */
export function clearDownload(entry) {
  // Only act when a URL exists, otherwise revoking would be a no-op with a stale string.
  if (entry.downloadUrl) {
    // Free the underlying Blob memory held by the browser.
    URL.revokeObjectURL(entry.downloadUrl);
    // Reset the URL so `renderDownloads()` skips this entry.
    entry.downloadUrl = null;
    // Clear the download name as well to keep the entry fully consistent.
    entry.outName = "";
  }
}
