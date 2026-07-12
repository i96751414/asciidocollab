// Vendors the built Asciidoctor-PDF WebAssembly engine into the web app's public assets so the PDF
// worker can fetch it same-origin (no CDN, no network) and cache it immutably. The engine is the
// real Asciidoctor-PDF Ruby gem compiled to wasm32-wasip1; it is produced by the sibling package's
// wasm build (packages/asciidoc-pdf/ruby/build-wasm.sh) and is a large, git-ignored generated blob —
// do not edit it by hand.
//
// The full wasm compile is a heavy, toolchain-dependent step that does not run on every install. So
// this copier NO-OPS GRACEFULLY when the source binary is absent: it warns and exits 0 so the
// predev/prebuild chain never breaks on a machine that has not built the engine yet. Once the blob
// exists it is copied verbatim into public/vendor/asciidoctor-pdf/.
//
// Runs in predev/prebuild. Output is git-ignored generated data — do not edit by hand.

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// The built engine lives next to its pinned Gemfile in the sibling package.
const sourceWasm = resolve(here, '../../../packages/asciidoc-pdf/ruby/asciidoctor-pdf.wasm');
const outputDir = resolve(here, '../public/vendor/asciidoctor-pdf');
const outputWasm = resolve(outputDir, 'asciidoctor-pdf.wasm');

if (!existsSync(sourceWasm)) {
  console.warn(
    `[asciidoctor-pdf-wasm] source engine not built yet at ${sourceWasm} — skipping vendor step. ` +
      `Run the wasm build (pnpm --filter @asciidocollab/asciidoc-pdf build:wasm) to enable PDF export.`,
  );
  process.exit(0);
}

mkdirSync(outputDir, { recursive: true });
copyFileSync(sourceWasm, outputWasm);

console.log(`Copied Asciidoctor-PDF wasm engine → public/vendor/asciidoctor-pdf/ (from ${sourceWasm})`);
