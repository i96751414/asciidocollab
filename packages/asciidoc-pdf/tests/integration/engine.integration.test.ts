/**
 * @file Gated integration test that drives the REAL Asciidoctor-PDF wasm engine through the package's
 * own bridge and asserts on syntax highlighting, deterministic output, and performance timings.
 *
 * The engine wasm is a large, separately-built artifact that is not present in a clean checkout or on
 * CI without the dedicated build job. This test therefore SKIPS when the wasm is absent (keeping the
 * suite green everywhere) and runs the real assertions only when it is present. The heavy lifting
 * happens in a standalone Node ESM harness (`engine-smoke.mjs`) — the ESM-only interop libraries are
 * awkward under ts-jest/CommonJS, so the harness runs as its own Node process and this test spawns it,
 * parses its JSON summary, and asserts on the measured results.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const HARNESS = path.join(__dirname, 'engine-smoke.mjs');
const WASM_PATH = path.join(__dirname, '..', '..', 'ruby', 'asciidoctor-pdf.wasm');
const enginePresent = existsSync(WASM_PATH);

interface HarnessTimings {
  readonly moduleCompileMs: number;
  readonly warmupMs: number;
  readonly coldStartMs: number;
  readonly firstConvertMs: number;
  readonly warmReconvertMs: number;
}

interface HarnessHighlighting {
  readonly convertOk: boolean;
  readonly rougeRequireable: boolean;
  readonly firstConvertIsPdf: boolean;
  readonly highlighterUnavailableWarnings: readonly string[];
  readonly totalEngineWarnings: number;
  readonly textExtractorAvailable: boolean;
  readonly foundCodeFragments: Readonly<Record<string, boolean>>;
}

interface HarnessDeterminism {
  readonly byteIdentical: boolean;
  readonly firstDiffOffset: number;
  readonly idempotentNormalize: boolean;
}

interface HarnessSourceMapEntry {
  readonly line: number;
  readonly page: number;
  readonly yFraction: number;
}

interface HarnessSourceMap {
  readonly entryCount: number;
  readonly sorted: boolean;
  readonly allEntriesValid: boolean;
  readonly sample: readonly HarnessSourceMapEntry[];
}

interface HarnessSummary {
  readonly ran: true;
  readonly timings: HarnessTimings;
  readonly sizes: { readonly rawPdfBytes: number; readonly brotliBytes: number };
  readonly highlighting: HarnessHighlighting;
  readonly determinism: HarnessDeterminism;
  readonly sourceMap: HarnessSourceMap;
  readonly suggestedWarmBudgetMs: number;
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

function stringArray(value: unknown, location: string): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Expected an array at ${location}, got ${typeof value}`);
  }
  return value.map((item, index) => {
    if (typeof item !== 'string') {
      throw new TypeError(`Expected a string at ${location}[${String(index)}], got ${typeof item}`);
    }
    return item;
  });
}

function booleanRecord(value: unknown, location: string): Record<string, boolean> {
  const source = record(value, location);
  const out: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(source)) {
    out[key] = booleanAt(entry, `${location}.${key}`);
  }
  return out;
}

function parseSummary(value: unknown): HarnessSummary {
  const root = record(value, 'summary');
  if (root['ran'] !== true) {
    throw new TypeError(`Harness did not run to completion: ${JSON.stringify(root)}`);
  }
  const timings = record(root['timings'], 'timings');
  const sizes = record(root['sizes'], 'sizes');
  const highlighting = record(root['highlighting'], 'highlighting');
  const determinism = record(root['determinism'], 'determinism');
  const sourceMap = record(root['sourceMap'], 'sourceMap');
  return {
    ran: true,
    timings: {
      moduleCompileMs: numberAt(timings['moduleCompileMs'], 'timings.moduleCompileMs'),
      warmupMs: numberAt(timings['warmupMs'], 'timings.warmupMs'),
      coldStartMs: numberAt(timings['coldStartMs'], 'timings.coldStartMs'),
      firstConvertMs: numberAt(timings['firstConvertMs'], 'timings.firstConvertMs'),
      warmReconvertMs: numberAt(timings['warmReconvertMs'], 'timings.warmReconvertMs'),
    },
    sizes: {
      rawPdfBytes: numberAt(sizes['rawPdfBytes'], 'sizes.rawPdfBytes'),
      brotliBytes: numberAt(sizes['brotliBytes'], 'sizes.brotliBytes'),
    },
    highlighting: {
      convertOk: booleanAt(highlighting['convertOk'], 'highlighting.convertOk'),
      rougeRequireable: booleanAt(highlighting['rougeRequireable'], 'highlighting.rougeRequireable'),
      firstConvertIsPdf: booleanAt(highlighting['firstConvertIsPdf'], 'highlighting.firstConvertIsPdf'),
      highlighterUnavailableWarnings: stringArray(
        highlighting['highlighterUnavailableWarnings'],
        'highlighting.highlighterUnavailableWarnings',
      ),
      totalEngineWarnings: numberAt(
        highlighting['totalEngineWarnings'],
        'highlighting.totalEngineWarnings',
      ),
      textExtractorAvailable: booleanAt(
        highlighting['textExtractorAvailable'],
        'highlighting.textExtractorAvailable',
      ),
      foundCodeFragments: booleanRecord(
        highlighting['foundCodeFragments'],
        'highlighting.foundCodeFragments',
      ),
    },
    determinism: {
      byteIdentical: booleanAt(determinism['byteIdentical'], 'determinism.byteIdentical'),
      firstDiffOffset: numberAt(determinism['firstDiffOffset'], 'determinism.firstDiffOffset'),
      idempotentNormalize: booleanAt(
        determinism['idempotentNormalize'],
        'determinism.idempotentNormalize',
      ),
    },
    sourceMap: {
      entryCount: numberAt(sourceMap['entryCount'], 'sourceMap.entryCount'),
      sorted: booleanAt(sourceMap['sorted'], 'sourceMap.sorted'),
      allEntriesValid: booleanAt(sourceMap['allEntriesValid'], 'sourceMap.allEntriesValid'),
      sample: sourceMapSample(sourceMap['sample'], 'sourceMap.sample'),
    },
    suggestedWarmBudgetMs: numberAt(root['suggestedWarmBudgetMs'], 'suggestedWarmBudgetMs'),
  };
}

function sourceMapSample(value: unknown, location: string): HarnessSourceMapEntry[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Expected an array at ${location}, got ${typeof value}`);
  }
  return value.map((item, index) => {
    const entry = record(item, `${location}[${String(index)}]`);
    return {
      line: numberAt(entry['line'], `${location}[${String(index)}].line`),
      page: numberAt(entry['page'], `${location}[${String(index)}].page`),
      yFraction: numberAt(entry['yFraction'], `${location}[${String(index)}].yFraction`),
    };
  });
}

function runHarness(): HarnessSummary {
  const result = spawnSync(process.execPath, [HARNESS], {
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
  const parsed: unknown = JSON.parse(lastLine);
  return parseSummary(parsed);
}

const describeOrSkip = enginePresent ? describe : describe.skip;

describeOrSkip('Asciidoctor-PDF engine (real wasm)', () => {
  // Cold-start module compile + two converts + a text-extraction pass: give it plenty of headroom.
  jest.setTimeout(180_000);

  let summary: HarnessSummary;

  beforeAll(() => {
    summary = runHarness();
  });

  it('highlights source blocks via the rouge highlighter with no unavailable-highlighter warning', () => {
    expect(summary.highlighting.convertOk).toBe(true);
    expect(summary.highlighting.firstConvertIsPdf).toBe(true);
    expect(summary.highlighting.rougeRequireable).toBe(true);
    expect(summary.highlighting.highlighterUnavailableWarnings).toEqual([]);

    // When a PDF text extractor is available, the highlighted code text must survive into the PDF.
    // Otherwise the clean convert + zero highlighter warnings above stand as the verification.
    if (summary.highlighting.textExtractorAvailable) {
      for (const [fragment, found] of Object.entries(summary.highlighting.foundCodeFragments)) {
        expect(`${fragment}:${String(found)}`).toBe(`${fragment}:true`);
      }
    }
  });

  it('produces byte-identical output for identical input and a stable (idempotent) normalization', () => {
    expect(summary.determinism.byteIdentical).toBe(true);
    expect(summary.determinism.firstDiffOffset).toBe(-1);
    expect(summary.determinism.idempotentNormalize).toBe(true);
  });

  it('records positive cold-start, first-convert, and warm re-convert timings', () => {
    expect(summary.timings.coldStartMs).toBeGreaterThan(0);
    expect(summary.timings.firstConvertMs).toBeGreaterThan(0);
    expect(summary.timings.warmReconvertMs).toBeGreaterThan(0);
    expect(summary.sizes.rawPdfBytes).toBeGreaterThan(0);
  });

  it('renders a warm re-convert within the pinned preview-latency budget', () => {
    expect(summary.timings.warmReconvertMs).toBeLessThan(summary.suggestedWarmBudgetMs);
  });

  it('emits a non-empty, line-sorted block source map with plausible page/yFraction values', () => {
    // This is the proof the runtime Ruby tracking hook actually laid down entries as the PDF was
    // rendered: a real fixture must yield at least one block with a source location.
    expect(summary.sourceMap.entryCount).toBeGreaterThan(0);
    expect(summary.sourceMap.sorted).toBe(true);
    expect(summary.sourceMap.allEntriesValid).toBe(true);

    // The emitted sample is surfaced here so the coordinates are visible in the run log.
    // eslint-disable-next-line no-console
    console.info('Emitted source map sample:', JSON.stringify(summary.sourceMap.sample));

    for (const entry of summary.sourceMap.sample) {
      expect(Number.isInteger(entry.line)).toBe(true);
      expect(entry.line).toBeGreaterThan(0);
      expect(entry.page).toBeGreaterThan(0);
      expect(entry.yFraction).toBeGreaterThanOrEqual(0);
      expect(entry.yFraction).toBeLessThanOrEqual(1);
    }
  });
});
