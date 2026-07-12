// Copies fonteditor-core's WOFF2 codec wasm into the web app's public assets so the PDF worker can load
// it same-origin. Custom WOFF2 project fonts are not embeddable by Asciidoctor-PDF/prawn (TTF/OTF only),
// so the PDF pipeline's asset-mount stage decodes them back to their sfnt via this wasm before convert.
// Serving it from our own origin keeps the no-egress invariant (no CDN, no cross-origin fetch).
//
// The worker converter expects the wasm at `/vendor/woff2/woff2.wasm`; keep that path in sync with
// `WOFF2_WASM_URL` in `src/workers/woff2-font-converter.ts`.
//
// Runs in predev/prebuild. Output is git-ignored generated data — do not edit by hand.

import { createRequire } from 'node:module';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// fonteditor-core's `exports` map forbids resolving its package.json subpath, so locate the WOFF2 codec
// wasm by walking up from the resolved main entry until the `woff2/woff2.wasm` asset is found.
function locateWoff2Wasm() {
  let directory = dirname(require.resolve('fonteditor-core'));
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = resolve(directory, 'woff2/woff2.wasm');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error('Could not locate fonteditor-core/woff2/woff2.wasm — is the dependency installed?');
}

const wasmSource = locateWoff2Wasm();
const outputDir = resolve(here, '../public/vendor/woff2');

mkdirSync(outputDir, { recursive: true });
copyFileSync(wasmSource, resolve(outputDir, 'woff2.wasm'));

console.log(`Copied WOFF2 codec wasm → public/vendor/woff2/ (from ${wasmSource})`);
