/**
 * Colour-space utilities for AsciiDoc syntax-highlight contrast tests (feature 030).
 *
 * All functions are pure (no production imports) so they can be required by both
 * jest and browser-based test runners without side effects.
 */

export interface HSLTuple {
  /** Hue in degrees [0, 360). */
  h: number;
  /** Saturation as a percentage [0, 100]. */
  s: number;
  /** Lightness as a percentage [0, 100]. */
  l: number;
}

/**
 * Parse a CSS custom-property value of the form `H S% L%` (the format used in
 * globals.css for all `--syntax-*` and design-token variables) into a typed
 * {@link HSLTuple}. Throws on malformed input.
 *
 * @example parseHSL("196 58% 40%") // { h: 196, s: 58, l: 40 }
 */
export function parseHSL(value: string): HSLTuple {
  const trimmed = value.trim();
  // Accept both "H S% L%" and "H S L" (percentage signs optional for flexibility).
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%?\s+(\d+(?:\.\d+)?)%?$/);
  if (!match) {
    throw new Error(`parseHSL: cannot parse "${trimmed}" — expected "H S% L%" format`);
  }
  return { h: Number(match[1]), s: Number(match[2]), l: Number(match[3]) };
}

function hue2rgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

/** Convert HSL (degrees, %, %) to linear RGB [0, 1] triple. */
export function hslToLinearRGB(hsl: HSLTuple): [number, number, number] {
  const h = hsl.h / 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;

  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [r, g, b];
}

/** Convert a single sRGB channel [0, 1] to linear light. */
function linearize(c: number): number {
  return c <= 0.040_45 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Compute the WCAG 2.1 relative luminance of an HSL colour.
 * Result is in [0, 1] (0 = black, 1 = white).
 */
export function relativeLuminance(hsl: HSLTuple): number {
  const [r, g, b] = hslToLinearRGB(hsl);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * WCAG 2.1 contrast ratio between two colours.
 * Returns a ratio ≥ 1 (1 = identical, 21 = black on white).
 */
export function wcagContrastRatio(fg: HSLTuple, bg: HSLTuple): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function labf(t: number): number {
  const delta = 6 / 29;
  return t > delta ** 3 ? Math.cbrt(t) : t / (3 * delta ** 2) + 4 / 29;
}

/**
 * Convert HSL → XYZ (D65 illuminant) → CIELAB for ΔE calculation.
 * Returns [L*, a*, b*] in the CIE 1976 (L*a*b*) colour space.
 */
export function hslToCIELAB(hsl: HSLTuple): [number, number, number] {
  const [r, g, b] = hslToLinearRGB(hsl);
  const rL = linearize(r);
  const gL = linearize(g);
  const bL = linearize(b);

  // Linear sRGB → XYZ (D65)
  const x = rL * 0.412_456_4 + gL * 0.357_576_1 + bL * 0.180_437_5;
  const y = rL * 0.212_672_9 + gL * 0.715_152_2 + bL * 0.072_175;
  const z = rL * 0.019_333_9 + gL * 0.119_192 + bL * 0.950_304_1;

  // D65 reference white
  const xN = 0.950_47, yN = 1, zN = 1.088_83;

  const labL = 116 * labf(y / yN) - 16;
  const labA = 500 * (labf(x / xN) - labf(y / yN));
  const labB = 200 * (labf(y / yN) - labf(z / zN));
  return [labL, labA, labB];
}

/**
 * CIE ΔE 1976 (Euclidean distance in L*a*b* space) between two HSL colours.
 * A ΔE of ~2.3 is considered a "just noticeable difference" by trained observers;
 * the contrast tests in this feature require ΔE ≥ 15 between adjacent heading ramp
 * tokens and pairwise between distinct admonition colours.
 */
export function deltaE(c1: HSLTuple, c2: HSLTuple): number {
  const [L1, a1, b1] = hslToCIELAB(c1);
  const [L2, a2, b2] = hslToCIELAB(c2);
  return Math.hypot(L1 - L2, a1 - a2, b1 - b2);
}

/**
 * Assert that `fg` meets WCAG AA contrast against `bg`.
 *
 * @param minRatio - Minimum required ratio (4.5 for normal text, 3 for large/bold).
 * @returns The actual contrast ratio (useful for logging).
 */
export function assertWCAGContrast(fg: HSLTuple, bg: HSLTuple, minRatio = 4.5): number {
  const ratio = wcagContrastRatio(fg, bg);
  if (ratio < minRatio) {
    throw new Error(
      `WCAG contrast ${ratio.toFixed(2)}:1 < ${minRatio}:1 ` +
      `(fg=hsl(${fg.h} ${fg.s}% ${fg.l}%), bg=hsl(${bg.h} ${bg.s}% ${bg.l}%))`,
    );
  }
  return ratio;
}
