// Copies the self-hosted pdf.js worker bundle into the web app's public assets so the PDF preview
// panel can load it same-origin. The preview renders the exported PDF to a canvas via pdf.js, which
// parses the document in its own worker (`GlobalWorkerOptions.workerSrc`); serving that worker from
// our own origin keeps rendering off the main thread with no CDN and no cross-origin fetch.
//
// The preview panel expects the worker at `/vendor/pdfjs/pdf.worker.min.mjs`; keep that path in sync
// with `PDF_WORKER_SOURCE` in `src/components/pdf-preview-panel.tsx`.
//
// Runs in predev/prebuild. Output is git-ignored generated data — do not edit by hand.

import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Resolve the installed pdfjs-dist package and its prebuilt worker bundle.
const pdfjsPackage = require.resolve('pdfjs-dist/package.json');
const workerSource = resolve(dirname(pdfjsPackage), 'build/pdf.worker.min.mjs');
const outputDir = resolve(here, '../public/vendor/pdfjs');

mkdirSync(outputDir, { recursive: true });
copyFileSync(workerSource, resolve(outputDir, 'pdf.worker.min.mjs'));

console.log(`Copied pdf.js worker → public/vendor/pdfjs/ (from ${workerSource})`);
