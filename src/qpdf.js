/**
 * qpdf.js
 *
 * Thin wrapper around the qpdf WebAssembly build.
 *
 * Responsibilities:
 * 1. Install a console interceptor *before* the wasm module is instantiated, because
 *    Emscripten captures `console.log.bind(console)` at init time. Without this early
 *    hook, qpdf's diagnostic output (which is how we read encryption details) would be
 *    unreachable from JavaScript.
 * 2. Lazily instantiate a single reusable wasm module (instantiating costs far more than
 *    running it, and a batch may contain dozens of files).
 * 3. Expose `runQpdf()`, which marshals bytes into the virtual file system, invokes the
 *    qpdf CLI with the given arguments and returns both the exit code and captured output.
 */

import createModule from "@neslinesli93/qpdf-wasm";
// Vite resolves this import to the emitted URL of the wasm binary.
import wasmUrl from "@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url";

/**
 * Buffer that receives intercepted console output while a qpdf run is in flight.
 * `null` means "not capturing", in which case output falls through to the real console.
 * @type {string[]|null}
 */
let capturedLines = null;

// Keep references to the genuine console methods so normal logging still works.
const _log = console.log;
const _err = console.error;

// Redirect `console.log` to the capture buffer when a run is active, else log normally.
// Emscripten's stdout writes land here.
console.log = (...a) =>
  capturedLines ? capturedLines.push(a.join(" ")) : _log(...a);

// Same interception for stderr; qpdf reports encryption/password diagnostics there.
console.error = (...a) =>
  capturedLines ? capturedLines.push(a.join(" ")) : _err(...a);

/**
 * Cached promise for the wasm module instance, shared by every file in a batch.
 * @type {Promise<any>|null}
 */
let qpdfInstance = null;

/**
 * Get the shared qpdf wasm instance, creating it on first use.
 *
 * The instance is created lazily so that opening the page does not pay the wasm cost
 * until the user actually feeds it a PDF. A failed instantiation clears the cache so a
 * later attempt can retry cleanly.
 *
 * @returns {Promise<any>} Resolves to the Emscripten module instance.
 */
export async function getQpdfInstance() {
  // Only pay for module creation once; reuse the same promise afterwards.
  if (!qpdfInstance) {
    qpdfInstance = createModule({ locateFile: () => wasmUrl }).catch((err) => {
      // Drop the rejected promise so the next call retries from scratch.
      qpdfInstance = null;
      // Re-throw so the caller can surface the failure.
      throw err;
    });
  }
  // Await (or return) the shared instance promise.
  return qpdfInstance;
}

/**
 * Run qpdf once against a byte buffer and return its result.
 *
 * The instance is stateful and only ever has one run in flight (the queue serialises
 * calls), so a fixed set of virtual paths (`/input.pdf`, `/output.pdf`) is reused and
 * cleaned between runs to guarantee outputs are never stale.
 *
 * @param {Uint8Array} bytes Raw PDF bytes to write into qpdf's in-memory file system.
 * @param {string[]} args qpdf CLI arguments, e.g. `["--decrypt", "/input.pdf", "/output.pdf"]`.
 * @returns {Promise<{exitCode: number, lines: string[], instance: any}>} Exit code,
 *   captured console lines and the module instance (so callers can read output files).
 */
export async function runQpdf(bytes, args) {
  // Fresh capture buffer for this run.
  const lines = [];
  // Start routing console output into `lines`.
  capturedLines = lines;
  try {
    // Ensure the wasm module exists before touching its file system.
    const instance = await getQpdfInstance();
    // Clear leftovers from the previous run so outputs are never stale.
    for (const path of ["/input.pdf", "/output.pdf"]) {
      try {
        // Remove the virtual file if it exists.
        instance.FS.unlink(path);
      } catch {
        // file did not exist — nothing to clean up
      }
    }
    // Provide the PDF under the conventional input path.
    instance.FS.writeFile("/input.pdf", bytes);
    // qpdf reports a failure exit code as a thrown object, not a return value.
    let exitCode;
    try {
      // Execute the CLI synchronously inside the wasm sandbox.
      exitCode = instance.callMain(args);
    } catch (e) {
      // Emscripten throws `{ status }` on non-zero exit; fall back to -1 if absent.
      exitCode = e?.status ?? -1;
    }
    // Hand back everything a caller needs to interpret the run.
    return { exitCode, lines, instance };
  } finally {
    // Always stop capturing, even if instantiation failed, so logging returns to normal.
    capturedLines = null;
  }
}
