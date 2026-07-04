/* @jest-environment jsdom */

// REAL MathJax integration tests for the STEM renderer.
//
// The sibling `render-math.test.ts` mocks the MathJax script injection to assert render-math's
// contract (lazy single load, per-expression convert calls, graceful failure). That mocking cannot
// catch the real engine bug: does the loaded MathJax's convert API actually produce `mjx-container`
// output for the expressions Asciidoctor emits, with BOTH the TeX and AsciiMath input jaxes
// registered — AND without a stray `$` artifact?
//
// In a real browser render-math loads MathJax via a self-hosted `<script src=/vendor/mathjax/...>`
// (the package's `es5/*` files are browser IIFE bundles, not ES modules; importing them as modules in
// the webpack browser bundle never runs their deferred startup). jsdom does NOT execute appended
// `<script>` tags, so we cannot exercise that injection path here. Instead we load the SAME real
// bundles via Node `require` (their IIFE runs under Node and installs `globalThis.MathJax`) with the
// SAME configuration render-math sets, and drive the SAME explicit convert API render-math uses
// (`asciimath2chtmlPromise` / `tex2chtmlPromise` over delimiter-stripped expressions). This proves the
// per-expression path renders both notations into `mjx-container`s and — unlike the old auto
// delimiter-scan — leaves NO `$` / `\$` behind.

// Configure exactly as render-math does, BEFORE the bundles run (MathJax 3 reads this on load).
(globalThis as unknown as { MathJax: Record<string, unknown> }).MathJax = {
  tex: { inlineMath: [[String.raw`\(`, String.raw`\)`]], displayMath: [[String.raw`\[`, String.raw`\]`]] },
  asciimath: { delimiters: [[String.raw`\$`, String.raw`\$`]] },
  startup: { typeset: false },
};

// Load the real bundles via require (CommonJS IIFE runs under Node and installs globalThis.MathJax).
// `tex-mml-chtml` provides TeX/MathML input + CHTML output + startup; `input/asciimath` registers the
// AsciiMath input jax into the same startup document.
require('mathjax/es5/tex-mml-chtml.js');
require('mathjax/es5/input/asciimath.js');

interface RealMathJax {
  startup?: { promise?: Promise<unknown> };
  tex2chtmlPromise?: (math: string, options: { display: boolean }) => Promise<HTMLElement>;
  asciimath2chtmlPromise?: (math: string, options: { display: boolean }) => Promise<HTMLElement>;
}

function mathJax(): RealMathJax {
  return (globalThis as unknown as { MathJax: RealMathJax }).MathJax;
}

afterAll(() => {
  delete (globalThis as unknown as { MathJax?: unknown }).MathJax;
});

describe('real MathJax convert API over Asciidoctor expressions', () => {
  // Generous: the real bundle is large and CHTML startup loads font metrics on first use.
  jest.setTimeout(60_000);

  beforeAll(async () => {
    if (mathJax().startup?.promise) await mathJax().startup!.promise;
  });

  it('renders asciimath (the default `:stem:` notation) into an mjx-container with no stray `$`', async () => {
    // `stem:[sqrt(4) = 2]` → Asciidoctor emits `\$sqrt(4) = 2\$`; render-math strips the delimiters
    // and converts the body. The old auto delimiter-scan left a stray `$`; the convert API never does.
    const node = await mathJax().asciimath2chtmlPromise!('sqrt(4) = 2', { display: false });

    expect(node.tagName.toLowerCase()).toBe('mjx-container');
    expect(node.textContent ?? '').not.toContain('$');
  });

  it('renders latexmath inline and display expressions into mjx-containers', async () => {
    const inline = await mathJax().tex2chtmlPromise!('a^2 + b^2', { display: false });
    const display = await mathJax().tex2chtmlPromise!(String.raw`\sum_{i=1}^{n} i`, { display: true });

    expect(inline.tagName.toLowerCase()).toBe('mjx-container');
    expect(display.tagName.toLowerCase()).toBe('mjx-container');
    expect((inline.textContent ?? '') + (display.textContent ?? '')).not.toContain('$');
  });

  it('renders BOTH notations from a single load (asciimath + latexmath)', async () => {
    const am = await mathJax().asciimath2chtmlPromise!('sqrt(4)', { display: false });
    const tex = await mathJax().tex2chtmlPromise!(String.raw`\alpha`, { display: false });

    expect(am.tagName.toLowerCase()).toBe('mjx-container');
    expect(tex.tagName.toLowerCase()).toBe('mjx-container');
  });
});
