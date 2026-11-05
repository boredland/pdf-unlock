/**
 * main.js — application entry point.
 *
 * The app is split into focused modules; this file only wires them together:
 *
 *   dom.js      — cached DOM element references
 *   state.js    — shared mutable state (entries, queue, flags)
 *   format.js   — pure presentation helpers (escaping, size formatting, permissions)
 *   qpdf.js     — wasm instance management + `runQpdf()`
 *   queue.js    — serial job queue (`enqueue` / `pump`)
 *   render.js   — all DOM writing (`render`, `setStatus`)
 *   download.js — Blob download start / URL cleanup
 *   unlock.js   — encryption inspection and decryption pipeline
 *   files.js    — file intake and removal
 *   events.js   — event listener wiring
 *
 * Importing a module executes its top-level code, which matters for `qpdf.js`: it must
 * patch `console` before any wasm module is instantiated.
 */

import { initEvents } from "./events.js";
import { render } from "./render.js";

// Wire up clicks, drag & drop, removal and password submission.
initEvents();

// First paint: renders the empty state (no rows, hidden password row, cleared status).
render();
