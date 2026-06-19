// Copies the self-hosted MathJax 3 browser bundle (the `es5/` tree) into the web app's
// public assets so the preview's STEM renderer can load it same-origin via a real
// `<script>` tag (see src/components/math/render-math.ts).
//
// Why a script tag instead of `import('mathjax/es5/...')`: the `mathjax` npm package's
// `es5/*` files are browser IIFE bundles (package.json has no `module`/`type: module`),
// NOT ES modules. Webpack/Next can resolve them as modules in Node (jsdom tests), but in
// the browser bundle their global side effects / deferred MathJax 3 startup never run, so
// `globalThis.MathJax.typesetPromise` never appears and nothing renders. The supported
// MathJax 3 browser path is a self-hosted `<script src=".../tex-mml-chtml.js">`; MathJax
// derives its component base URL from that script's src, so the AsciiMath input component
// requested via `loader.load: ['input/asciimath']` resolves to `/vendor/mathjax/input/...`.
//
// We copy the whole `es5/` tree (it's only loaded lazily, on demand, when math is present)
// so every component MathJax may pull in (input jaxes, output fonts, a11y) is available
// same-origin — no CDN, no network (Constitution VI/VIII/IX; research R5).
//
// Runs in predev/prebuild. Output is git-ignored generated data — do not edit by hand.

import { createRequire } from 'node:module';
import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Resolve the installed mathjax package and its bundled `es5/` browser assets.
const mathjaxPkg = require.resolve('mathjax/package.json');
const sourceDir = resolve(dirname(mathjaxPkg), 'es5');
const outputDir = resolve(here, '../public/vendor/mathjax');

mkdirSync(outputDir, { recursive: true });
cpSync(sourceDir, outputDir, { recursive: true });

console.log(`Copied MathJax es5 bundle → public/vendor/mathjax/ (from ${sourceDir})`);
