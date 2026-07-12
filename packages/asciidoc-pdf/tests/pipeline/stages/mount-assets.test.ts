import {
  createMountAssetsStage,
  type FontConverter,
} from '../../../src/pipeline/stages/mount-assets';
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
// In-memory fakes for the injected seams.
// ---------------------------------------------------------------------------

interface FakeVfs extends PipelineVfs {
  readonly writtenPaths: () => readonly string[];
}

function makeVfs(): FakeVfs {
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
    writtenPaths: () => [...store.keys()],
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

function makeContext(snapshot: ProjectSnapshot, vfs: PipelineVfs): StageContext {
  const request: RenderRequest = { requestId: 'req-1', mode: 'export', optimize: false, snapshot };
  return {
    request,
    readFile: noopReadFile,
    vfs,
    shims: createShimRegistry([]),
    includeAssembler: noopAssembler,
    cache: makeCache(),
    diagnostics: createDiagnosticsCollector(),
    cancellation: cancellationToken(() => false),
  };
}

const CONVERTED_TTF = new Uint8Array([0x00, 0x01, 0x00, 0x00, 0x74]);

function makeFontConverter(): FontConverter & { readonly woff2ToTtf: jest.Mock } {
  const woff2ToTtf: jest.Mock = jest.fn((): Uint8Array => CONVERTED_TTF);
  return { woff2ToTtf };
}

describe('createMountAssetsStage', () => {
  it('has the fixed pipeline kind', () => {
    expect(createMountAssetsStage({ fontConverter: makeFontConverter() }).kind).toBe('mount-assets');
  });

  it('mounts the project pdf-theme YAML at its declared path', async () => {
    const themeYaml = 'extends: default\nbase:\n  font_color: 333333\n';
    const snapshot = makeSnapshot({ themePath: 'theme/brand-theme.yml', files: { 'theme/brand-theme.yml': themeYaml } });
    const vfs = makeVfs();

    const result = await createMountAssetsStage({ fontConverter: makeFontConverter() }).run(makeContext(snapshot, vfs));

    expect(vfs.readText('/project/theme/brand-theme.yml')).toBe(themeYaml);
    expect(result.diagnostics ?? []).toEqual([]);
  });

  it('passes through custom TTF and OTF fonts unchanged', async () => {
    const ttf = new Uint8Array([1, 2, 3, 4]);
    const otf = new Uint8Array([5, 6, 7, 8]);
    const snapshot = makeSnapshot({
      fontPaths: ['fonts/Brand-Regular.ttf', 'fonts/Brand-Bold.otf'],
      binaryAssets: { 'fonts/Brand-Regular.ttf': ttf, 'fonts/Brand-Bold.otf': otf },
    });
    const vfs = makeVfs();
    const converter = makeFontConverter();

    const result = await createMountAssetsStage({ fontConverter: converter }).run(makeContext(snapshot, vfs));

    expect(vfs.readFile('/project/.fonts/Brand-Regular.ttf')).toEqual(ttf);
    expect(vfs.readFile('/project/.fonts/Brand-Bold.otf')).toEqual(otf);
    expect(converter.woff2ToTtf).not.toHaveBeenCalled();
    expect(result.diagnostics ?? []).toEqual([]);
  });

  it('routes a WOFF2 font through the injected converter and mounts the resulting TTF', async () => {
    const woff2 = new Uint8Array([0x77, 0x4F, 0x46, 0x32]);
    const snapshot = makeSnapshot({
      fontPaths: ['fonts/Brand-Regular.woff2'],
      binaryAssets: { 'fonts/Brand-Regular.woff2': woff2 },
    });
    const vfs = makeVfs();
    const converter = makeFontConverter();

    await createMountAssetsStage({ fontConverter: converter }).run(makeContext(snapshot, vfs));

    expect(converter.woff2ToTtf).toHaveBeenCalledTimes(1);
    expect(converter.woff2ToTtf).toHaveBeenCalledWith(woff2);
    expect(vfs.readFile('/project/.fonts/Brand-Regular.ttf')).toEqual(CONVERTED_TTF);
    expect(vfs.exists('/project/.fonts/Brand-Regular.woff2')).toBe(false);
  });

  it('never re-mounts baked default fonts — nothing is written under /usr', async () => {
    const snapshot = makeSnapshot({
      fontPaths: ['fonts/Brand-Regular.ttf'],
      binaryAssets: { 'fonts/Brand-Regular.ttf': new Uint8Array([9]) },
    });
    const vfs = makeVfs();

    await createMountAssetsStage({ fontConverter: makeFontConverter() }).run(makeContext(snapshot, vfs));

    expect(vfs.writtenPaths().some((path) => path.startsWith('/usr'))).toBe(false);
    expect(vfs.writtenPaths()).toEqual(['/project/.fonts/Brand-Regular.ttf']);
  });

  it('writes nothing when there is no theme and no custom fonts', async () => {
    const vfs = makeVfs();

    const result = await createMountAssetsStage({ fontConverter: makeFontConverter() }).run(makeContext(makeSnapshot(), vfs));

    expect(vfs.writtenPaths()).toEqual([]);
    expect(result.diagnostics ?? []).toEqual([]);
  });

  it('warns with font-unavailable when a declared custom font has no captured bytes', async () => {
    const snapshot = makeSnapshot({ fontPaths: ['fonts/Missing.ttf'] });
    const vfs = makeVfs();

    const result = await createMountAssetsStage({ fontConverter: makeFontConverter() }).run(makeContext(snapshot, vfs));

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics?.[0]?.code).toBe('font-unavailable');
    expect(result.diagnostics?.[0]?.severity).toBe('warning');
    expect(result.diagnostics?.[0]?.resource).toBe('fonts/Missing.ttf');
    expect(vfs.writtenPaths()).toEqual([]);
  });

  it('warns with font-unavailable for an unsupported font format and does not call the converter', async () => {
    const snapshot = makeSnapshot({
      fontPaths: ['fonts/Legacy.woff', 'fonts/Old.eot'],
      binaryAssets: { 'fonts/Legacy.woff': new Uint8Array([1]), 'fonts/Old.eot': new Uint8Array([2]) },
    });
    const vfs = makeVfs();
    const converter = makeFontConverter();

    const result = await createMountAssetsStage({ fontConverter: converter }).run(makeContext(snapshot, vfs));

    expect(result.diagnostics?.map((d) => d.code)).toEqual(['font-unavailable', 'font-unavailable']);
    expect(converter.woff2ToTtf).not.toHaveBeenCalled();
    expect(vfs.writtenPaths()).toEqual([]);
  });
});
