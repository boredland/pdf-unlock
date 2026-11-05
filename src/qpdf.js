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
 * shared. Both are removed after every run so a failed run never yields a stale output
 * and the last file does not stay resident in the wasm heap.
 *
 * @param {Uint8Array} bytes
 * @param {string[]} args
 * @returns {Promise<{exitCode: number, lines: string[], output: Uint8Array|null}>}
 *   `output` is the content of /output.pdf, or null when qpdf did not write one.
 */
export async function runQpdf(bytes, args) {
  const instance = await getInstance();
  const lines = [];
  let exitCode;
  let output = null;
  try {
    instance.FS.writeFile("/input.pdf", bytes);
    // callMain is synchronous, so capturing only around it keeps unrelated page logs
    // (e.g. emitted while the wasm was still loading) out of qpdf's output.
    capturedLines = lines;
    try {
      exitCode = instance.callMain(args);
    } catch (e) {
      if (typeof e?.status !== "number") {
        // A trap or abort (not an ExitStatus) leaves the runtime unusable; start the next
        // file on a fresh instance instead of failing every remaining one.
        instancePromise = null;
      }
      exitCode = e?.status ?? -1;
    } finally {
      capturedLines = null;
    }
    try {
      output = instance.FS.readFile("/output.pdf");
    } catch {
      // qpdf wrote no output
    }
  } finally {
    for (const path of ["/input.pdf", "/output.pdf"]) {
      try {
        instance.FS.unlink(path);
      } catch {
        // not present
      }
    }
  }
  return { exitCode, lines, output };
}
