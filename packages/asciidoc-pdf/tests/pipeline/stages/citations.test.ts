import { createCitationsStage } from '../../../src/pipeline/stages/citations';
import {
  cancellationToken,
  createDiagnosticsCollector,
  type AssetCachePort,
  type PipelineVfs,
  type StageContext,
} from '../../../src/pipeline/orchestrator';
import { createShimRegistry, type RenderShim, type ShimInput, type ShimOutput } from '../../../src/ports/shim';
import { PROJECT_ROOT } from '../../../src/vfs/populate';
import type { GeneratedAsset, ProjectSnapshot, RenderRequest } from '../../../src/protocol';
import type { AssembledDocument, IncludeAssembler, ProjectFileReader } from '../../../src/ports/include-assembler';

// ---------------------------------------------------------------------------
// In-memory fakes for every injected seam, mirroring the orchestrator tests.
// ---------------------------------------------------------------------------

const ROOT_PATH = 'main.adoc';
const BIB_PATH = 'refs.bib';
const ROOT_VFS_PATH = `${PROJECT_ROOT}/${ROOT_PATH}`;
const BIB_VFS_PATH = `${PROJECT_ROOT}/${BIB_PATH}`;

const DOC_WITH_CITATIONS = [
  '= Paper',
  '',
  'As shown cite:knuth1974[] and citenp:dijkstra1968[].',
  '',
  'bibitem:knuth1974[]',
  '',
  'bibliography::[]',
  '',
].join('\n');

const BIB_CONTENT = '@article{knuth1974, title={Structured Programming}}';

const REWRITTEN_DOC = '= Paper\n\nAs shown <<knuth1974>> and Dijkstra.\n\n[[knuth1974]]FORMATTED\n';

const enc = new TextEncoder();

function makeSnapshot(overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return {
    files: {},
    binaryAssets: {},
    rootPath: ROOT_PATH,
    openPath: ROOT_PATH,
    fontPaths: [],
    attributes: {},
    bibPath: BIB_PATH,
    ...overrides,
  };
}

function makeRequest(snapshot: ProjectSnapshot): RenderRequest {
  return { requestId: 'req-1', mode: 'export', optimize: false, snapshot };
}

function makeVfs(seed: Readonly<Record<string, string>> = {}): PipelineVfs {
  const store = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  for (const [path, content] of Object.entries(seed)) {
    store.set(path, enc.encode(content));
  }
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

interface RecordingShim extends RenderShim {
  readonly inputs: ShimInput[];
}

function recordingCitationsShim(output: ShimOutput): RecordingShim {
  const inputs: ShimInput[] = [];
  return {
    kind: 'citations',
    name: 'citation-js',
    version: '1.0.0',
    inputs,
    render: async (input) => {
      inputs.push(input);
      return output;
    },
  };
}

const okOutput: ShimOutput = {
  ok: true,
  asset: { format: 'svg', bytes: enc.encode(REWRITTEN_DOC), rasterFallback: false },
};

const malformedOutput: ShimOutput = {
  ok: false,
  diagnostic: { code: 'malformed-citation', message: 'unknown citation key "dijkstra1968"' },
};

function makeContext(arguments_: {
  snapshot?: ProjectSnapshot;
  vfs?: PipelineVfs;
  shims?: readonly RenderShim[];
  readFile?: ProjectFileReader;
}): StageContext {
  const snapshot = arguments_.snapshot ?? makeSnapshot();
  return {
    request: makeRequest(snapshot),
    readFile: arguments_.readFile ?? noopReadFile,
    vfs: arguments_.vfs ?? makeVfs({ [ROOT_VFS_PATH]: DOC_WITH_CITATIONS, [BIB_VFS_PATH]: BIB_CONTENT }),
    shims: createShimRegistry(arguments_.shims ?? [recordingCitationsShim(okOutput)]),
    includeAssembler: noopAssembler,
    cache: makeCache(),
    diagnostics: createDiagnosticsCollector(),
    cancellation: cancellationToken(() => false),
  };
}

describe('createCitationsStage', () => {
  it('has the citations pipeline-stage kind', () => {
    expect(createCitationsStage().kind).toBe('citations');
  });

  describe('detection + rewrite', () => {
    it('detects citation macros, delegates to the shim, and writes the shim output back to the root doc', async () => {
      const shim = recordingCitationsShim(okOutput);
      const context = makeContext({ shims: [shim] });

      const result = await createCitationsStage().run(context);

      expect(context.vfs.readText(ROOT_VFS_PATH)).toBe(REWRITTEN_DOC);
      expect(result.diagnostics ?? []).toEqual([]);
      expect(shim.inputs).toHaveLength(1);
      // The whole document is handed over in one call so the shim sees every macro occurrence.
      expect(shim.inputs[0]?.source).toBe(DOC_WITH_CITATIONS);
      // The .bib is parsed once: its content rides in the single call's params.
      expect(shim.inputs[0]?.params.bibtex).toBe(BIB_CONTENT);
    });

    it('parses the .bib once — the shim is called a single time regardless of macro count', async () => {
      const shim = recordingCitationsShim(okOutput);
      const context = makeContext({ shims: [shim] });

      await createCitationsStage().run(context);

      expect(shim.inputs).toHaveLength(1);
    });

    it('forwards the CSL style + ordering mode from snapshot attributes to the shim', async () => {
      const shim = recordingCitationsShim(okOutput);
      const context = makeContext({
        snapshot: makeSnapshot({ attributes: { 'bibtex-style': 'ieee', 'bibtex-order': 'alphabetical' } }),
        shims: [shim],
      });

      await createCitationsStage().run(context);

      expect(shim.inputs[0]?.params['bibtex-style']).toBe('ieee');
      expect(shim.inputs[0]?.params['bibtex-order']).toBe('alphabetical');
    });

    it('reads the .bib content from the project file reader when it is not in the VFS', async () => {
      const shim = recordingCitationsShim(okOutput);
      const context = makeContext({
        vfs: makeVfs({ [ROOT_VFS_PATH]: DOC_WITH_CITATIONS }),
        readFile: (path) => (path === BIB_PATH ? BIB_CONTENT : null),
        shims: [shim],
      });

      await createCitationsStage().run(context);

      expect(shim.inputs[0]?.params.bibtex).toBe(BIB_CONTENT);
      expect(context.vfs.readText(ROOT_VFS_PATH)).toBe(REWRITTEN_DOC);
    });
  });

  describe('malformed handling (never aborts)', () => {
    it('maps a shim {ok:false} to a malformed-citation diagnostic and leaves the doc unchanged', async () => {
      const context = makeContext({ shims: [recordingCitationsShim(malformedOutput)] });

      const result = await createCitationsStage().run(context);

      expect(result.diagnostics).toHaveLength(1);
      const diag = result.diagnostics?.[0];
      expect(diag?.code).toBe('malformed-citation');
      expect(diag?.resource).toBe(BIB_PATH);
      expect(diag?.location?.path).toBe(ROOT_PATH);
      expect(diag?.message).toContain('dijkstra1968');
      // The rest of the document still renders: the original source is untouched.
      expect(context.vfs.readText(ROOT_VFS_PATH)).toBe(DOC_WITH_CITATIONS);
    });

    it('emits a malformed-citation diagnostic when the bib source cannot be read', async () => {
      const shim = recordingCitationsShim(okOutput);
      const context = makeContext({
        vfs: makeVfs({ [ROOT_VFS_PATH]: DOC_WITH_CITATIONS }),
        shims: [shim],
      });

      const result = await createCitationsStage().run(context);

      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics?.[0]?.code).toBe('malformed-citation');
      expect(result.diagnostics?.[0]?.location?.path).toBe(BIB_PATH);
      // A missing bib is a per-resource problem, not a fatal one: the shim is never called.
      expect(shim.inputs).toHaveLength(0);
      expect(context.vfs.readText(ROOT_VFS_PATH)).toBe(DOC_WITH_CITATIONS);
    });

    it('does not throw across the boundary on a malformed citation source', async () => {
      const context = makeContext({ shims: [recordingCitationsShim(malformedOutput)] });
      await expect(createCitationsStage().run(context)).resolves.toBeDefined();
    });
  });

  describe('no-op cases', () => {
    it('is a no-op when the project has no bib source', async () => {
      const shim = recordingCitationsShim(okOutput);
      const context = makeContext({ snapshot: makeSnapshot({ bibPath: undefined }), shims: [shim] });

      const result = await createCitationsStage().run(context);

      expect(result.diagnostics ?? []).toEqual([]);
      expect(shim.inputs).toHaveLength(0);
      expect(context.vfs.readText(ROOT_VFS_PATH)).toBe(DOC_WITH_CITATIONS);
    });

    it('is a no-op when the document contains no citation macros', async () => {
      const shim = recordingCitationsShim(okOutput);
      const plainDocument = '= Paper\n\nJust prose, no citations here.\n';
      const context = makeContext({
        vfs: makeVfs({ [ROOT_VFS_PATH]: plainDocument, [BIB_VFS_PATH]: BIB_CONTENT }),
        shims: [shim],
      });

      const result = await createCitationsStage().run(context);

      expect(result.diagnostics ?? []).toEqual([]);
      expect(shim.inputs).toHaveLength(0);
      expect(context.vfs.readText(ROOT_VFS_PATH)).toBe(plainDocument);
    });

    it('is a no-op when no citations shim is registered', async () => {
      const context = makeContext({ shims: [] });

      const result = await createCitationsStage().run(context);

      expect(result.diagnostics ?? []).toEqual([]);
      expect(context.vfs.readText(ROOT_VFS_PATH)).toBe(DOC_WITH_CITATIONS);
    });
  });
});
