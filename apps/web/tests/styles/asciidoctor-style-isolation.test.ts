import { readFileSync } from 'node:fs';
import path from 'node:path';

// Guards Constitution VI (Style Isolation): the generated Asciidoctor stylesheet is imported
// app-wide, so every rule it contains MUST be confined to the preview surface. Global at-rules
// such as @page (which would override the whole application's print layout) must not survive.
const GENERATED = path.resolve(__dirname, '../../src/styles/asciidoctor-style.generated.css');
const SCOPE = '.asciidoc-preview-content[data-preview-style="asciidoctor"]';

describe('generated Asciidoctor stylesheet isolation', () => {
  const css = readFileSync(GENERATED, 'utf8');

  it('is actually scoped (sanity)', () => {
    expect(css).toContain(SCOPE);
  });

  it('contains no global @page rule that would leak into the app print layout', () => {
    expect(css).not.toMatch(/@page\b/);
  });

  it('has no top-level rule whose selector escapes the preview scope', () => {
    // Drop comments and the bodies of @media blocks (their inner rules are scoped separately),
    // then ensure every remaining rule selector begins with the preview scope.
    const withoutComments = css.replaceAll(/\/\*[\s\S]*?\*\//g, '');
    const withoutMediaBodies = withoutComments.replaceAll(/@media[^{]*\{[\s\S]*?\}\s*\}/g, '');
    const offending = withoutMediaBodies
      .split('}')
      .map((rule) => rule.trim())
      .filter((rule) => rule.includes('{'))
      .map((rule) => rule.slice(0, rule.indexOf('{')).trim())
      .filter((selector) => selector.length > 0 && !selector.startsWith('@'))
      .filter((selector) => !selector.startsWith('.asciidoc-preview-content'));
    expect(offending).toEqual([]);
  });
});
