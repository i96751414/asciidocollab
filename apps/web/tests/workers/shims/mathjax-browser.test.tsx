// Browser-path unit tests for the MathJax shim's DEFAULT converter. These run in the jest `jsdom`
// project (the `.test.tsx` suffix routes here), so `document`/`XMLSerializer`/`globalThis.MathJax`
// exist and the `<script>`-injection + startup-handshake path (`createBrowserMathSvgConverter`) is
// exercised — the branch block the node-only `mathjax.test.ts` cannot reach (it has no DOM).
//
// jsdom never actually executes an injected external script, so each test STUBS `document.head.append`
// to simulate the bundle finishing: it installs a fake MathJax SVG API on the global and dispatches the
// script's `load` (or `error`) event, mirroring what the real self-hosted bundle does after it runs.

import type { ShimInput, ShimOutput } from '@asciidocollab/asciidoc-pdf';

import { createMathJaxShim, MATH_NOTATION_PARAM } from '@/workers/shims/mathjax';

const SAMPLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><text>x</text></svg>';

function inputFor(source: string, parameters: Record<string, string> = {}): ShimInput {
  return { source, params: parameters, preferredFormat: 'svg' };
}

/** A minimal stand-in for MathJax 3's SVG API once its component bundle has started up. */
function makeFakeApi(options: { svg?: string | null; withStartup?: boolean } = {}) {
  const { svg = SAMPLE_SVG, withStartup = true } = options;
  const makeContainer = () => {
    const container = document.createElement('mjx-container');
    if (svg !== null) container.innerHTML = svg;
    return container;
  };
  const tex2svgPromise = jest.fn(async () => makeContainer());
  const asciimath2svgPromise = jest.fn(async () => makeContainer());
  const api: Record<string, unknown> = { tex2svgPromise, asciimath2svgPromise };
  // The real bundle exposes a startup handshake; omitting it exercises the "no handshake" branch.
  if (withStartup) api.startup = { promise: Promise.resolve() };
  return api as { tex2svgPromise: jest.Mock; asciimath2svgPromise: jest.Mock } & Record<string, unknown>;
}

/**
 * Intercept the script injection: when the shim appends its `<script>`, run `onAppend` (which stands in
 * for the bundle executing) on the next microtask so the pending `await` on the injection promise can
 * resume once the callback has fired the load/error event.
 */
function stubScriptInjection(onAppend: (script: HTMLScriptElement) => void): jest.SpyInstance {
  return jest
    .spyOn(document.head, 'append')
    .mockImplementation(((...nodes: (Node | string)[]) => {
      const script = nodes[0] as HTMLScriptElement;
      queueMicrotask(() => onAppend(script));
      return undefined as unknown as void;
    }) as typeof document.head.append);
}

function expectOkSvg(output: ShimOutput): string {
  expect(output.ok).toBe(true);
  if (!output.ok) throw new Error('expected a successful render');
  return new TextDecoder().decode(output.asset.bytes);
}

function expectMalformed(output: ShimOutput): void {
  expect(output.ok).toBe(false);
  if (output.ok) throw new Error('expected a malformed-math diagnostic');
  expect(output.diagnostic.code).toBe('malformed-math');
}

afterEach(() => {
  jest.restoreAllMocks();
  delete (globalThis as { MathJax?: unknown }).MathJax;
});

describe('MathJax shim — default browser converter (DOM present)', () => {
  it('injects the bundle, awaits startup, and serializes the produced <svg>', async () => {
    const api = makeFakeApi();
    const append = stubScriptInjection((script) => {
      (globalThis as { MathJax?: unknown }).MathJax = api;
      script.dispatchEvent(new Event('load'));
    });

    const output = await createMathJaxShim().render(
      inputFor('x^2', { [MATH_NOTATION_PARAM]: 'latexmath' }),
    );

    expect(append).toHaveBeenCalledTimes(1);
    expect(api.tex2svgPromise).toHaveBeenCalledWith('x^2', { display: true });
    expect(expectOkSvg(output)).toContain('<svg');
  });

  it('selects the AsciiMath input jax for asciimath notation', async () => {
    const api = makeFakeApi();
    stubScriptInjection((script) => {
      (globalThis as { MathJax?: unknown }).MathJax = api;
      script.dispatchEvent(new Event('load'));
    });

    await createMathJaxShim().render(inputFor('sqrt 4', { [MATH_NOTATION_PARAM]: 'asciimath' }));

    expect(api.asciimath2svgPromise).toHaveBeenCalledTimes(1);
    expect(api.tex2svgPromise).not.toHaveBeenCalled();
  });

  it('works when the bundle exposes no startup handshake', async () => {
    const api = makeFakeApi({ withStartup: false });
    stubScriptInjection((script) => {
      (globalThis as { MathJax?: unknown }).MathJax = api;
      script.dispatchEvent(new Event('load'));
    });

    const output = await createMathJaxShim().render(
      inputFor('x', { [MATH_NOTATION_PARAM]: 'latexmath' }),
    );

    expect(expectOkSvg(output)).toContain('<svg');
  });

  it('merges the offline config onto a pre-existing MathJax global object', async () => {
    (globalThis as { MathJax?: unknown }).MathJax = { preExisting: true };
    let installed: Record<string, unknown> | undefined;
    const api = makeFakeApi();
    stubScriptInjection((script) => {
      // Capture what installOfflineConfig wrote before the "bundle" replaces the global with its API.
      installed = (globalThis as { MathJax?: Record<string, unknown> }).MathJax;
      (globalThis as { MathJax?: unknown }).MathJax = api;
      script.dispatchEvent(new Event('load'));
    });

    await createMathJaxShim().render(inputFor('x', { [MATH_NOTATION_PARAM]: 'latexmath' }));

    expect(installed?.preExisting).toBe(true);
  });

  it('maps a missing <svg> in the produced container to malformed-math', async () => {
    const api = makeFakeApi({ svg: null });
    stubScriptInjection((script) => {
      (globalThis as { MathJax?: unknown }).MathJax = api;
      script.dispatchEvent(new Event('load'));
    });

    const output = await createMathJaxShim().render(
      inputFor('x', { [MATH_NOTATION_PARAM]: 'latexmath' }),
    );

    expectMalformed(output);
  });

  it('maps a global that is not a usable SVG API to malformed-math', async () => {
    stubScriptInjection((script) => {
      // The bundle "loaded" but did not expose the tex/asciimath promises.
      (globalThis as { MathJax?: unknown }).MathJax = { startup: { promise: Promise.resolve() } };
      script.dispatchEvent(new Event('load'));
    });

    const output = await createMathJaxShim().render(
      inputFor('x', { [MATH_NOTATION_PARAM]: 'latexmath' }),
    );

    expectMalformed(output);
  });

  it('maps a script load failure to malformed-math and retries the injection on the next render', async () => {
    const shim = createMathJaxShim();

    const failing = stubScriptInjection((script) => script.dispatchEvent(new Event('error')));
    const firstOutput = await shim.render(inputFor('x', { [MATH_NOTATION_PARAM]: 'latexmath' }));
    expectMalformed(firstOutput);
    failing.mockRestore();

    // The failed load must be dropped so a later render can re-inject and succeed.
    const api = makeFakeApi();
    const retry = stubScriptInjection((script) => {
      (globalThis as { MathJax?: unknown }).MathJax = api;
      script.dispatchEvent(new Event('load'));
    });
    const secondOutput = await shim.render(inputFor('x', { [MATH_NOTATION_PARAM]: 'latexmath' }));

    expect(retry).toHaveBeenCalledTimes(1);
    expect(expectOkSvg(secondOutput)).toContain('<svg');
  });

  it('injects the bundle only once and reuses it across renders on the same shim', async () => {
    const api = makeFakeApi();
    const append = stubScriptInjection((script) => {
      (globalThis as { MathJax?: unknown }).MathJax = api;
      script.dispatchEvent(new Event('load'));
    });
    const shim = createMathJaxShim();

    await shim.render(inputFor('a', { [MATH_NOTATION_PARAM]: 'latexmath' }));
    await shim.render(inputFor('b', { [MATH_NOTATION_PARAM]: 'latexmath' }));

    expect(append).toHaveBeenCalledTimes(1);
    expect(api.tex2svgPromise).toHaveBeenCalledTimes(2);
  });
});
