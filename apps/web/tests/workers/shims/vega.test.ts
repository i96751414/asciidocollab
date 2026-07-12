import type { ShimInput } from '@asciidocollab/asciidoc-pdf';

import {
  createVegaShim,
  type RemoteBlockingLoader,
  type VegaEngine,
} from '@/workers/shims/vega';

const SAMPLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1" /></svg>';

const blockInput = (source: string): ShimInput => ({ source, params: {}, preferredFormat: 'svg' });

const passthroughEngine = (svg = SAMPLE_SVG): VegaEngine => ({
  compileVegaLite: async (spec) => spec,
  renderToSvg: async () => svg,
});

describe('vega diagram shim', () => {
  it('exposes the diagram-shim identity', () => {
    const shim = createVegaShim(passthroughEngine());
    expect(shim.kind).toBe('diagram');
    expect(shim.name).toBe('vega');
    expect(shim.version).toMatch(/\d/);
  });

  it('renders a spec to UTF-8 SVG bytes on success', async () => {
    const shim = createVegaShim(passthroughEngine());

    const output = await shim.render(blockInput(JSON.stringify({ marks: [] })));

    expect(output.ok).toBe(true);
    if (output.ok) {
      expect(output.asset.format).toBe('svg');
      expect(output.asset.rasterFallback).toBe(false);
      expect(new TextDecoder().decode(output.asset.bytes)).toBe(SAMPLE_SVG);
    }
  });

  it('compiles a vega-lite spec to vega before rendering', async () => {
    const compiled: Record<string, unknown> = { marks: [{ type: 'rect' }] };
    let compiledFrom: Record<string, unknown> | undefined;
    let rendered: Record<string, unknown> | undefined;
    const engine: VegaEngine = {
      compileVegaLite: async (spec) => {
        compiledFrom = spec;
        return compiled;
      },
      renderToSvg: async (spec) => {
        rendered = spec;
        return SAMPLE_SVG;
      },
    };
    const vegaLiteSpec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
      mark: 'bar',
    };

    const output = await createVegaShim(engine).render(blockInput(JSON.stringify(vegaLiteSpec)));

    expect(output.ok).toBe(true);
    expect(compiledFrom).toEqual(vegaLiteSpec);
    expect(rendered).toEqual(compiled);
  });

  it('renders a plain vega spec without compiling', async () => {
    let compileCalled = false;
    const engine: VegaEngine = {
      compileVegaLite: async (spec) => {
        compileCalled = true;
        return spec;
      },
      renderToSvg: async () => SAMPLE_SVG,
    };
    const vegaSpec = {
      $schema: 'https://vega.github.io/schema/vega/v6.json',
      marks: [],
    };

    const output = await createVegaShim(engine).render(blockInput(JSON.stringify(vegaSpec)));

    expect(output.ok).toBe(true);
    expect(compileCalled).toBe(false);
  });

  it('classifies a spec with a non-decisive $schema and a top-level marks array as plain Vega', async () => {
    let compileCalled = false;
    const engine: VegaEngine = {
      compileVegaLite: async (spec) => {
        compileCalled = true;
        return spec;
      },
      renderToSvg: async () => SAMPLE_SVG,
    };
    const spec = { $schema: 'https://example.com/unknown.json', marks: [] };

    const output = await createVegaShim(engine).render(blockInput(JSON.stringify(spec)));

    expect(output.ok).toBe(true);
    // A `marks` array means Vega, so no Vega-Lite compilation runs despite the unrecognised schema.
    expect(compileCalled).toBe(false);
  });

  it('classifies a spec with a non-decisive $schema and a Vega-Lite key as Vega-Lite', async () => {
    let compileCalled = false;
    const engine: VegaEngine = {
      compileVegaLite: async () => {
        compileCalled = true;
        return { marks: [] };
      },
      renderToSvg: async () => SAMPLE_SVG,
    };
    const spec = { $schema: 'https://example.com/unknown.json', mark: 'bar' };

    await createVegaShim(engine).render(blockInput(JSON.stringify(spec)));

    // A singular Vega-Lite key (`mark`) with no `marks` array routes through Vega-Lite compilation.
    expect(compileCalled).toBe(true);
  });

  it('renders with a loader that blocks all remote/offline I/O', async () => {
    let loader: RemoteBlockingLoader | undefined;
    const engine: VegaEngine = {
      compileVegaLite: async (spec) => spec,
      renderToSvg: async (_spec, injected) => {
        loader = injected;
        return SAMPLE_SVG;
      },
    };

    await createVegaShim(engine).render(blockInput(JSON.stringify({ marks: [] })));

    expect(loader).toBeDefined();
    await expect(loader?.load('http://example.com/data.json')).rejects.toThrow();
    await expect(loader?.http('http://example.com/data.json', {})).rejects.toThrow();
    await expect(loader?.file('/etc/passwd')).rejects.toThrow();
  });

  it('maps malformed JSON to a malformed-diagram diagnostic', async () => {
    const output = await createVegaShim(passthroughEngine()).render(blockInput('{ not: json'));

    expect(output.ok).toBe(false);
    if (!output.ok) {
      expect(output.diagnostic.code).toBe('malformed-diagram');
    }
  });

  it('maps a non-object spec to a malformed-diagram diagnostic', async () => {
    const output = await createVegaShim(passthroughEngine()).render(blockInput('[1, 2, 3]'));

    expect(output.ok).toBe(false);
    if (!output.ok) {
      expect(output.diagnostic.code).toBe('malformed-diagram');
    }
  });

  it('maps a render throw to a malformed-diagram diagnostic and never throws', async () => {
    const engine: VegaEngine = {
      compileVegaLite: async (spec) => spec,
      renderToSvg: async () => {
        throw new Error('invalid spec');
      },
    };

    const output = await createVegaShim(engine).render(blockInput(JSON.stringify({ marks: [] })));

    expect(output.ok).toBe(false);
    if (!output.ok) {
      expect(output.diagnostic.code).toBe('malformed-diagram');
      expect(output.diagnostic.message).toContain('invalid spec');
    }
  });
});
