// Contract unit tests for the MathJax math shim. These run in the jest `node` project (no DOM), so
// the real browser MathJax engine is NEVER exercised here — the shim's engine call sits behind an
// injectable `MathSvgConverter` seam, and every test supplies an in-memory fake (Principle III).
//
// What is asserted here (browser-independent):
//   - the RenderShim contract identity (kind/name/version);
//   - success maps a converter's SVG string to UTF-8 SVG bytes with `rasterFallback:false`;
//   - the notation param selects the TeX vs AsciiMath input jax, mirroring the preview renderer;
//   - malformed/blank source and a converter throw map to `{ ok:false, malformed-math }` and never throw;
//   - determinism (identical source+params → identical bytes);
//   - the offline MathJax config performs no external resource fetch (no CDN/remote URL).
//
// What is NOT asserted here (browser-only, verified in a real browser/integration): the default
// converter's `<script>` injection, MathJax startup handshake, and actual SVG typesetting.

import mathjaxPackage from 'mathjax/package.json';

import type { ShimInput, ShimOutput } from '@asciidocollab/asciidoc-pdf';

import {
  createMathJaxShim,
  createOfflineMathJaxConfig,
  MATH_DISPLAY_PARAM,
  MATH_NOTATION_PARAM,
  MATHJAX_SVG_SCRIPT,
  type MathConversion,
  type MathSvgConverter,
} from '@/workers/shims/mathjax';

/** An in-memory fake converter that records every conversion and answers via an injected behaviour. */
class FakeConverter implements MathSvgConverter {
  readonly calls: MathConversion[] = [];

  constructor(private readonly behaviour: (conversion: MathConversion) => Promise<string>) {}

  toSvg(conversion: MathConversion): Promise<string> {
    this.calls.push(conversion);
    return this.behaviour(conversion);
  }
}

/** A converter that always returns a fixed SVG document string. */
function svgConverter(svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'): FakeConverter {
  return new FakeConverter(() => Promise.resolve(svg));
}

/** A converter that always throws (simulating a MathJax parse/render failure). */
function throwingConverter(message = 'bad TeX'): FakeConverter {
  return new FakeConverter(() => Promise.reject(new Error(message)));
}

function inputFor(source: string, parameters: Record<string, string> = {}): ShimInput {
  return { source, params: parameters, preferredFormat: 'svg' };
}

function expectMalformed(output: ShimOutput): void {
  expect(output.ok).toBe(false);
  if (output.ok) {
    throw new Error('expected a malformed-math diagnostic');
  }
  expect(output.diagnostic.code).toBe('malformed-math');
  expect(output.diagnostic.message.length).toBeGreaterThan(0);
}

describe('createMathJaxShim — contract identity', () => {
  it('is a math-family shim named "mathjax" carrying the installed MathJax version', () => {
    const shim = createMathJaxShim({ converter: svgConverter() });
    expect(shim.kind).toBe('math');
    expect(shim.name).toBe('mathjax');
    expect(shim.version).toBe(mathjaxPackage.version);
  });
});

describe('createMathJaxShim — successful render', () => {
  it('returns the converter SVG as UTF-8 bytes with no raster fallback', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>x</text></svg>';
    const shim = createMathJaxShim({ converter: svgConverter(svg) });

    const output = await shim.render(inputFor('x^2', { [MATH_NOTATION_PARAM]: 'latexmath' }));

    expect(output.ok).toBe(true);
    if (!output.ok) {
      throw new Error('expected success');
    }
    expect(output.asset.format).toBe('svg');
    expect(output.asset.rasterFallback).toBe(false);
    expect(new TextDecoder().decode(output.asset.bytes)).toBe(svg);
  });

  it('produces identical bytes for identical source + params (determinism)', async () => {
    const shim = createMathJaxShim({ converter: svgConverter() });
    const first = await shim.render(inputFor('a+b', { [MATH_NOTATION_PARAM]: 'latexmath' }));
    const second = await shim.render(inputFor('a+b', { [MATH_NOTATION_PARAM]: 'latexmath' }));

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      throw new Error('expected success');
    }
    expect(first.asset.bytes).toEqual(second.asset.bytes);
  });
});

describe('createMathJaxShim — notation selection (mirrors the preview renderer)', () => {
  it('maps latexmath → tex', async () => {
    const converter = svgConverter();
    await createMathJaxShim({ converter }).render(inputFor('x', { [MATH_NOTATION_PARAM]: 'latexmath' }));
    expect(converter.calls[0].notation).toBe('tex');
  });

  it('maps asciimath → asciimath', async () => {
    const converter = svgConverter();
    await createMathJaxShim({ converter }).render(inputFor('x', { [MATH_NOTATION_PARAM]: 'asciimath' }));
    expect(converter.calls[0].notation).toBe('asciimath');
  });

  it('treats an unqualified "stem" as AsciiMath (Asciidoctor default)', async () => {
    const converter = svgConverter();
    await createMathJaxShim({ converter }).render(inputFor('x', { [MATH_NOTATION_PARAM]: 'stem' }));
    expect(converter.calls[0].notation).toBe('asciimath');
  });

  it('defaults to AsciiMath when no notation param is present', async () => {
    const converter = svgConverter();
    await createMathJaxShim({ converter }).render(inputFor('x'));
    expect(converter.calls[0].notation).toBe('asciimath');
  });
});

describe('createMathJaxShim — layout (display vs inline)', () => {
  it('renders display layout by default', async () => {
    const converter = svgConverter();
    await createMathJaxShim({ converter }).render(inputFor('x'));
    expect(converter.calls[0].display).toBe(true);
  });

  it('renders inline layout when the display param is "false"', async () => {
    const converter = svgConverter();
    await createMathJaxShim({ converter }).render(inputFor('x', { [MATH_DISPLAY_PARAM]: 'false' }));
    expect(converter.calls[0].display).toBe(false);
  });
});

describe('createMathJaxShim — error mapping (never throws)', () => {
  it('maps a converter throw to a malformed-math diagnostic', async () => {
    const shim = createMathJaxShim({ converter: throwingConverter('unexpected }') });
    const output = await shim.render(inputFor(String.raw`\frac{1}{`, { [MATH_NOTATION_PARAM]: 'latexmath' }));
    expectMalformed(output);
  });

  it('maps blank source to malformed-math without invoking the converter', async () => {
    const converter = svgConverter();
    const output = await createMathJaxShim({ converter }).render(inputFor('   \n  '));
    expectMalformed(output);
    expect(converter.calls).toHaveLength(0);
  });

  it('maps empty converter output to malformed-math', async () => {
    const shim = createMathJaxShim({ converter: new FakeConverter(() => Promise.resolve('   ')) });
    const output = await shim.render(inputFor('x'));
    expectMalformed(output);
  });
});

describe('createMathJaxShim — default browser converter wiring', () => {
  it('uses the built-in browser converter when none is injected and degrades gracefully with no DOM', async () => {
    // With no converter injected the shim builds the browser converter. This node test has no DOM, so
    // that converter cannot load MathJax and reports the expression as unavailable rather than throwing.
    const shim = createMathJaxShim();
    const output = await shim.render(inputFor('x^2', { [MATH_NOTATION_PARAM]: 'latexmath' }));
    expectMalformed(output);
  });

  it('reuses the same built-in converter result across repeated renders without a DOM', async () => {
    const shim = createMathJaxShim();
    const first = await shim.render(inputFor('a', { [MATH_NOTATION_PARAM]: 'latexmath' }));
    const second = await shim.render(inputFor('b', { [MATH_NOTATION_PARAM]: 'asciimath' }));
    expectMalformed(first);
    expectMalformed(second);
  });
});

describe('offline MathJax configuration (no external resource fetch)', () => {
  it('references only the self-hosted, same-origin bundle', () => {
    expect(MATHJAX_SVG_SCRIPT.startsWith('/vendor/mathjax')).toBe(true);
    expect(MATHJAX_SVG_SCRIPT).not.toMatch(/https?:/);
  });

  it('fetches no CDN/remote resource and self-contains SVG fonts', () => {
    const config = createOfflineMathJaxConfig();
    expect(JSON.stringify(config)).not.toMatch(/https?:/);
    expect(config.loader.load).toContain('input/asciimath');
    expect(config.startup.typeset).toBe(false);
    // Per-expression `local` font cache → each standalone SVG embeds its own glyphs (no shared page defs).
    expect(config.svg.fontCache).toBe('local');
  });
});
