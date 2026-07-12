import {
  createShimRegistry,
  type RenderShim,
  type ShimRegistry,
} from '../../src/ports/shim';
import {
  cancellationToken,
  createDiagnosticsCollector,
  runPipeline,
  StageDiagnosticError,
  PIPELINE_STAGE_ORDER,
  type CancellationToken,
  type AssetCachePort,
  type PipelineStage,
  type PipelineVfs,
  type StageContext,
  type StageResult,
} from '../../src/pipeline/orchestrator';
import type { GeneratedAsset, PipelineStageKind, RenderDiagnostic, RenderRequest } from '../../src/protocol';
import type { AssembledDocument, IncludeAssembler, ProjectFileReader } from '../../src/ports/include-assembler';

// ---------------------------------------------------------------------------
// In-memory fakes for every injected seam. The orchestrator is pure w.r.t.
// these, so an in-process fake context fully exercises sequencing/cancellation.
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<RenderRequest> = {}): RenderRequest {
  return {
    requestId: 'req-1',
    mode: 'export',
    optimize: false,
    snapshot: {
      files: {},
      binaryAssets: {},
      rootPath: 'main.adoc',
      openPath: 'main.adoc',
      fontPaths: [],
      attributes: {},
    },
    ...overrides,
  };
}

function makeVfs(): PipelineVfs {
  const store = new Map<string, Uint8Array>();
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  return {
    writeFile: (path, bytes) => void store.set(path, bytes),
    readFile: (path) => store.get(path) ?? null,
    writeText: (path, content) => void store.set(path, enc.encode(content)),
    readText: (path) => {
      const bytes = store.get(path);
      return bytes === undefined ? null : dec.decode(bytes);
    },
    exists: (path) => store.has(path),
    remove: (path) => void store.delete(path),
    list: (prefix) => [...store.keys()].filter((key) => key.startsWith(prefix)),
  };
}

const noopReadFile: ProjectFileReader = () => null;

const noopAssembler: IncludeAssembler = {
  assemble: (request): AssembledDocument => ({
    content: request.readFile(request.rootPath) ?? '',
    unresolved: [],
  }),
};

function makeCache(): AssetCachePort {
  const store = new Map<string, GeneratedAsset>();
  return {
    get: (hash) => store.get(hash),
    has: (hash) => store.has(hash),
    set: (asset) => void store.set(asset.sourceHash, asset),
  };
}

function makeContext(overrides: Partial<StageContext> = {}): StageContext {
  return {
    request: makeRequest(),
    readFile: noopReadFile,
    vfs: makeVfs(),
    shims: createShimRegistry([]),
    includeAssembler: noopAssembler,
    cache: makeCache(),
    diagnostics: createDiagnosticsCollector(),
    cancellation: cancellationToken(() => false),
    ...overrides,
  };
}

function diagnostic(resource: string): RenderDiagnostic {
  return {
    severity: 'warning',
    code: 'malformed-diagram',
    resource,
    message: `problem with ${resource}`,
  };
}

/** A fake stage that records when it runs and can return diagnostics, throw, or mutate state. */
function fakeStage(
  kind: PipelineStageKind,
  log: PipelineStageKind[],
  behavior: (context: StageContext) => StageResult | void = () => undefined,
): PipelineStage {
  return {
    kind,
    run: async (context) => {
      log.push(kind);
      return behavior(context) ?? {};
    },
  };
}

describe('runPipeline', () => {
  describe('ordering', () => {
    it('exposes the fixed stage order matching the protocol contract', () => {
      expect([...PIPELINE_STAGE_ORDER]).toEqual([
        'include-resolve',
        'citations',
        'diagrams-math',
        'image-guard',
        'mount-assets',
        'convert',
      ]);
    });

    it('runs stages in the fixed order regardless of registration order', async () => {
      const log: PipelineStageKind[] = [];
      const scrambled: PipelineStage[] = [
        fakeStage('convert', log),
        fakeStage('include-resolve', log),
        fakeStage('mount-assets', log),
        fakeStage('citations', log),
        fakeStage('image-guard', log),
        fakeStage('diagrams-math', log),
      ];

      const result = await runPipeline(scrambled, makeContext());

      expect(log).toEqual([...PIPELINE_STAGE_ORDER]);
      expect(result.ranStages).toEqual([...PIPELINE_STAGE_ORDER]);
      expect(result.completed).toBe(true);
      expect(result.cancelled).toBe(false);
    });

    it('sequences only the injected subset, still in canonical order', async () => {
      const log: PipelineStageKind[] = [];
      const partial: PipelineStage[] = [
        fakeStage('convert', log),
        fakeStage('include-resolve', log),
      ];

      const result = await runPipeline(partial, makeContext());

      expect(log).toEqual(['include-resolve', 'convert']);
      expect(result.ranStages).toEqual(['include-resolve', 'convert']);
    });
  });

  describe('diagnostics', () => {
    it('accumulates diagnostics reported through the collector across stages', async () => {
      const log: PipelineStageKind[] = [];
      const stages: PipelineStage[] = [
        fakeStage('include-resolve', log, (context) => {
          context.diagnostics.report(diagnostic('a'));
        }),
        fakeStage('citations', log, (context) => {
          context.diagnostics.report(diagnostic('b'));
        }),
      ];

      const result = await runPipeline(stages, makeContext());

      expect(result.diagnostics.map((d) => d.resource)).toEqual(['a', 'b']);
    });

    it('folds diagnostics returned in a StageResult into the accumulated set', async () => {
      const log: PipelineStageKind[] = [];
      const stages: PipelineStage[] = [
        fakeStage('include-resolve', log, () => ({ diagnostics: [diagnostic('returned')] })),
        fakeStage('convert', log),
      ];

      const result = await runPipeline(stages, makeContext());

      expect(log).toEqual(['include-resolve', 'convert']);
      expect(result.diagnostics.map((d) => d.resource)).toEqual(['returned']);
    });

    it('turns a per-block problem RAISED by a stage into a diagnostic without aborting', async () => {
      const log: PipelineStageKind[] = [];
      const stages: PipelineStage[] = [
        fakeStage('diagrams-math', log, () => {
          throw new StageDiagnosticError(diagnostic('raised'));
        }),
        fakeStage('convert', log),
      ];

      const result = await runPipeline(stages, makeContext());

      // The raising stage did NOT abort the pipeline: convert still ran.
      expect(log).toEqual(['diagrams-math', 'convert']);
      expect(result.completed).toBe(true);
      expect(result.diagnostics.map((d) => d.resource)).toEqual(['raised']);
    });

    it('propagates a non-diagnostic throw as a fatal failure', async () => {
      const log: PipelineStageKind[] = [];
      const boom = new Error('vm exploded');
      const stages: PipelineStage[] = [
        fakeStage('include-resolve', log, () => {
          throw boom;
        }),
        fakeStage('convert', log),
      ];

      await expect(runPipeline(stages, makeContext())).rejects.toBe(boom);
      expect(log).toEqual(['include-resolve']);
    });
  });

  describe('cancellation / staleness', () => {
    it('stops at the next stage boundary once the token is tripped; no later stage runs', async () => {
      const log: PipelineStageKind[] = [];
      let superseded = false;
      const cancellation: CancellationToken = cancellationToken(() => superseded);
      const stages: PipelineStage[] = [
        fakeStage('include-resolve', log, () => {
          // A newer requestId arrives while this stage runs.
          superseded = true;
        }),
        fakeStage('citations', log),
        fakeStage('convert', log),
      ];

      const result = await runPipeline(stages, makeContext({ cancellation }));

      expect(log).toEqual(['include-resolve']);
      expect(result.ranStages).toEqual(['include-resolve']);
      expect(result.cancelled).toBe(true);
      expect(result.completed).toBe(false);
    });

    it('does not run any stage when already cancelled before the first boundary', async () => {
      const log: PipelineStageKind[] = [];
      const cancellation: CancellationToken = cancellationToken(() => true);
      const stages: PipelineStage[] = [fakeStage('include-resolve', log), fakeStage('convert', log)];

      const result = await runPipeline(stages, makeContext({ cancellation }));

      expect(log).toEqual([]);
      expect(result.ranStages).toEqual([]);
      expect(result.cancelled).toBe(true);
      expect(result.completed).toBe(false);
    });
  });

  describe('shim registry', () => {
    it('resolves shims by name and by kind for the stages that need them', () => {
      const mermaid: RenderShim = {
        kind: 'diagram',
        name: 'mermaid',
        version: '1.0.0',
        render: async () => ({ ok: false, diagnostic: { code: 'malformed-diagram', message: 'x' } }),
      };
      const citations: RenderShim = {
        kind: 'citations',
        name: 'citation-js',
        version: '2.0.0',
        render: async () => ({ ok: false, diagnostic: { code: 'malformed-citation', message: 'x' } }),
      };
      const registry: ShimRegistry = createShimRegistry([mermaid, citations]);

      expect(registry.byName('mermaid')).toBe(mermaid);
      expect(registry.byName('missing')).toBeUndefined();
      expect(registry.byKind('citations')).toEqual([citations]);
    });
  });
});
