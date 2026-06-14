// Copies the bundled Hunspell dictionaries into the web app's public assets so the
// browser spell-checker (US9) can fetch them same-origin, one file per supported
// language. The `dictionary-*` packages are Node modules (read files via node:fs) and
// must never be bundled for the client — only nspell (pure JS) runs in the browser,
// fed by these fetched assets.
//
// The set MUST match SPELLCHECK_DICTIONARY_LANGUAGES in the domain (and the web mirror
// in src/lib/codemirror/spellcheck-languages.ts). Languages without a Hunspell dictionary
// (CJK / most Indic scripts) are selectable but simply have no asset here, so spellcheck
// is a no-op for them.
//
// Runs in predev/prebuild. Output is git-ignored generated data — do not edit by hand.

import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const outputDir = resolve(here, '../public/dictionaries');

// Each ISO 639-1 code is also the output filename and its `dictionary-<code>` package name.
const LANGUAGES = ['en', 'es', 'fr', 'pt', 'de', 'it', 'uk', 'pl', 'tr'];

mkdirSync(outputDir, { recursive: true });

for (const code of LANGUAGES) {
  const dictionaryDir = dirname(require.resolve(`dictionary-${code}`));
  copyFileSync(resolve(dictionaryDir, 'index.aff'), resolve(outputDir, `${code}.aff`));
  copyFileSync(resolve(dictionaryDir, 'index.dic'), resolve(outputDir, `${code}.dic`));
}

console.log(`Copied ${LANGUAGES.length} Hunspell dictionaries (${LANGUAGES.join(', ')}) → public/dictionaries/`);
