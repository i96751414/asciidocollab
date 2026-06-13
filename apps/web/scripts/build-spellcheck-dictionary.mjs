// Copies the `dictionary-en` Hunspell files into the web app's public assets so
// the browser spell-checker (US9) can fetch them same-origin. `dictionary-en`
// itself is a Node module (reads files via node:fs) and must never be bundled
// for the client — only nspell (pure JS) runs in the browser, fed by these
// fetched assets.
//
// Runs in predev/prebuild. Output is git-ignored generated data — do not edit by hand.

import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const dictionaryDir = dirname(require.resolve('dictionary-en'));
const outputDir = resolve(here, '../public/dictionaries');

mkdirSync(outputDir, { recursive: true });
copyFileSync(resolve(dictionaryDir, 'index.aff'), resolve(outputDir, 'en.aff'));
copyFileSync(resolve(dictionaryDir, 'index.dic'), resolve(outputDir, 'en.dic'));

console.log('Copied dictionary-en (aff/dic) → public/dictionaries/');
