/**
 * @file Standalone Node ESM harness that exercises the REAL Asciidoctor-PDF wasm engine through the
 * package's own typed bridge / warm-VM facade — no browser, no worker. It is invoked directly by Node
 * (the gated jest integration test spawns it) and prints a single machine-readable JSON summary on its
 * last stdout line; all human-readable progress goes to stderr.
 *
 * It covers three measurement/verification concerns against one warm VM instantiated exactly once:
 *
 *   1. Syntax highlighting — a document with `[source,ruby]` / `[source,js]` blocks and the rouge
 *      highlighter must convert cleanly with no "highlighter unavailable" engine warning, and (when a
 *      PDF text extractor is available) the code text must survive into the PDF.
 *   2. Deterministic output — converting the same input twice on the warm VM and normalizing each
 *      result must yield byte-identical bytes; normalization must also be idempotent.
 *   3. Performance — cold-start (module compile + first warmup), first-convert, and warm re-convert
 *      timings plus artifact sizes (raw + brotli).
 *
 * The engine is loaded ONLY through the built package (`dist/`): the WASI bridge, the warm-VM facade,
 * the attribute builder and the deterministic normalizer are all the real shipping code paths. The
 * ESM-only interop libraries are bound lazily inside the bridge itself, exactly as in production.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { brotliCompressSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, '..', '..');
const DIST = join(PACKAGE_ROOT, 'dist');
const WASM_PATH = join(PACKAGE_ROOT, 'ruby', 'asciidoctor-pdf.wasm');

// The built package is CommonJS; pull the real engine seams straight out of dist so the harness
// exercises the shipping code rather than a recompiled copy.
const { createWasiBridge } = require(join(DIST, 'vm', 'wasi-bridge.js'));
const { createRubyPdfVm } = require(join(DIST, 'vm', 'ruby-pdf-vm.js'));
const { populateProject } = require(join(DIST, 'vfs', 'populate.js'));
const { buildConvertAttributes, invokeConvert } = require(join(DIST, 'convert', 'invoke.js'));
const { normalizePdfBytes } = require(join(DIST, 'convert', 'normalize-pdf.js'));

// ---------------------------------------------------------------------------
// Fixture: a document whose highlighting exercises the rouge integration in two languages.
// ---------------------------------------------------------------------------

const ROOT_DOC = 'doc.adoc';
const DOC_SOURCE = [
  '= Syntax Highlighting Reference',
  ':source-highlighter: rouge',
  '',
  'A short paragraph precedes the highlighted code so the render has body text.',
  '',
  '[source,ruby]',
  '----',
  'def greet(subject)',
  '  puts "Hello, #{subject}!"',
  'end',
  '',
  'greet("world")',
  '----',
  '',
  '[source,js]',
  '----',
  'const greet = (subject) => {',
  '  console.log(`Hello, ${subject}!`);',
  '};',
  '',
  'greet("world");',
  '----',
  '',
].join('\n');

// Distinctive substrings expected to survive into the rendered PDF text layer when highlighting is
// active (the tokenizer wraps them in spans but the literal characters remain).
const EXPECTED_CODE_FRAGMENTS = ['greet', 'Hello', 'console.log'];

// Message shapes Asciidoctor emits when a requested highlighter gem is missing/inert. Detecting any
// of these means the highlighting is NOT actually happening.
const HIGHLIGHTER_UNAVAILABLE_PATTERN = /(rouge|highlight).*(not installed|unavailable|disabled|missing)/i;

function buildSnapshot() {
  return {
    files: { [ROOT_DOC]: DOC_SOURCE },
    binaryAssets: {},
    rootPath: ROOT_DOC,
    openPath: ROOT_DOC,
    fontPaths: [],
    attributes: {},
  };
}

// ---------------------------------------------------------------------------
// Ruby program: convert the populated project capturing the FULL engine log so a highlighter-
// unavailable warning is visible (the packaged convert path deliberately filters warnings down to a
// per-resource subset, which would hide it). Mirrors the shipping convert semantics otherwise.
// ---------------------------------------------------------------------------

const PROBE_OUTPUT = '/out/probe.pdf';

function rubyString(value) {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function rubyHash(attributes) {
  const entries = Object.entries(attributes).map(
    ([key, value]) => `${rubyString(key)} => ${value === null ? 'nil' : rubyString(value)}`,
  );
  return `{ ${entries.join(', ')} }`;
}

function buildProbeConvertCode(attributes) {
  return [
    "require 'json'",
    "require 'asciidoctor'",
    "require 'asciidoctor-pdf'",
    'begin',
    '  logger = Asciidoctor::MemoryLogger.new',
    '  Asciidoctor::LoggerManager.logger = logger',
    `  Asciidoctor.convert_file('/project/${ROOT_DOC}', backend: 'pdf', safe: :unsafe, ` +
      `to_file: '${PROBE_OUTPUT}', mkdirs: true, attributes: ${rubyHash(attributes)})`,
    "  warnings = logger.messages.map { |m| { 'severity' => m[:severity].to_s, " +
      "'message' => (m[:message].is_a?(::Hash) ? m[:message][:text] : m[:message]).to_s } }",
    "  JSON.generate({ 'ok' => true, 'warnings' => warnings })",
    'rescue => e',
    "  JSON.generate({ 'ok' => false, 'code' => e.class.name, 'message' => e.message })",
    'end',
  ].join('\n');
}

const ROUGE_REQUIRE_PROBE = [
  'begin',
  "  require 'rouge'",
  "  'true'",
  'rescue ::LoadError, ::StandardError',
  "  'false'",
  'end',
].join('\n');

// ---------------------------------------------------------------------------
// Small utilities.
// ---------------------------------------------------------------------------

const now = () => Number(process.hrtime.bigint()) / 1e6;

function log(message) {
  process.stderr.write(`${message}\n`);
}

function isPdf(bytes) {
  const header = Buffer.from(bytes.slice(0, 5)).toString('latin1');
  return header === '%PDF-';
}

function bytesEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function firstDiffOffset(a, b) {
  const limit = Math.min(a.length, b.length);
  for (let i = 0; i < limit; i += 1) {
    if (a[i] !== b[i]) {
      return i;
    }
  }
  return a.length === b.length ? -1 : limit;
}

// Extract the PDF text layer with poppler's pdftotext when present; returns null when the tool is
// unavailable so the caller can fall back to warning-based verification.
function extractPdfText(rawPdf) {
  const probe = spawnSync('pdftotext', ['-v'], { stdio: 'ignore' });
  if (probe.error) {
    return null;
  }
  const dir = mkdtempSync(join(tmpdir(), 'engine-smoke-'));
  const pdfFile = join(dir, 'doc.pdf');
  writeFileSync(pdfFile, Buffer.from(rawPdf));
  const result = spawnSync('pdftotext', [pdfFile, '-'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0 || typeof result.stdout !== 'string') {
    return null;
  }
  return result.stdout;
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

async function main() {
  if (!existsSync(WASM_PATH)) {
    log(`wasm engine not present at ${WASM_PATH}; nothing to measure.`);
    process.stdout.write(`${JSON.stringify({ ran: false, reason: 'wasm-absent' })}\n`);
    return;
  }

  // Cold start: read + compile the wasm module, then warm the VM once.
  const wasmBytes = readFileSync(WASM_PATH);
  log(`Compiling wasm module (${(wasmBytes.length / (1024 * 1024)).toFixed(1)} MiB)...`);
  const compileStart = now();
  const module = await WebAssembly.compile(wasmBytes);
  const moduleCompileMs = now() - compileStart;

  const vm = createRubyPdfVm({ createBridge: () => createWasiBridge({ module }) });
  log('Warming VM (instantiate + Ruby boot)...');
  const warmupStart = now();
  const warmupOutcome = await vm.warmup();
  const warmupMs = now() - warmupStart;
  const coldStartMs = moduleCompileMs + warmupMs;
  log(`Cold start: compile ${moduleCompileMs.toFixed(0)}ms + warmup ${warmupMs.toFixed(0)}ms (coldStart=${warmupOutcome.coldStart}).`);

  // Populate /project once; the warm VM keeps it across every convert.
  const snapshot = buildSnapshot();
  populateProject(vm, snapshot);
  const attributes = buildConvertAttributes(snapshot);
  log(`Convert attributes: ${JSON.stringify(attributes)}`);

  // Does the highlighter gem actually load inside the VM?
  const rougeRequireable = vm.eval(ROUGE_REQUIRE_PROBE).toString().trim() === 'true';
  log(`rouge require inside VM: ${rougeRequireable}`);

  const request = { requestId: 'engine-smoke', mode: 'export', snapshot, optimize: false };

  // First convert (through the real packaged invoke path — buildConvertCode + normalizePdfBytes).
  const firstStart = now();
  const first = await invokeConvert({ vm, request });
  const firstConvertMs = now() - firstStart;
  if (!first.ok) {
    throw new Error(`First convert failed: ${first.error.phase}/${first.error.code}: ${first.error.message}`);
  }
  log(`First convert: ${firstConvertMs.toFixed(0)}ms, ${first.bytes.length} normalized bytes.`);

  // Source map: the real convert path writes /out/sourcemap.json via the tracking hook and reads it
  // back onto `first.sourceMap`. Verify it is non-empty, line-sorted, and every entry is plausible.
  const sourceMapEntries = Array.isArray(first.sourceMap) ? first.sourceMap : [];
  let sourceMapSorted = true;
  for (let index = 1; index < sourceMapEntries.length; index += 1) {
    if (sourceMapEntries[index].line < sourceMapEntries[index - 1].line) {
      sourceMapSorted = false;
    }
  }
  const sourceMapEntryValid = (entry) =>
    Number.isInteger(entry.line) &&
    entry.line > 0 &&
    Number.isInteger(entry.page) &&
    entry.page > 0 &&
    typeof entry.yFraction === 'number' &&
    entry.yFraction >= 0 &&
    entry.yFraction <= 1;
  const sourceMapAllValid = sourceMapEntries.length > 0 && sourceMapEntries.every(sourceMapEntryValid);
  log(`Source map: ${sourceMapEntries.length} entries, sorted=${sourceMapSorted}, allValid=${sourceMapAllValid}`);
  log(`Source map sample: ${JSON.stringify(sourceMapEntries.slice(0, 8))}`);

  // Warm re-convert (same input, same warm VM).
  const warmStart = now();
  const second = await invokeConvert({ vm, request });
  const warmReconvertMs = now() - warmStart;
  if (!second.ok) {
    throw new Error(`Warm re-convert failed: ${second.error.phase}/${second.error.code}: ${second.error.message}`);
  }
  log(`Warm re-convert: ${warmReconvertMs.toFixed(0)}ms, ${second.bytes.length} normalized bytes.`);

  // Determinism: the two normalized outputs must be byte-identical; normalize must be idempotent.
  const byteIdentical = bytesEqual(first.bytes, second.bytes);
  const diffOffset = byteIdentical ? -1 : firstDiffOffset(first.bytes, second.bytes);
  const idempotent = bytesEqual(first.bytes, normalizePdfBytes(first.bytes));
  log(`Determinism: byteIdentical=${byteIdentical} idempotent=${idempotent}${byteIdentical ? '' : ` firstDiff@${diffOffset}`}`);

  // Full-warning convert for the highlighting check + a raw (valid, un-normalized) PDF for text
  // extraction.
  const probeValue = await vm.evalAsync(buildProbeConvertCode(attributes));
  const probeRaw = JSON.parse(probeValue.toString());
  const probeOk = probeRaw.ok === true;
  const probeWarnings = Array.isArray(probeRaw.warnings) ? probeRaw.warnings : [];
  const highlighterWarnings = probeWarnings.filter((w) => HIGHLIGHTER_UNAVAILABLE_PATTERN.test(String(w.message)));
  log(`Probe convert ok=${probeOk}, warnings=${probeWarnings.length}, highlighter-unavailable=${highlighterWarnings.length}`);

  let rawProbePdf = null;
  if (probeOk) {
    rawProbePdf = vm.readFile(PROBE_OUTPUT);
    vm.removeFile(PROBE_OUTPUT);
  }

  // Text-layer verification (best-effort; null when no extractor is installed).
  let extractedText = null;
  const foundFragments = {};
  if (rawProbePdf !== null) {
    extractedText = extractPdfText(rawProbePdf);
    if (extractedText !== null) {
      for (const fragment of EXPECTED_CODE_FRAGMENTS) {
        foundFragments[fragment] = extractedText.includes(fragment);
      }
    }
  }

  // Sizes: raw engine output + brotli-compressed, from the un-normalized probe render.
  const rawPdfBytes = rawProbePdf !== null ? rawProbePdf.length : first.bytes.length;
  const brotliBytes = brotliCompressSync(Buffer.from(rawProbePdf ?? first.bytes)).length;

  // Suggested warm re-render budget: the measured warm time plus generous headroom, rounded up to a
  // clean ceiling so it is a stable, assertable number rather than a moving measurement.
  const suggestedWarmBudgetMs = Math.max(500, Math.ceil((warmReconvertMs * 2) / 500) * 500);

  const summary = {
    ran: true,
    wasm: { path: WASM_PATH, bytes: wasmBytes.length },
    timings: {
      moduleCompileMs: Math.round(moduleCompileMs),
      warmupMs: Math.round(warmupMs),
      coldStartMs: Math.round(coldStartMs),
      firstConvertMs: Math.round(firstConvertMs),
      warmReconvertMs: Math.round(warmReconvertMs),
    },
    sizes: { rawPdfBytes, brotliBytes, normalizedPdfBytes: first.bytes.length },
    highlighting: {
      convertOk: first.ok && probeOk,
      rougeRequireable,
      firstConvertIsPdf: isPdf(first.bytes),
      highlighterUnavailableWarnings: highlighterWarnings.map((w) => w.message),
      totalEngineWarnings: probeWarnings.length,
      textExtractorAvailable: extractedText !== null,
      foundCodeFragments: foundFragments,
    },
    determinism: {
      byteIdentical,
      firstDiffOffset: diffOffset,
      normalizedLen1: first.bytes.length,
      normalizedLen2: second.bytes.length,
      idempotentNormalize: idempotent,
    },
    sourceMap: {
      entryCount: sourceMapEntries.length,
      sorted: sourceMapSorted,
      allEntriesValid: sourceMapAllValid,
      sample: sourceMapEntries.slice(0, 8),
    },
    suggestedWarmBudgetMs,
  };

  vm.dispose();
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

main().catch((error) => {
  log(`Harness failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.stdout.write(`${JSON.stringify({ ran: false, reason: 'error', message: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 1;
});
