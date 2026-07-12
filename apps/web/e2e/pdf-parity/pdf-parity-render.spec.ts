/**
 * PDF reference-parity render suite (stack-free; runs under playwright.pdf-parity.config.ts).
 *
 * For each fixture it produces the PDF the way production does — the real rendering shims feed the real
 * pre-processing pipeline, then the real wasm engine converts — and compares the result against a
 * committed reference PDF built by the EXTERNAL Asciidoctor-PDF toolchain (see tools/build-references.mjs).
 * Comparison is structural at each fixture's recorded element-level tolerance: citations assert the
 * reference-list entries / order / numbering; code asserts the highlighted code text survives and is
 * placed; math + diagrams assert the artifact rendered and is placed via a rasterized ink-map plus its
 * text labels. The suite self-gates: absent wasm or absent reference PDF ⇒ a clean skip.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import type { ProjectSnapshot } from '@asciidocollab/asciidoc-pdf';
import { createParityEngine, type ParityEngine } from './harness/engine';
import { renderOurs } from './harness/pipeline';
import { nodeShims, browserShims } from './harness/shims';
import { pageCount, extractText, pageInkMaps, compareInkMaps, type InkTolerance } from './harness/pdftools';
import { startStaticServer, type StaticServer } from './harness/static-server';
import {
  extractCitationFacts,
  compareCitationFacts,
  isNumericStyle,
  CITED_WORKS,
} from './harness/citations-check';

const WEB_ROOT = process.cwd();
const WASM_PATH = path.join(WEB_ROOT, '..', '..', 'packages', 'asciidoc-pdf', 'ruby', 'asciidoctor-pdf.wasm');
const FIXTURES_DIR = path.join(WEB_ROOT, 'e2e', 'pdf-parity', 'fixtures');
const MERMAID_BUNDLE = path.join(WEB_ROOT, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');
const MATHJAX_ES5_DIR = path.join(WEB_ROOT, 'node_modules', 'mathjax', 'es5');

const enginePresent = existsSync(WASM_PATH);

/** The ink-map + label config a diagram/math fixture records in its manifest. */
interface InkManifest {
  readonly ink: InkTolerance;
  readonly labels: readonly string[];
}

function numberField(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (typeof value !== 'number') {
    throw new TypeError(`manifest ink.${key} must be a number`);
  }
  return value;
}

function readInkManifest(fixtureName: string): InkManifest {
  const raw: unknown = JSON.parse(readFileSync(path.join(FIXTURES_DIR, fixtureName, 'manifest.json'), 'utf8'));
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${fixtureName}/manifest.json is not an object`);
  }
  const record: Record<string, unknown> = { ...raw };
  const inkRaw = record.ink;
  if (typeof inkRaw !== 'object' || inkRaw === null) {
    throw new Error(`${fixtureName}/manifest.json is missing an "ink" tolerance block`);
  }
  const ink: Record<string, unknown> = { ...inkRaw };
  const labelsRaw = record.labels;
  const labels =
    Array.isArray(labelsRaw) && labelsRaw.every((label): label is string => typeof label === 'string')
      ? labelsRaw
      : [];
  return {
    ink: {
      dpi: numberField(ink, 'dpi'),
      minDarkFraction: numberField(ink, 'minDarkFraction'),
      maxDarkFractionRatioDelta: numberField(ink, 'maxDarkFractionRatioDelta'),
      maxBboxEdgeDelta: numberField(ink, 'maxBboxEdgeDelta'),
    },
    labels,
  };
}

/** Read every text file under a fixture's `source/` tree into a project-relative path→content map. */
function readSourceFiles(sourceDirectory: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
      } else if (statSync(absolute).isFile()) {
        files[path.relative(sourceDirectory, absolute).split('\\').join('/')] = readFileSync(absolute, 'utf8');
      }
    }
  };
  walk(sourceDirectory);
  return files;
}

function baseSnapshot(fixtureName: string, mainFile: string, extra: Partial<ProjectSnapshot>): ProjectSnapshot {
  const sourceDirectory = path.join(FIXTURES_DIR, fixtureName, 'source');
  return {
    files: readSourceFiles(sourceDirectory),
    binaryAssets: {},
    rootPath: mainFile,
    openPath: mainFile,
    fontPaths: [],
    attributes: {},
    ...extra,
  };
}

function referencePath(fixtureName: string, file: string): string {
  return path.join(FIXTURES_DIR, fixtureName, file);
}

test.describe('PDF reference parity (render vs external build)', () => {
  let engine: ParityEngine;
  let mathjaxServer: StaticServer;

  test.beforeAll(async () => {
    test.skip(
      !enginePresent,
      `Asciidoctor-PDF wasm engine not present at ${WASM_PATH}; build it to enable the parity suite.`,
    );
    engine = await createParityEngine(WASM_PATH);
    mathjaxServer = await startStaticServer(MATHJAX_ES5_DIR);
  });

  test.afterAll(async () => {
    engine?.dispose();
    await mathjaxServer?.stop();
  });

  // -------------------------------------------------------------------------
  // code: highlighted [source,ruby] + [source,js], source-highlighter: rouge.
  // -------------------------------------------------------------------------
  test('code: highlighted source text is present and placed', async () => {
    const referenceFile = referencePath('code', 'reference.pdf');
    test.skip(!existsSync(referenceFile), 'code/reference.pdf not committed yet.');

    const snapshot = baseSnapshot('code', 'main.adoc', {});
    const { pdfBytes } = await renderOurs(snapshot, nodeShims(), engine);

    const referenceBytes = new Uint8Array(readFileSync(referenceFile));
    expect(pageCount(pdfBytes), 'page count vs reference').toBe(pageCount(referenceBytes));

    const oursText = extractText(pdfBytes);
    const referenceText = extractText(referenceBytes);
    // Every code fragment the reference render places must survive into our render too.
    for (const fragment of ['fibonacci', 'console.log', 'def ', 'const ', 'puts', 'return']) {
      expect(referenceText, `reference contains ${JSON.stringify(fragment)}`).toContain(fragment);
      expect(oursText, `ours contains ${JSON.stringify(fragment)}`).toContain(fragment);
    }
  });

  // -------------------------------------------------------------------------
  // citations: numeric + author-date CSL, appearance + alphabetical ordering.
  // -------------------------------------------------------------------------
  const CITATION_VARIANTS = [
    { id: 'numeric-appearance', style: 'vancouver', order: 'appearance' },
    { id: 'numeric-alphabetical', style: 'vancouver', order: 'alphabetical' },
    { id: 'author-date-appearance', style: 'apa', order: 'appearance' },
    { id: 'author-date-alphabetical', style: 'apa', order: 'alphabetical' },
  ];

  for (const variant of CITATION_VARIANTS) {
    test(`citations: ${variant.id} matches the reference bibliography`, async () => {
      const referenceFile = referencePath('citations', `reference-${variant.id}.pdf`);
      test.skip(!existsSync(referenceFile), `citations/reference-${variant.id}.pdf not committed yet.`);

      const snapshot = baseSnapshot('citations', 'main.adoc', {
        bibPath: 'refs.bib',
        attributes: { 'bibtex-style': variant.style, 'bibtex-order': variant.order },
      });
      const { pdfBytes, diagnostics } = await renderOurs(snapshot, nodeShims(), engine);
      expect(diagnostics, `no citation diagnostics: ${JSON.stringify(diagnostics)}`).toHaveLength(0);

      const referenceBytes = new Uint8Array(readFileSync(referenceFile));
      const oursFacts = extractCitationFacts(extractText(pdfBytes));
      const referenceFacts = extractCitationFacts(extractText(referenceBytes));

      // The reference build is correct by construction; assert it parsed as expected before diffing.
      expect(referenceFacts.referenceOrder, 'reference has all works').toHaveLength(CITED_WORKS.length);

      const mismatches = compareCitationFacts(oursFacts, referenceFacts, isNumericStyle(variant.style));
      expect(mismatches, `citation divergence(s): ${JSON.stringify(mismatches, null, 2)}`).toHaveLength(0);

      // Self-check: our rewriter emits reference-list back-links (the ↑ glyph), the anchor/back-link
      // model the reference's forward hyperlinks correspond to.
      expect(extractText(pdfBytes), 'our reference entries carry back-links').toContain('↑');
    });
  }

  // -------------------------------------------------------------------------
  // math + diagrams: shim-rendered SVGs embedded by the engine, compared to the
  // reference gem embedding the SAME assets, structurally (rasterized ink map).
  // -------------------------------------------------------------------------
  for (const fixtureName of ['math', 'diagrams']) {
    test(`${fixtureName}: shim-rendered artifacts are present and placed`, async ({ page }) => {
      const referenceFile = referencePath(fixtureName, 'reference.pdf');
      test.skip(!existsSync(referenceFile), `${fixtureName}/reference.pdf not committed yet.`);
      test.skip(!existsSync(MERMAID_BUNDLE), 'mermaid bundle not installed.');

      const manifest = readInkManifest(fixtureName);
      const shims = browserShims(page, {
        mermaidBundlePath: MERMAID_BUNDLE,
        mathjaxBaseUrl: mathjaxServer.baseUrl,
      });
      const snapshot = baseSnapshot(fixtureName, 'main.adoc', {});
      const { pdfBytes, diagnostics } = await renderOurs(snapshot, shims, engine);
      expect(diagnostics, `no render diagnostics: ${JSON.stringify(diagnostics)}`).toHaveLength(0);

      const referenceBytes = new Uint8Array(readFileSync(referenceFile));
      expect(pageCount(pdfBytes), 'page count vs reference').toBe(pageCount(referenceBytes));

      const oursInk = pageInkMaps(pdfBytes, manifest.ink.dpi);
      const referenceInk = pageInkMaps(referenceBytes, manifest.ink.dpi);
      const inkMismatches = compareInkMaps(oursInk, referenceInk, manifest.ink);
      expect(inkMismatches, `ink-map divergence: ${JSON.stringify(inkMismatches, null, 2)}`).toHaveLength(0);

      // Text labels the diagram engines emit as SVG <text> must survive into both renders.
      if (manifest.labels.length > 0) {
        const oursText = extractText(pdfBytes);
        const referenceText = extractText(referenceBytes);
        for (const label of manifest.labels) {
          expect(referenceText, `reference contains label ${JSON.stringify(label)}`).toContain(label);
          expect(oursText, `ours contains label ${JSON.stringify(label)}`).toContain(label);
        }
      }
    });
  }
});
