/**
 * Structural PDF inspection over poppler's command-line tools (present on the parity host): page
 * count, extracted text layer, and a dependency-free rasterized "ink map" per page. The ink map is how
 * placement parity is measured for content that has no text layer (math glyph paths, diagram vectors):
 * poppler rasterizes each page to grayscale PGM, and this module reads the raw PGM bytes directly (no
 * image-decoding dependency) to derive, per page, the fraction of inked pixels and the normalized
 * bounding box of the ink. Comparing those against the reference render catches "did the artifact
 * render, and is it placed in the same region and at a comparable footprint" at an element-level
 * tolerance that absorbs rasterizer and engine antialiasing differences.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Per-page ink measurement derived from a grayscale raster of the page. */
export interface PageInk {
  /** Fraction of pixels darker than the ink threshold (0 = blank page, 1 = fully inked). */
  readonly darkFraction: number;
  /** Normalized bounding box of the inked pixels, or null when the page is blank. */
  readonly bbox: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number } | null;
}

function withTemporaryPdf<T>(bytes: Uint8Array, run: (pdfPath: string, directory: string) => T): T {
  const directory = mkdtempSync(path.join(tmpdir(), 'pdfparity-'));
  const pdfPath = path.join(directory, 'doc.pdf');
  writeFileSync(pdfPath, Buffer.from(bytes));
  try {
    return run(pdfPath, directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Number of pages in the PDF (via `pdfinfo`). */
export function pageCount(bytes: Uint8Array): number {
  return withTemporaryPdf(bytes, (pdfPath) => {
    const out = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
    const match = /^Pages:\s+(\d+)/m.exec(out);
    if (match === null) {
      throw new Error('pdfinfo did not report a page count');
    }
    return Number(match[1]);
  });
}

/** Extracted text layer (via `pdftotext`, reading order preserved). */
export function extractText(bytes: Uint8Array): string {
  return withTemporaryPdf(bytes, (pdfPath) =>
    execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }),
  );
}

/** Parse a binary PGM (P5) into width, height, and the raw grayscale sample bytes. */
function parsePgm(buffer: Buffer): { width: number; height: number; data: Buffer } {
  if (buffer[0] !== 0x50 || buffer[1] !== 0x35) {
    throw new Error('not a binary PGM (P5) raster');
  }
  let offset = 2;
  const tokens: number[] = [];
  while (tokens.length < 3) {
    while (offset < buffer.length && /\s/.test(String.fromCodePoint(buffer[offset]))) {
      offset += 1;
    }
    if (buffer[offset] === 0x23) {
      while (offset < buffer.length && buffer[offset] !== 0x0A) {
        offset += 1;
      }
      continue;
    }
    let token = '';
    while (offset < buffer.length && !/\s/.test(String.fromCodePoint(buffer[offset]))) {
      token += String.fromCodePoint(buffer[offset]);
      offset += 1;
    }
    tokens.push(Number(token));
  }
  const [width, height] = tokens;
  const data = buffer.subarray(offset + 1);
  return { width, height, data };
}

/** The grayscale sample below which a pixel counts as "inked". */
const INK_THRESHOLD = 250;

function inkOfPgm(buffer: Buffer): PageInk {
  const { width, height, data } = parsePgm(buffer);
  let dark = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (data[row + x] < INK_THRESHOLD) {
        dark += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const total = width * height;
  const bbox =
    maxX < 0
      ? null
      : { x0: minX / width, y0: minY / height, x1: (maxX + 1) / width, y1: (maxY + 1) / height };
  return { darkFraction: total === 0 ? 0 : dark / total, bbox };
}

/** The element-level tolerance an ink-map comparison is held to (recorded by the fixture). */
export interface InkTolerance {
  readonly dpi: number;
  /** Minimum inked fraction a content page must have (proves the artifact actually rendered). */
  readonly minDarkFraction: number;
  /** Max allowed |ours-ref|/ref of the inked fraction (footprint parity, absorbs AA). */
  readonly maxDarkFractionRatioDelta: number;
  /** Max allowed per-edge difference of the normalized ink bounding box (placement parity). */
  readonly maxBboxEdgeDelta: number;
}

/** A single ink-map parity failure for a page. */
export interface InkMismatch {
  readonly page: number;
  readonly detail: string;
}

/** Compare our page ink maps against the reference's at the given tolerance; empty ⇒ parity. */
export function compareInkMaps(
  ours: readonly PageInk[],
  reference: readonly PageInk[],
  tolerance: InkTolerance,
): InkMismatch[] {
  const mismatches: InkMismatch[] = [];
  if (ours.length !== reference.length) {
    mismatches.push({ page: -1, detail: `page count ours=${ours.length} reference=${reference.length}` });
    return mismatches;
  }
  for (const [index, r] of reference.entries()) {
    const o = ours[index];
    if (r.darkFraction < tolerance.minDarkFraction) {
      continue; // Reference page is blank/near-blank; nothing to hold parity against.
    }
    if (o.darkFraction < tolerance.minDarkFraction) {
      mismatches.push({ page: index, detail: `our page has no ink (darkFraction=${o.darkFraction.toFixed(5)})` });
      continue;
    }
    const ratioDelta = Math.abs(o.darkFraction - r.darkFraction) / r.darkFraction;
    if (ratioDelta > tolerance.maxDarkFractionRatioDelta) {
      mismatches.push({
        page: index,
        detail: `ink footprint delta ${ratioDelta.toFixed(3)} > ${tolerance.maxDarkFractionRatioDelta} (ours=${o.darkFraction.toFixed(5)} ref=${r.darkFraction.toFixed(5)})`,
      });
    }
    if (o.bbox !== null && r.bbox !== null) {
      const edges: Array<'x0' | 'y0' | 'x1' | 'y1'> = ['x0', 'y0', 'x1', 'y1'];
      for (const edge of edges) {
        const delta = Math.abs(o.bbox[edge] - r.bbox[edge]);
        if (delta > tolerance.maxBboxEdgeDelta) {
          mismatches.push({
            page: index,
            detail: `ink bbox ${edge} delta ${delta.toFixed(3)} > ${tolerance.maxBboxEdgeDelta} (ours=${o.bbox[edge].toFixed(3)} ref=${r.bbox[edge].toFixed(3)})`,
          });
        }
      }
    }
  }
  return mismatches;
}

/** Rasterize every page to grayscale at `dpi` and return each page's ink measurement, in page order. */
export function pageInkMaps(bytes: Uint8Array, dpi: number): PageInk[] {
  return withTemporaryPdf(bytes, (pdfPath, directory) => {
    const prefix = path.join(directory, 'page');
    execFileSync('pdftoppm', ['-gray', '-r', String(dpi), pdfPath, prefix]);
    const pgms = readdirSync(directory)
      .filter((name) => name.startsWith('page') && name.endsWith('.pgm'))
      .toSorted((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return pgms.map((name) => inkOfPgm(readFileSync(path.join(directory, name))));
  });
}
