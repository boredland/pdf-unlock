# PDF Unlock

Remove password protection from PDF files entirely in your browser using WebAssembly.

**[Live Demo](https://pdf-unlock.jonas-strassel.de/)**

## Features

- Decrypt owner-password-protected PDFs (restricted permissions) without a password
- Decrypt user-password-protected PDFs with the correct password
- Shows encryption status and permission details before unlocking
- All processing runs client-side — files never leave your device

## Development

```bash
npm install
npm run dev
```

## Deployment

Pushes to `main` automatically deploy to GitHub Pages via the included workflow.

## Built with

- [qpdf-wasm](https://github.com/neslinesli93/qpdf-wasm) — QPDF compiled to WebAssembly
- [Vite](https://vite.dev/)
