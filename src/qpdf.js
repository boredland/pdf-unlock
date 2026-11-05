import createModule from "@neslinesli93/qpdf-wasm";
import wasmUrl from "@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url";

// Emscripten binds console.log/error when the module is created, so the hook has to be
// installed first; it is the only way to read qpdf's output.
let capturedLines = null;
const _log = console.log;
const _err = console.error;
console.log = (...a) =>
  capturedLines ? capturedLines.push(a.join(" ")) : _log(...a);
console.error = (...a) =>
  capturedLines ? capturedLines.push(a.join(" ")) : _err(...a);

// One instance serves the whole session; instantiating costs far more than a run.
let instancePromise = null;

function getInstance() {
  instancePromise ??= createModule({ locateFile: () => wasmUrl }).catch(
    (err) => {
      // Let the next file retry instead of caching the failure.
      instancePromise = null;
      throw err;
    },
  );
  return instancePromise;
}

/**
 * Run qpdf against `bytes` mounted at /input.pdf.
 *
 * Callers must serialise runs: the instance and its /input.pdf and /output.pdf paths are
 * shared, and both are removed first so a failed run can never yield a stale output.
 *
 * @param {Uint8Array} bytes
 * @param {string[]} args
 * @returns {Promise<{exitCode: number, lines: string[], instance: any}>}
 */
export async function runQpdf(bytes, args) {
  const lines = [];
  capturedLines = lines;
  try {
    const instance = await getInstance();
    for (const path of ["/input.pdf", "/output.pdf"]) {
      try {
        instance.FS.unlink(path);
      } catch {
        // not present
      }
    }
    instance.FS.writeFile("/input.pdf", bytes);
    let exitCode;
    try {
      exitCode = instance.callMain(args);
    } catch (e) {
      // Emscripten reports a non-zero exit by throwing an ExitStatus.
      exitCode = e?.status ?? -1;
    }
    return { exitCode, lines, instance };
  } finally {
    capturedLines = null;
  }
}
