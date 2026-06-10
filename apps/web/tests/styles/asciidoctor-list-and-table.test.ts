import { readFileSync } from 'node:fs';
import path from 'node:path';

// Regression guards for two preview-CSS bugs:
//  1. Tailwind Preflight resets `list-style: none` app-wide, stripping the UA list markers
//     that both styles relied on — plain lists rendered with no bullets/numbers.
//  2. The brand `thead th` rule outranked the vendored Asciidoctor `table thead` rule and
//     painted the header with the dark `--muted` token in dark mode, breaking the light surface.
const GENERATED = path.resolve(__dirname, '../../src/styles/asciidoctor-style.generated.css');
const BRAND = path.resolve(__dirname, '../../src/styles/asciidoc-preview.css');
const SCOPE = '.asciidoc-preview-content[data-preview-style="asciidoctor"]';

describe('preview list markers', () => {
  it('the generated Asciidoctor stylesheet re-establishes base list markers', () => {
    const css = readFileSync(GENERATED, 'utf8');
    expect(css).toContain(`${SCOPE} ul{list-style-type:disc}`);
    expect(css).toContain(`${SCOPE} ol{list-style-type:decimal}`);
  });

  it('the brand stylesheet re-establishes base list markers', () => {
    const css = readFileSync(BRAND, 'utf8');
    expect(css).toMatch(/list-style-type:\s*disc/);
    expect(css).toMatch(/list-style-type:\s*decimal/);
  });
});

describe('brand rules do not leak into the Asciidoctor style', () => {
  // The Asciidoctor preview must be a faithful reproduction driven solely by the vendored,
  // scoped stylesheet. Brand decorative rules (token colours, list indent, admonition cards,
  // teal markers) previously leaked in because they used a bare `.asciidoc-preview-content`
  // selector, which still matches the asciidoctor container. Every brand rule must therefore
  // be excluded from the asciidoctor style. The only intentional asciidoctor-targeted rules
  // are the font re-pointing block at the end of the file.
  const css = readFileSync(BRAND, 'utf8');
  // Split off the trailing, intentionally asciidoctor-scoped font section.
  const brandSection = css.slice(0, css.indexOf('Asciidoctor preview style.'));

  it('no brand selector targets the bare preview container without excluding asciidoctor', () => {
    const selectors = (brandSection.match(/\.asciidoc-preview-content[^{,]*/g) ?? []).map((s) =>
      s.trim(),
    );
    expect(selectors.length).toBeGreaterThan(0);
    const leaking = selectors.filter(
      (sel) => !sel.includes(':not([data-preview-style="asciidoctor"])'),
    );
    expect(leaking).toEqual([]);
  });

  it('the teal list-marker colour is brand-only', () => {
    const markerRule = brandSection.match(/[^}]*li::marker[^}]*\}/)?.[0] ?? '';
    expect(markerRule).toContain(':not([data-preview-style="asciidoctor"])');
  });

  it('example and sidebar blocks get a distinct brand card (border + fill)', () => {
    const exampleRule = brandSection.match(/\.exampleblock\s*\{[^}]*\}/)?.[0] ?? '';
    const sidebarRule = brandSection.match(/\.sidebarblock\s*\{[^}]*\}/)?.[0] ?? '';
    for (const rule of [exampleRule, sidebarRule]) {
      expect(rule).toMatch(/border:/);
      expect(rule).toMatch(/background:/);
      expect(rule).toMatch(/border-radius:/);
    }
  });
});

describe('preview table header isolation', () => {
  it('the brand thead fill does not apply to the Asciidoctor style', () => {
    const css = readFileSync(BRAND, 'utf8');
    // The only thead-background rule must exclude the Asciidoctor style so the vendored
    // light header wins. An unscoped `.asciidoc-preview-content table.tableblock thead th`
    // (no :not()) would reintroduce the dark-header bug.
    const theadRules = css.match(/[^}]*table\.tableblock thead th\s*\{[^}]*\}/g) ?? [];
    expect(theadRules.length).toBeGreaterThan(0);
    for (const rule of theadRules) {
      expect(rule).toContain(':not([data-preview-style="asciidoctor"])');
    }
  });
});
