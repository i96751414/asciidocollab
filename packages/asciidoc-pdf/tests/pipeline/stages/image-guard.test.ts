import { createImageGuardStage } from '../../../src/pipeline/stages/image-guard';
import {
  cancellationToken,
  createDiagnosticsCollector,
  type AssetCachePort,
  type PipelineVfs,
  type StageContext,
} from '../../../src/pipeline/orchestrator';
import { createShimRegistry } from '../../../src/ports/shim';
import type { GeneratedAsset, ProjectSnapshot, RenderRequest } from '../../../src/protocol';
import type { AssembledDocument, IncludeAssembler, ProjectFileReader } from '../../../src/ports/include-assembler';

// ---------------------------------------------------------------------------
// In-memory fakes for the injected seams. The stage only reads
// `ctx.request.snapshot`, but a full context keeps it exercised as wired.
// ---------------------------------------------------------------------------

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

function makeSnapshot(overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return {
    files: {},
    binaryAssets: {},
    rootPath: 'main.adoc',
    openPath: 'main.adoc',
    fontPaths: [],
    attributes: {},
    ...overrides,
  };
}

function makeContext(snapshot: ProjectSnapshot): StageContext {
  const request: RenderRequest = { requestId: 'req-1', mode: 'export', optimize: false, snapshot };
  return {
    request,
    readFile: noopReadFile,
    vfs: makeVfs(),
    shims: createShimRegistry([]),
    includeAssembler: noopAssembler,
    cache: makeCache(),
    diagnostics: createDiagnosticsCollector(),
    cancellation: cancellationToken(() => false),
  };
}

describe('createImageGuardStage', () => {
  it('has the fixed pipeline kind', () => {
    expect(createImageGuardStage().kind).toBe('image-guard');
  });

  it('passes local PNG/JPG/SVG references (block and inline) without diagnostics', async () => {
    const snapshot = makeSnapshot({
      files: {
        'main.adoc': [
          'image::diagram.png[Diagram]',
          'A logo image:logo.svg[Logo] inline.',
          'image::photo.jpg[Photo]',
          'image::scan.jpeg[Scan]',
        ].join('\n'),
      },
    });

    const result = await createImageGuardStage().run(makeContext(snapshot));

    expect(result.diagnostics ?? []).toEqual([]);
  });

  it('flags an unsupported image format as unsupported-image with source location', async () => {
    const snapshot = makeSnapshot({
      files: { 'main.adoc': 'intro\nimage::animation.gif[Anim]\n' },
    });

    const result = await createImageGuardStage().run(makeContext(snapshot));

    expect(result.diagnostics).toHaveLength(1);
    const [diagnostic] = result.diagnostics ?? [];
    expect(diagnostic?.code).toBe('unsupported-image');
    expect(diagnostic?.severity).toBe('warning');
    expect(diagnostic?.resource).toBe('animation.gif');
    expect(diagnostic?.location).toEqual({ path: 'main.adoc', line: 2 });
  });

  it('skips a remote image reference as remote-skipped and never fetches it', async () => {
    const fetchSpy = jest.fn();
    const originalFetch = globalThis.fetch;
    Reflect.set(globalThis, 'fetch', fetchSpy);
    try {
      const snapshot = makeSnapshot({
        files: { 'main.adoc': 'image::https://cdn.example.com/remote.png[Remote]' },
      });

      const result = await createImageGuardStage().run(makeContext(snapshot));

      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics?.[0]?.code).toBe('remote-skipped');
      expect(result.diagnostics?.[0]?.resource).toBe('https://cdn.example.com/remote.png');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      Reflect.set(globalThis, 'fetch', originalFetch);
    }
  });

  it('treats a sandbox-escaping image reference as remote-skipped', async () => {
    const snapshot = makeSnapshot({
      files: { 'main.adoc': 'image::../../etc/passwd.png[Escape]\nimage::/abs/root.png[Abs]' },
    });

    const result = await createImageGuardStage().run(makeContext(snapshot));

    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics?.every((d) => d.code === 'remote-skipped')).toBe(true);
  });

  it('flags an oversized local image as unsupported-image', async () => {
    const huge = new Uint8Array(11 * 1024 * 1024);
    const snapshot = makeSnapshot({
      files: { 'main.adoc': 'image::big.png[Big]' },
      binaryAssets: { 'big.png': huge },
    });

    const result = await createImageGuardStage().run(makeContext(snapshot));

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics?.[0]?.code).toBe('unsupported-image');
    expect(result.diagnostics?.[0]?.resource).toBe('big.png');
  });

  it('accepts a within-limit local image located via imagesDir', async () => {
    const snapshot = makeSnapshot({
      files: { 'main.adoc': 'image::hero.png[Hero]' },
      imagesDir: 'assets/img',
      binaryAssets: { 'assets/img/hero.png': new Uint8Array([1, 2, 3]) },
    });

    const result = await createImageGuardStage().run(makeContext(snapshot));

    expect(result.diagnostics ?? []).toEqual([]);
  });

  it('produces no diagnostics for a project with no image references', async () => {
    const snapshot = makeSnapshot({ files: { 'main.adoc': '= Title\n\nJust prose, no images.' } });

    const result = await createImageGuardStage().run(makeContext(snapshot));

    expect(result.diagnostics ?? []).toEqual([]);
  });

  it('does not misfire on the word "image:" embedded in a larger token', async () => {
    const snapshot = makeSnapshot({
      files: { 'main.adoc': 'the myimage:notamacro[x] token is prose' },
    });

    const result = await createImageGuardStage().run(makeContext(snapshot));

    expect(result.diagnostics ?? []).toEqual([]);
  });

  it('scans image references inside included source files too', async () => {
    const snapshot = makeSnapshot({
      files: {
        'main.adoc': 'include::chapter.adoc[]',
        'chapter.adoc': 'image::chart.tiff[Chart]',
      },
    });

    const result = await createImageGuardStage().run(makeContext(snapshot));

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics?.[0]?.code).toBe('unsupported-image');
    expect(result.diagnostics?.[0]?.location).toEqual({ path: 'chapter.adoc', line: 1 });
  });
});
