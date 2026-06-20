/**
 * WCAG 2.1 AA contrast and CIE ΔE ≥ 15 adjacency tests for the 030 token set.
 *
 * Token values are copied from `src/styles/globals.css` `:root` (light) and `.dark`.
 * Each assertion is the canonical guard for that token's legibility; tune
 * globals.css when a test fails, do not loosen the test.
 *
 * Thresholds:
 *   - WCAG AA normal text:  4.5:1
 *   - WCAG AA large/bold:   3.0:1  (headings h0–h3 are ≥ 1.3 em bold)
 *   - Chip text on chip bg: 4.5:1  (admonition labels are small, not bold)
 *   - ΔE adjacency floor:   15     (perceptual distinctness between ramp steps)
 */
import {
  parseHSL,
  wcagContrastRatio,
  deltaE,
  type HSLTuple,
} from './color-utilities';

// ── Token tables ──────────────────────────────────────────────────────────────
// Copied from globals.css `:root` (light) and `.dark`.  Keep in sync manually.

const LIGHT = {
  background:         parseHSL('192 22% 98%'),
  foreground:         parseHSL('192 44% 11%'),
  markup:             parseHSL('200 12% 72%'),
  syntaxHeading:      parseHSL('188 70% 26%'),
  syntaxH1:           parseHSL('191 58% 38%'),
  syntaxH2:           parseHSL('199 24% 47%'),
  syntaxH3:           parseHSL('199 24% 47%'),
  syntaxCodeFg:       parseHSL('200 18% 30%'),
  syntaxCodeBg:       parseHSL('200 20% 94%'),
  attrref:            parseHSL('34 50% 39%'),
  syntaxCallout:      parseHSL('330 50% 45%'),
  syntaxLink:         parseHSL('214 58% 46%'),
  syntaxKeyword:      parseHSL('280 34% 52%'),
  syntaxString:       parseHSL('152 46% 34%'),
  syntaxAttr:         parseHSL('34 58% 38%'),
  syntaxComment:      parseHSL('196 14% 44%'),
  admonNoteFg:        parseHSL('200 70% 32%'),
  admonNoteBg:        parseHSL('200 55% 94%'),
  admonTipFg:         parseHSL('150 55% 30%'),
  admonTipBg:         parseHSL('150 45% 93%'),
  admonWarningFg:     parseHSL('38 80% 32%'),
  admonWarningBg:     parseHSL('44 85% 91%'),
  admonImportantFg:   parseHSL('0 65% 42%'),
  admonImportantBg:   parseHSL('0 70% 95%'),
  admonCautionFg:     parseHSL('24 78% 38%'),
  admonCautionBg:     parseHSL('28 82% 93%'),
} as const;

const DARK = {
  background:         parseHSL('195 38% 8%'),
  foreground:         parseHSL('190 22% 92%'),
  markup:             parseHSL('200 10% 44%'),
  syntaxHeading:      parseHSL('188 70% 55%'),
  syntaxH1:           parseHSL('189 50% 60%'),
  syntaxH2:           parseHSL('196 24% 64%'),
  syntaxH3:           parseHSL('196 24% 64%'),
  syntaxCodeFg:       parseHSL('200 16% 80%'),
  syntaxCodeBg:       parseHSL('200 14% 22%'),
  attrref:            parseHSL('38 55% 68%'),
  syntaxCallout:      parseHSL('330 55% 72%'),
  syntaxLink:         parseHSL('214 64% 72%'),
  syntaxKeyword:      parseHSL('280 46% 74%'),
  syntaxString:       parseHSL('152 44% 62%'),
  syntaxAttr:         parseHSL('38 62% 62%'),
  syntaxComment:      parseHSL('192 14% 56%'),
  admonNoteFg:        parseHSL('200 65% 74%'),
  admonNoteBg:        parseHSL('200 38% 22%'),
  admonTipFg:         parseHSL('150 50% 68%'),
  admonTipBg:         parseHSL('150 32% 20%'),
  admonWarningFg:     parseHSL('42 85% 66%'),
  admonWarningBg:     parseHSL('40 50% 22%'),
  admonImportantFg:   parseHSL('0 72% 74%'),
  admonImportantBg:   parseHSL('0 45% 25%'),
  admonCautionFg:     parseHSL('28 82% 70%'),
  admonCautionBg:     parseHSL('26 50% 25%'),
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function aa(fg: HSLTuple, bg: HSLTuple, min = 4.5, _label = ''): void {
  const ratio = wcagContrastRatio(fg, bg);
  expect(ratio).toBeGreaterThanOrEqual(min);
}

/**
 * --markup is DE-EMPHASIZED structural scaffold (heading `=`, list/fence/table-separator markers). It
 * is deliberately LOW-contrast so it recedes behind content — held below the 4.5:1 body-text floor but
 * kept visible. This guards both bounds so it neither disappears nor reads at body-text strength.
 */
function recedes(fg: HSLTuple, bg: HSLTuple): void {
  const ratio = wcagContrastRatio(fg, bg);
  expect(ratio).toBeGreaterThanOrEqual(1.3);
  expect(ratio).toBeLessThan(4.5);
}

function de(c1: HSLTuple, c2: HSLTuple, _label = ''): void {
  const d = deltaE(c1, c2);
  expect(d).toBeGreaterThanOrEqual(15);
}

// ── WCAG AA — Light mode ──────────────────────────────────────────────────────

describe('WCAG AA — light mode', () => {
  const { background: bg, syntaxCodeBg } = LIGHT;

  // Normal text tokens (4.5:1)
  test('--markup recedes against --background (de-emphasized scaffold, below body-text 4.5:1)', () =>
    recedes(LIGHT.markup, bg));
  test('--attrref contrast against --background', () =>
    aa(LIGHT.attrref, bg, 4.5, '--attrref light'));
  test('--syntax-callout contrast against --background', () =>
    aa(LIGHT.syntaxCallout, bg, 4.5, '--syntax-callout light'));
  test('--syntax-link contrast against --background', () =>
    aa(LIGHT.syntaxLink, bg, 4.5, '--syntax-link light'));
  test('--syntax-keyword contrast against --background', () =>
    aa(LIGHT.syntaxKeyword, bg, 4.5, '--syntax-keyword light'));
  test('--syntax-string contrast against --background', () =>
    aa(LIGHT.syntaxString, bg, 4.5, '--syntax-string light'));
  test('--syntax-attr contrast against --background', () =>
    aa(LIGHT.syntaxAttr, bg, 4.5, '--syntax-attr light'));
  test('--syntax-comment contrast against --background', () =>
    aa(LIGHT.syntaxComment, bg, 4.5, '--syntax-comment light'));
  test('--syntax-code-fg contrast against --syntax-code-bg', () =>
    aa(LIGHT.syntaxCodeFg, syntaxCodeBg, 4.5, '--syntax-code-fg light'));

  // Heading tokens (3:1 — large bold text)
  test('--syntax-heading contrast against --background (3:1 large/bold)', () =>
    aa(LIGHT.syntaxHeading, bg, 3, '--syntax-heading light'));
  test('--syntax-h1 contrast against --background (3:1 large/bold)', () =>
    aa(LIGHT.syntaxH1, bg, 3, '--syntax-h1 light'));
  test('--syntax-h2 contrast against --background (3:1 large/bold)', () =>
    aa(LIGHT.syntaxH2, bg, 3, '--syntax-h2 light'));
  test('--syntax-h3 contrast against --background (3:1 large/bold)', () =>
    aa(LIGHT.syntaxH3, bg, 3, '--syntax-h3 light'));

  // Admonition chip text on chip bg (4.5:1)
  test('--admon-note-fg on --admon-note-bg', () =>
    aa(LIGHT.admonNoteFg, LIGHT.admonNoteBg, 4.5, '--admon-note light'));
  test('--admon-tip-fg on --admon-tip-bg', () =>
    aa(LIGHT.admonTipFg, LIGHT.admonTipBg, 4.5, '--admon-tip light'));
  test('--admon-warning-fg on --admon-warning-bg', () =>
    aa(LIGHT.admonWarningFg, LIGHT.admonWarningBg, 4.5, '--admon-warning light'));
  test('--admon-important-fg on --admon-important-bg', () =>
    aa(LIGHT.admonImportantFg, LIGHT.admonImportantBg, 4.5, '--admon-important light'));
  test('--admon-caution-fg on --admon-caution-bg', () =>
    aa(LIGHT.admonCautionFg, LIGHT.admonCautionBg, 4.5, '--admon-caution light'));
});

// ── WCAG AA — Dark mode ───────────────────────────────────────────────────────

describe('WCAG AA — dark mode', () => {
  const { background: bg, syntaxCodeBg } = DARK;

  test('--markup recedes against --background (de-emphasized scaffold, below body-text 4.5:1)', () =>
    recedes(DARK.markup, bg));
  test('--attrref contrast against --background', () =>
    aa(DARK.attrref, bg, 4.5, '--attrref dark'));
  test('--syntax-callout contrast against --background', () =>
    aa(DARK.syntaxCallout, bg, 4.5, '--syntax-callout dark'));
  test('--syntax-link contrast against --background', () =>
    aa(DARK.syntaxLink, bg, 4.5, '--syntax-link dark'));
  test('--syntax-keyword contrast against --background', () =>
    aa(DARK.syntaxKeyword, bg, 4.5, '--syntax-keyword dark'));
  test('--syntax-string contrast against --background', () =>
    aa(DARK.syntaxString, bg, 4.5, '--syntax-string dark'));
  test('--syntax-attr contrast against --background', () =>
    aa(DARK.syntaxAttr, bg, 4.5, '--syntax-attr dark'));
  test('--syntax-comment contrast against --background', () =>
    aa(DARK.syntaxComment, bg, 4.5, '--syntax-comment dark'));
  test('--syntax-code-fg contrast against --syntax-code-bg', () =>
    aa(DARK.syntaxCodeFg, syntaxCodeBg, 4.5, '--syntax-code-fg dark'));

  test('--syntax-heading contrast against --background (3:1 large/bold)', () =>
    aa(DARK.syntaxHeading, bg, 3, '--syntax-heading dark'));
  test('--syntax-h1 contrast against --background (3:1 large/bold)', () =>
    aa(DARK.syntaxH1, bg, 3, '--syntax-h1 dark'));
  test('--syntax-h2 contrast against --background (3:1 large/bold)', () =>
    aa(DARK.syntaxH2, bg, 3, '--syntax-h2 dark'));
  test('--syntax-h3 contrast against --background (3:1 large/bold)', () =>
    aa(DARK.syntaxH3, bg, 3, '--syntax-h3 dark'));

  test('--admon-note-fg on --admon-note-bg', () =>
    aa(DARK.admonNoteFg, DARK.admonNoteBg, 4.5, '--admon-note dark'));
  test('--admon-tip-fg on --admon-tip-bg', () =>
    aa(DARK.admonTipFg, DARK.admonTipBg, 4.5, '--admon-tip dark'));
  test('--admon-warning-fg on --admon-warning-bg', () =>
    aa(DARK.admonWarningFg, DARK.admonWarningBg, 4.5, '--admon-warning dark'));
  test('--admon-important-fg on --admon-important-bg', () =>
    aa(DARK.admonImportantFg, DARK.admonImportantBg, 4.5, '--admon-important dark'));
  test('--admon-caution-fg on --admon-caution-bg', () =>
    aa(DARK.admonCautionFg, DARK.admonCautionBg, 4.5, '--admon-caution dark'));
});

// ── Heading ramp ─────────────────────────────────────────────────────────────
// The heading ramp now follows the review proposal's teal family (== → h1, === → h2, deeper → h3),
// per the maintainer's request to match the example file. These colours are close in hue (and h2==h3),
// so headings are distinguished primarily by FONT SIZE (the `.cm-ad-h*` ramp) and weight, NOT by a
// ΔE ≥ 15 colour step — the earlier hue-shifted ramp that enforced that was intentionally replaced.
// Their legibility is still guarded by the 3:1 large/bold contrast tests above.
describe('heading ramp follows the example palette (distinguished by size, not ΔE)', () => {
  test('=== (h2) and deeper (h3) intentionally share one colour', () => {
    expect(LIGHT.syntaxH2).toEqual(LIGHT.syntaxH3);
    expect(DARK.syntaxH2).toEqual(DARK.syntaxH3);
  });
});

// ── ΔE ≥ 15 — admonition severity pairwise ───────────────────────────────────

describe('ΔE ≥ 15 — admonition severity pairwise distinctness (light)', () => {
  const fgs = [
    ['note',      LIGHT.admonNoteFg],
    ['tip',       LIGHT.admonTipFg],
    ['warning',   LIGHT.admonWarningFg],
    ['important', LIGHT.admonImportantFg],
    ['caution',   LIGHT.admonCautionFg],
  ] as const;

  for (let index = 0; index < fgs.length; index++) {
    for (let index_ = index + 1; index_ < fgs.length; index_++) {
      const [name1, c1] = fgs[index];
      const [name2, c2] = fgs[index_];
      test(`${name1} ↔ ${name2}`, () => de(c1, c2, `${name1} ↔ ${name2} light`));
    }
  }
});

describe('ΔE ≥ 15 — admonition severity pairwise distinctness (dark)', () => {
  const fgs = [
    ['note',      DARK.admonNoteFg],
    ['tip',       DARK.admonTipFg],
    ['warning',   DARK.admonWarningFg],
    ['important', DARK.admonImportantFg],
    ['caution',   DARK.admonCautionFg],
  ] as const;

  for (let index = 0; index < fgs.length; index++) {
    for (let index_ = index + 1; index_ < fgs.length; index_++) {
      const [name1, c1] = fgs[index];
      const [name2, c2] = fgs[index_];
      test(`${name1} ↔ ${name2}`, () => de(c1, c2, `${name1} ↔ ${name2} dark`));
    }
  }
});

// ── ΔE ≥ 15 — checklist done ↔ todo ─────────────────────────────────────────

describe('ΔE ≥ 15 — checklist done vs todo', () => {
  // done = --syntax-string, todo = --markup
  test('light: checkDone (--syntax-string) ↔ checkTodo (--markup)', () =>
    de(LIGHT.syntaxString, LIGHT.markup, 'checkDone ↔ checkTodo light'));
  test('dark: checkDone (--syntax-string) ↔ checkTodo (--markup)', () =>
    de(DARK.syntaxString, DARK.markup, 'checkDone ↔ checkTodo dark'));
});
