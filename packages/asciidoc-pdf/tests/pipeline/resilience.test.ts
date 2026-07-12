/**
 * Integrated proof that one bad block never sinks the export. Each malformed or exotic input is driven
 * through the WHOLE pre-processing pipeline (the five real stage factories, composed through the real
 * orchestrator) and asserted to (a) surface as its own localized {@link RenderDiagnostic} carrying the
 * correct enumerated `code` and a source `location` where the stage can place one, while (b) the
 * pipeline still runs to completion so the rest of the document survives in the VFS ready to convert.
 * A final case fires every defect at once to prove the property holds in aggregate.
 *
 * This composes the already-built stage factories through the real orchestrator; it does not re-unit-
 * test any individual stage's fail-soft behavior in isolation. (The convert-phase `missing-glyph`
 * classification is not a pre-processing stage and is covered by the convert invocation suite; the
 * font half of that pairing, `font-unavailable`, is reachable here through the asset-mount stage.)
 */

import { createIncludeResolveStage } from '../../src/pipeline/stages/include-resolve';
import { createCitationsStage } from '../../src/pipeline/stages/citations';
import { createDiagramsMathStage } from '../../src/pipeline/stages/diagrams-math';
import { createImageGuardStage } from '../../src/pipeline/stages/image-guard';
import { createMountAssetsStage } from '../../src/pipeline/stages/mount-assets';
import {
  cancellationToken,
  createDiagnosticsCollector,
  runPipeline,
  type AssetCachePort,
  type OrchestratorResult,
  type PipelineStage,
  type PipelineVfs,
  type StageContext,
} from '../../src/pipeline/orchestrator';
import {
  createShimRegistry,
  type RenderShim,
  type ShimOutput,
} from '../../src/ports/shim';
import { GeneratedAssetCache } from '../../src/cache/content-address';
import type { IncludeAssembler, ProjectFileReader, SandboxPathResolver } from '../../src/ports/include-assembler';
import {
  isDiagnosticCode,
  type DiagnosticCode,
  type ProjectSnapshot,
  type RenderDiagnostic,
  type RenderRequest,
} from '../../src/protocol';

// ---------------------------------------------------------------------------
// Shared paths, source fragments, and the injected in-memory seams.
// ---------------------------------------------------------------------------

const ROOT_PATH = 'main.adoc';
const BIB_PATH = 'refs.bib';
const BIB_SOURCE = '@misc{present}';
const MISSING_FONT_PATH = 'fonts/missing.woff';
const EXOTIC_IMAGE = 'poster.psd';
const SURVIVING_PARAGRAPH = 'This paragraph must survive the export.';
const DOCUMENT_TITLE = '= Resilience';

const CITE_MACRO = 'cite:[ghost2020]';
const MERMAID_BLOCK = ['[mermaid]', '----', '!!!not a graph!!!', '----'];
const STEM_BLOCK = ['[stem]', '++++', String.raw`\frac{1}{`, '++++'];
const PLANTUML_BLOCK = ['[plantuml]', '----', '@startuml', 'A -> B', '@enduml', '----'];
const IMAGE_MACRO = `image::${EXOTIC_IMAGE}[]`;

const PROJECT = '/project';
const ROOT_VFS_PATH = `${PROJECT}/${ROOT_PATH}`;
const GEN_PREFIX = `${PROJECT}/.gen/`;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Wrap defect lines in a document that also carries a title and a paragraph that must survive. */
function documentWith(...defect: readonly string[]): string {
  return [DOCUMENT_TITLE, '', SURVIVING_PARAGRAPH, '', ...defect, ''].join('\n');
}

function makeVfs(): PipelineVfs {
  const store = new Map<string, Uint8Array>();
  return {
    writeFile: (path, bytes) => void store.set(path, bytes),
    readFile: (path) => store.get(path) ?? null,
    writeText: (path, content) => void store.set(path, encoder.encode(content)),
    readText: (path) => {
      const bytes = store.get(path);
      return bytes === undefined ? null : decoder.decode(bytes);
    },
    exists: (path) => store.has(path),
    remove: (path) => void store.delete(path),
    list: (prefix) => [...store.keys()].filter((key) => key.startsWith(prefix)),
  };
}

function makeCache(): AssetCachePort {
  const cache = new GeneratedAssetCache();
  return {
    get: (hash) => cache.get(hash),
    has: (hash) => cache.has(hash),
    set: (asset) => cache.set(asset.sourceHash, asset),
  };
}

const echoAssembler: IncludeAssembler = {
  assemble: (request) => ({ content: request.readFile(request.rootPath) ?? '', unresolved: [] }),
};

const passThroughResolver: SandboxPathResolver = (_fromPath, target) => ({ ok: true, path: target });

/** A shim family whose every render reports the source malformed with the given diagnostic. */
function malformedShim(
  kind: RenderShim['kind'],
  name: string,
  code: DiagnosticCode,
  message: string,
): RenderShim {
  const output: ShimOutput = { ok: false, diagnostic: { code, message } };
  return { kind, name, version: '1.0.0', render: () => Promise.resolve(output) };
}

/** A shim that would render successfully — used when a case must exercise a DIFFERENT defect. */
function okShim(kind: RenderShim['kind'], name: string): RenderShim {
  const output: ShimOutput = {
    ok: true,
    asset: { format: 'svg', bytes: encoder.encode('<svg/>'), rasterFallback: false },
  };
  return { kind, name, version: '1.0.0', render: () => Promise.resolve(output) };
}

const malformedDiagramShim = malformedShim('diagram', 'mermaid', 'malformed-diagram', 'invalid mermaid graph');
const malformedMathShim = malformedShim('math', 'mathjax', 'malformed-math', 'unbalanced latex expression');
const malformedCitationsShim = malformedShim('citations', 'citation-js', 'malformed-citation', 'unknown citation key');
const okCitationsShim = okShim('citations', 'citation-js');

/** Per-case configuration of the snapshot and the shims wired into the pipeline. */
interface CaseConfig {
  readonly files: Readonly<Record<string, string>>;
  readonly shims: readonly RenderShim[];
  readonly fontPaths?: readonly string[];
  readonly bibPath?: string;
}

function makeSnapshot(config: CaseConfig): ProjectSnapshot {
  return {
    files: config.files,
    binaryAssets: {},
    rootPath: ROOT_PATH,
    openPath: ROOT_PATH,
    fontPaths: config.fontPaths ?? [],
    bibPath: config.bibPath,
    attributes: {},
  };
}

function makeRequest(snapshot: ProjectSnapshot): RenderRequest {
  return { requestId: 'req-res', mode: 'export', optimize: false, snapshot };
}

function makeContext(snapshot: ProjectSnapshot, vfs: PipelineVfs, shims: readonly RenderShim[]): StageContext {
  const readFile: ProjectFileReader = (path) => snapshot.files[path] ?? null;
  return {
    request: makeRequest(snapshot),
    readFile,
    vfs,
    shims: createShimRegistry(shims),
    includeAssembler: echoAssembler,
    cache: makeCache(),
    diagnostics: createDiagnosticsCollector(),
    cancellation: cancellationToken(() => false),
  };
}

function allStages(): PipelineStage[] {
  return [
    createIncludeResolveStage({ resolveSandboxedPath: passThroughResolver }),
    createCitationsStage(),
    createDiagramsMathStage(),
    createImageGuardStage(),
    createMountAssetsStage({ fontConverter: { woff2ToTtf: (bytes) => bytes } }),
  ];
}

interface CaseRun {
  readonly result: OrchestratorResult;
  readonly diagnostics: readonly RenderDiagnostic[];
  readonly rootInVfs: string;
  readonly genAssets: readonly string[];
}

/** Compose the real stages over a case's snapshot and return the integrated outcome. */
async function runCase(config: CaseConfig): Promise<CaseRun> {
  const snapshot = makeSnapshot(config);
  const vfs = makeVfs();
  const result = await runPipeline(allStages(), makeContext(snapshot, vfs, config.shims));
  return {
    result,
    diagnostics: result.diagnostics,
    rootInVfs: vfs.readText(ROOT_VFS_PATH) ?? '',
    genAssets: vfs.list(GEN_PREFIX),
  };
}

function findByCode(
  diagnostics: readonly RenderDiagnostic[],
  code: DiagnosticCode,
): RenderDiagnostic | undefined {
  return diagnostics.find((diagnostic) => diagnostic.code === code);
}

/** Every property that makes "one bad block doesn't sink the export" true, asserted for one run. */
function expectExportSurvived(run: CaseRun): void {
  expect(run.result.completed).toBe(true);
  expect(run.result.cancelled).toBe(false);
  for (const diagnostic of run.diagnostics) {
    expect(isDiagnosticCode(diagnostic.code)).toBe(true);
  }
  expect(run.rootInVfs).toContain(DOCUMENT_TITLE);
  expect(run.rootInVfs).toContain(SURVIVING_PARAGRAPH);
}

describe('pipeline malformed/exotic-input resilience', () => {
  it('localizes a malformed diagram yet completes so the rest exports', async () => {
    const run = await runCase({
      files: { [ROOT_PATH]: documentWith(...MERMAID_BLOCK) },
      shims: [malformedDiagramShim],
    });
    expectExportSurvived(run);

    const diagram = findByCode(run.diagnostics, 'malformed-diagram');
    expect(diagram).toBeDefined();
    expect(diagram?.severity).toBe('error');
    expect(diagram?.location?.path).toBe(ROOT_PATH);
    expect(typeof diagram?.location?.line).toBe('number');

    // The malformed block is left verbatim (never rewritten to a `.gen` image), and none was written.
    expect(run.rootInVfs).toContain('!!!not a graph!!!');
    expect(run.rootInVfs).not.toContain('image::.gen/');
    expect(run.genAssets).toHaveLength(0);
  });

  it('localizes malformed math yet completes so the rest exports', async () => {
    const run = await runCase({
      files: { [ROOT_PATH]: documentWith(...STEM_BLOCK) },
      shims: [malformedMathShim],
    });
    expectExportSurvived(run);

    const math = findByCode(run.diagnostics, 'malformed-math');
    expect(math).toBeDefined();
    expect(math?.location?.path).toBe(ROOT_PATH);
    expect(typeof math?.location?.line).toBe('number');
    expect(run.rootInVfs).toContain(String.raw`\frac{1}{`);
    expect(run.genAssets).toHaveLength(0);
  });

  it('localizes a malformed citation (shim rejects the source) yet completes so the rest exports', async () => {
    const run = await runCase({
      files: { [ROOT_PATH]: documentWith(CITE_MACRO), [BIB_PATH]: BIB_SOURCE },
      shims: [malformedCitationsShim],
      bibPath: BIB_PATH,
    });
    expectExportSurvived(run);

    const citation = findByCode(run.diagnostics, 'malformed-citation');
    expect(citation).toBeDefined();
    expect(citation?.resource).toBe(BIB_PATH);
    expect(citation?.location?.path).toBe(ROOT_PATH);
  });

  it('localizes an unparseable/unreadable .bib to the bib file yet completes so the rest exports', async () => {
    // The document cites, and a bib path is declared, but the `.bib` is not readable at all.
    const run = await runCase({
      files: { [ROOT_PATH]: documentWith(CITE_MACRO) },
      shims: [okCitationsShim],
      bibPath: BIB_PATH,
    });
    expectExportSurvived(run);

    const citation = findByCode(run.diagnostics, 'malformed-citation');
    expect(citation).toBeDefined();
    expect(citation?.resource).toBe(BIB_PATH);
    expect(citation?.location?.path).toBe(BIB_PATH);
  });

  it('localizes an unsupported/exotic image format yet completes so the rest exports', async () => {
    const run = await runCase({
      files: { [ROOT_PATH]: documentWith(IMAGE_MACRO) },
      shims: [],
    });
    expectExportSurvived(run);

    const image = findByCode(run.diagnostics, 'unsupported-image');
    expect(image).toBeDefined();
    expect(image?.severity).toBe('warning');
    expect(image?.resource).toBe(EXOTIC_IMAGE);
    expect(image?.location?.path).toBe(ROOT_PATH);
    expect(typeof image?.location?.line).toBe('number');
  });

  it('localizes an unavailable custom font yet completes so the rest exports', async () => {
    const run = await runCase({
      files: { [ROOT_PATH]: documentWith(SURVIVING_PARAGRAPH) },
      shims: [],
      fontPaths: [MISSING_FONT_PATH],
    });
    expectExportSurvived(run);

    const font = findByCode(run.diagnostics, 'font-unavailable');
    expect(font).toBeDefined();
    expect(font?.severity).toBe('warning');
    expect(font?.resource).toBe(MISSING_FONT_PATH);
  });

  it('skips an unsupported diagram engine (PlantUML) with a diagnostic yet completes so the rest exports', async () => {
    const run = await runCase({
      files: { [ROOT_PATH]: documentWith(...PLANTUML_BLOCK) },
      // No diagram shim is even consulted: the engine has no offline renderer and is never fetched.
      shims: [],
    });
    expectExportSurvived(run);

    const unsupported = findByCode(run.diagnostics, 'diagram-unsupported');
    expect(unsupported).toBeDefined();
    expect(unsupported?.location?.path).toBe(ROOT_PATH);
    expect(typeof unsupported?.location?.line).toBe('number');
    // The block is left verbatim — skipped, not rewritten, and no asset was generated.
    expect(run.rootInVfs).toContain('@startuml');
    expect(run.genAssets).toHaveLength(0);
  });

  it('localizes every defect at once yet completes so the whole rest of the document exports', async () => {
    const run = await runCase({
      files: {
        [ROOT_PATH]: documentWith(
          CITE_MACRO,
          '',
          ...MERMAID_BLOCK,
          '',
          ...STEM_BLOCK,
          '',
          ...PLANTUML_BLOCK,
          '',
          IMAGE_MACRO,
        ),
        [BIB_PATH]: BIB_SOURCE,
      },
      shims: [malformedDiagramShim, malformedMathShim, malformedCitationsShim],
      fontPaths: [MISSING_FONT_PATH],
      bibPath: BIB_PATH,
    });
    expectExportSurvived(run);

    // Every enumerated defect surfaced as its own diagnostic in the SAME run.
    for (const code of [
      'malformed-diagram',
      'malformed-math',
      'malformed-citation',
      'unsupported-image',
      'font-unavailable',
      'diagram-unsupported',
    ] satisfies readonly DiagnosticCode[]) {
      expect(findByCode(run.diagnostics, code)).toBeDefined();
    }

    // The rest of the document is intact in the VFS, and no malformed block leaked a generated image.
    expect(run.rootInVfs).toContain('!!!not a graph!!!');
    expect(run.rootInVfs).toContain(String.raw`\frac{1}{`);
    expect(run.rootInVfs).toContain('@startuml');
    expect(run.rootInVfs).not.toContain('image::.gen/');
    expect(run.genAssets).toHaveLength(0);
  });
});
