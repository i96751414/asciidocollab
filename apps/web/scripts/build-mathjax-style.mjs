// Generates a scoped copy of the vendored MathJax stylesheet so its global
// selectors cannot leak into the application chrome (Constitution VI — Style Isolation).
//
// Every selector is prefixed with
//   .asciidoc-preview-content
// (the same preview content container the Asciidoctor stylesheet is scoped to).
// Root selectors (html, body, :root) are mapped onto the scope itself rather than
// becoming an (always-empty) descendant selector. At-rules (@media, etc.) are preserved;
// their inner rules are prefixed like any other rule.
//
// MathJax 3.x does not ship a standalone stylesheet — its CHTML/SVG output components
// inject CSS at runtime. When no vendored source exists yet this script is a graceful
// no-op (it writes nothing and warns) so `predev`/`prebuild` never break; once a MathJax
// CSS source is vendored under src/styles/vendor/, re-running scopes it automatically.
//
// DO NOT edit the generated output by hand — vendor the source and re-run:
//   pnpm --filter @asciidocollab/web run build:mathjax-style

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import postcss from 'postcss';
import prefixSelector from 'postcss-prefix-selector';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(here, '../src/styles/vendor/mathjax.css');
const OUTPUT = resolve(here, '../src/styles/vendor/mathjax.scoped.css');
const SCOPE = '.asciidoc-preview-content';

// Selectors that target the document root; under our scope these must collapse onto the
// scoped container itself, otherwise `.scope html` / `.scope body` would never match.
const ROOT_SELECTORS = new Set(['html', 'body', ':root']);

const transform = (prefix, selector, prefixedSelector) => {
  const trimmed = selector.trim();
  if (ROOT_SELECTORS.has(trimmed)) return prefix;
  // e.g. `body.foo`, `html.bar` → replace the leading root element with the scope.
  if (/^(html|body)(?=[.:#[\s]|$)/.test(trimmed)) {
    return trimmed.replace(/^(html|body)/, prefix);
  }
  // Universal and everything else keep the default `${prefix} ${selector}` form,
  // which is correct for `*`, `*::before`, and ordinary descendant selectors.
  return prefixedSelector;
};

// Page-level at-rules (`@page`) have no selector to prefix, so they would leak into the
// whole application's print layout. They must be removed to keep the stylesheet confined
// to the preview surface (Constitution VI — Style Isolation).
const stripUnscopableRules = () => ({
  postcssPlugin: 'strip-unscopable-rules',
  AtRule(atRule) {
    if (atRule.name === 'page') {
      atRule.remove();
    }
  },
});
stripUnscopableRules.postcss = true;

if (!existsSync(SOURCE)) {
  // MathJax 3.x has no standalone CSS yet — graceful no-op so the build never breaks.
  console.warn(
    `build-mathjax-style: no vendored MathJax CSS at ${SOURCE} — skipping (MathJax 3.x ` +
      'injects its CSS at runtime). Vendor a stylesheet there and re-run to scope it.',
  );
  process.exit(0);
}

const source = readFileSync(SOURCE, 'utf8');
const { css } = postcss([
  prefixSelector({ prefix: SCOPE, transform }),
  stripUnscopableRules,
]).process(source, { from: SOURCE, to: OUTPUT });

const banner =
  '/* GENERATED FILE — do not edit. Source: src/styles/vendor/mathjax.css\n' +
  ` * Scoped to ${SCOPE} by scripts/build-mathjax-style.mjs.\n` +
  ' * Re-run: pnpm --filter @asciidocollab/web run build:mathjax-style */\n';

writeFileSync(OUTPUT, banner + css);
console.log(`Wrote ${OUTPUT}`);
