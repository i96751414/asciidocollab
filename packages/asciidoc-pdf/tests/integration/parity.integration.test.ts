/**
 * @file Gated reference-parity integration test. For every committed fixture (project source + a
 * committed `reference.pdf` produced by the external Asciidoctor-PDF toolchain), it renders the SAME
 * project through the real wasm engine and asserts the output matches the reference three ways:
 * content (selectable text equal), print-readiness (fonts embedded, page geometry equal), and visual
 * (per-page pixel diff within the fixture's recorded tolerance).
 *
 * Like `engine.integration.test.ts`, the heavy lifting is a standalone Node ESM harness
 * (`parity-render.mjs`) that this test spawns once per fixture and whose JSON summary it asserts on —
 * the ESM-only wasm/interop and canvas libraries are awkward under ts-jest/CommonJS. The suite SKIPS
 * when the wasm engine is absent (whole suite) or a fixture has no committed reference PDF yet
 * (per fixture), so it stays green on a clean checkout and activates automatically once the artifacts
 * land. The visual comparison additionally self-skips (without failing) if no canvas backend is
 * installed, leaving the content + print-readiness checks as the parity bar in that environment.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const HARNESS = path.join(__dirname, 'parity-render.mjs');
const WASM_PATH = path.join(__dirname, '..', '..', 'ruby', 'asciidoctor-pdf.wasm');
const FIXTURES_DIR = path.join(__dirname, '..', '..', '..', '..', 'apps', 'web', 'e2e', 'pdf-parity', 'fixtures');

const enginePresent = existsSync(WASM_PATH);

interface DiscoveredFixture {
  readonly name: string;
  readonly directory: string;
  readonly referencePresent: boolean;
  readonly textLayerComparable: boolean;
}

/**
 * Whether a fixture's parity can be judged by this Node harness's text-layer + print-readiness checks.
 * Two families opt out: `ink`-based fixtures (math/diagrams) render their content through browser-only
 * shims (MathJax/mermaid/Vega) into SVGs with no text layer, so a headless Node render produces no
 * comparable content and their parity is measured as a rasterized ink-map by the browser Playwright
 * suite; and `variants`-based fixtures (citations) are compared per-variant on reference-list order and
 * numbering — not whole-document text equality — also by the browser suite. Both are skipped here.
 *
 * @param manifest - The fixture's parsed `manifest.json`.
 * @returns True when the fixture exposes a comparable text layer against a single reference PDF.
 */
function isTextLayerComparable(manifest: unknown): boolean {
  if (!isRecord(manifest)) {
    return true;
  }
  return manifest['ink'] === undefined && manifest['variants'] === undefined;
}

/** Enumerate fixtures (immediate sub-dirs with a manifest), noting whether each has a reference PDF. */
function discoverFixtures(): DiscoveredFixture[] {
  if (!existsSync(FIXTURES_DIR)) {
    return [];
  }
  const fixtures: DiscoveredFixture[] = [];
  for (const entry of readdirSync(FIXTURES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const directory = path.join(FIXTURES_DIR, entry.name);
    const manifestPath = path.join(directory, 'manifest.json');
    if (!existsSync(manifestPath)) {
      continue;
    }
    const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const referencePdf =
      isRecord(manifest) && typeof manifest['referencePdf'] === 'string'
        ? manifest['referencePdf']
        : 'reference.pdf';
    fixtures.push({
      name: entry.name,
      directory,
      referencePresent: existsSync(path.join(directory, referencePdf)),
      textLayerComparable: isTextLayerComparable(manifest),
    });
  }
  return fixtures.toSorted((left, right) => left.name.localeCompare(right.name));
}

// ---------------------------------------------------------------------------
// Harness summary parsing (strict, no unchecked casts).
// ---------------------------------------------------------------------------

interface ContentResult {
  readonly ran: boolean;
  readonly equal: boolean;
  readonly ourSelectable: boolean;
}

interface PrintReadinessResult {
  readonly allFontsEmbedded: boolean;
  readonly fontsTotal: number;
  readonly geometryChecked: boolean;
  readonly geometryMatches: boolean;
}

interface VisualResult {
  readonly ran: boolean;
  readonly withinTolerance: boolean;
  readonly worstRatio: number;
  readonly reason?: string;
}

interface ParitySummary {
  readonly ran: true;
  readonly fixture: string;
  readonly unresolvedIncludes: number;
  readonly content: ContentResult;
  readonly printReadiness: PrintReadinessResult;
  readonly visual: VisualResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function record(value: unknown, location: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError(`Expected an object at ${location}, got ${typeof value}`);
  }
  return value;
}

function numberAt(value: unknown, location: string): number {
  if (typeof value !== 'number') {
    throw new TypeError(`Expected a number at ${location}, got ${typeof value}`);
  }
  return value;
}

function booleanAt(value: unknown, location: string): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError(`Expected a boolean at ${location}, got ${typeof value}`);
  }
  return value;
}

function parseSummary(value: unknown): ParitySummary {
  const root = record(value, 'summary');
  if (root['ran'] !== true) {
    throw new TypeError(`Harness did not run to completion: ${JSON.stringify(root)}`);
  }
  const include = record(root['includeResolution'], 'includeResolution');
  const content = record(root['content'], 'content');
  const print = record(root['printReadiness'], 'printReadiness');
  const visual = record(root['visual'], 'visual');
  const visualRan = booleanAt(visual['ran'], 'visual.ran');
  const reason = visual['reason'];
  return {
    ran: true,
    fixture: typeof root['fixture'] === 'string' ? root['fixture'] : '',
    unresolvedIncludes: numberAt(include['unresolved'], 'includeResolution.unresolved'),
    content: {
      ran: booleanAt(content['ran'], 'content.ran'),
      equal: content['ran'] === true ? booleanAt(content['equal'], 'content.equal') : false,
      ourSelectable: content['ran'] === true ? booleanAt(content['ourSelectable'], 'content.ourSelectable') : false,
    },
    printReadiness: {
      allFontsEmbedded: booleanAt(print['allFontsEmbedded'], 'printReadiness.allFontsEmbedded'),
      fontsTotal: numberAt(print['fontsTotal'], 'printReadiness.fontsTotal'),
      geometryChecked: booleanAt(print['geometryChecked'], 'printReadiness.geometryChecked'),
      geometryMatches: booleanAt(print['geometryMatches'], 'printReadiness.geometryMatches'),
    },
    visual: {
      ran: visualRan,
      withinTolerance: visualRan ? booleanAt(visual['withinTolerance'], 'visual.withinTolerance') : false,
      worstRatio: visualRan ? numberAt(visual['worstRatio'], 'visual.worstRatio') : 0,
      reason: typeof reason === 'string' ? reason : undefined,
    },
  };
}

function runHarness(fixtureDirectory: string): ParitySummary {
  const result = spawnSync(process.execPath, [HARNESS, fixtureDirectory], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Harness exited with status ${String(result.status)}:\n${result.stderr}`);
  }
  const lines = result.stdout.trim().split('\n');
  const lastLine = lines.at(-1);
  if (lastLine === undefined) {
    throw new Error(`Harness produced no JSON output. stderr:\n${result.stderr}`);
  }
  return parseSummary(JSON.parse(lastLine));
}

// ---------------------------------------------------------------------------
// Suite.
// ---------------------------------------------------------------------------

const fixtures = discoverFixtures();
const describeOrSkip = enginePresent ? describe : describe.skip;

describeOrSkip('PDF export reference parity (real wasm)', () => {
  // Each fixture cold-starts the wasm VM, renders, and runs poppler + a pixel diff: give it headroom.
  jest.setTimeout(240_000);

  if (fixtures.length === 0) {
    it('has no fixtures to compare yet', () => {
      expect(fixtures).toHaveLength(0);
    });
    return;
  }

  for (const fixture of fixtures) {
    // Skip fixtures whose parity is owned by the browser Playwright suite (ink-map math/diagrams,
    // per-variant citations) — this headless Node harness cannot render their browser-shim content
    // and does not do their specialized structural comparison. See isTextLayerComparable.
    const runOrSkip = fixture.referencePresent && fixture.textLayerComparable ? it : it.skip;
    runOrSkip(`matches the reference build: ${fixture.name}`, () => {
      const summary = runHarness(fixture.directory);

      // Every include directive must resolve (no silent omission).
      expect(summary.unresolvedIncludes).toBe(0);

      // Content parity: selectable body text, equal to the reference after whitespace normalization.
      expect(summary.content.ran).toBe(true);
      expect(summary.content.ourSelectable).toBe(true);
      expect(summary.content.equal).toBe(true);

      // Print-readiness: fonts embedded and page geometry (count + size) matching the reference.
      expect(summary.printReadiness.fontsTotal).toBeGreaterThan(0);
      expect(summary.printReadiness.allFontsEmbedded).toBe(true);
      expect(summary.printReadiness.geometryChecked).toBe(true);
      expect(summary.printReadiness.geometryMatches).toBe(true);

      // Visual parity when a canvas backend is available; otherwise the structural checks above stand.
      if (summary.visual.ran) {
        // Surface the worst ratio in the assertion so a failure reports how far it diverged.
        expect({ withinTolerance: summary.visual.withinTolerance, worstRatio: summary.visual.worstRatio })
          .toEqual({ withinTolerance: true, worstRatio: summary.visual.worstRatio });
      } else {
        // eslint-disable-next-line no-console
        console.warn(`Visual parity skipped for "${fixture.name}": ${summary.visual.reason ?? 'no canvas backend'}`);
      }
    });
  }
});
