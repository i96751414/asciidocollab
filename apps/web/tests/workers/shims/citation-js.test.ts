// citation-js's core transitively pulls in `node-fetch` (pure ESM) for a remote-fetch path this shim
// never uses (citations are offline + inert). Under the commonjs jest runtime that ESM file cannot be
// parsed, so stub the fetch modules out — the shim only parses/formats, it never fetches.
jest.mock('node-fetch', () => ({
  __esModule: true,
  default: () => Promise.reject(new Error('network disabled')),
  Headers: class {},
}));

import type { ShimInput, ShimOutput } from '@asciidocollab/asciidoc-pdf';

import {
  BIBTEX_DATABASE_PARAM,
  BIBTEX_ORDER_PARAM,
  BIBTEX_STYLE_PARAM,
  createCitationJsShim,
} from '@/workers/shims/citation-js';

// Two small, self-contained BibTeX fixtures. Alphabetically Doe < Smith, so ordering-mode
// assertions can distinguish appearance order (cite order) from alphabetical order (author family).
const DOE = 'doe20';
const SMITH = 'smith19';
const BIB = [
  `@article{${DOE},title={Alpha Study},author={Doe, John},year={2020},journal={Journal A},volume={1},pages={1-10}}`,
  `@book{${SMITH},title={Beta Book},author={Smith, Jane},year={2019},publisher={Pub}}`,
].join('\n');

const decoder = new TextDecoder();

function input(source: string, parameters: Record<string, string>): ShimInput {
  return { source, params: { [BIBTEX_DATABASE_PARAM]: BIB, ...parameters }, preferredFormat: 'svg' };
}

async function renderText(source: string, parameters: Record<string, string> = {}): Promise<string> {
  const output = await createCitationJsShim().render(input(source, parameters));
  if (!output.ok) {
    throw new Error(`expected ok output, got diagnostic: ${output.diagnostic.message}`);
  }
  expect(output.asset.format).toBe('svg');
  expect(output.asset.rasterFallback).toBe(false);
  return decoder.decode(output.asset.bytes);
}

async function renderRaw(source: string, parameters: Record<string, string> = {}): Promise<ShimOutput> {
  return createCitationJsShim().render(input(source, parameters));
}

describe('citation-js citations shim', () => {
  it('exposes the citations-shim identity', () => {
    const shim = createCitationJsShim();
    expect(shim.kind).toBe('citations');
    expect(shim.name).toBe('citation-js');
    expect(shim.version).toMatch(/\d/);
  });

  it('rewrites a cite macro into an author-date inline link plus a matching reference entry', async () => {
    const text = await renderText(
      `A claim cite:${DOE}[].\n\nbibliography::[]`,
      { [BIBTEX_STYLE_PARAM]: 'apa' },
    );

    // Inline citation: author-date label hyperlinked to the reference anchor.
    expect(text).toContain('(Doe, 2020)');
    expect(text).toContain(`<<bibref-${DOE},`);
    // The reference-list entry carries the matching anchor and the formatted bibliographic text.
    expect(text).toContain(`anchor:bibref-${DOE}[]`);
    expect(text).toContain('Alpha Study');
    // The macro itself must be gone.
    expect(text).not.toContain(`cite:${DOE}[]`);
  });

  it('places a back-link from the reference entry to each citation occurrence', async () => {
    const text = await renderText(
      `First cite:${DOE}[]. Again cite:${DOE}[].\n\nbibliography::[]`,
      { [BIBTEX_STYLE_PARAM]: 'apa' },
    );

    // Two occurrences → two occurrence anchors, both back-linked from the single reference entry.
    const referenceSection = text.slice(text.indexOf(`anchor:bibref-${DOE}[]`));
    expect(referenceSection).toContain('<<_adc_citeref_1');
    expect(referenceSection).toContain('<<_adc_citeref_2');
    // The occurrence anchors are emitted at the inline citation sites.
    expect(text).toContain('anchor:_adc_citeref_1[]');
    expect(text).toContain('anchor:_adc_citeref_2[]');
  });

  it('emits numeric labels and a numbered reference list for a numeric style', async () => {
    const text = await renderText(
      `A claim cite:${DOE}[].\n\nbibliography::[]`,
      { [BIBTEX_STYLE_PARAM]: 'vancouver' },
    );

    expect(text).toContain('(1)');
    expect(text).toMatch(/anchor:bibref-doe20\[\]\s*1\./);
  });

  it('renders citenp as a narrative (author-outside) citation for an author-date style', async () => {
    const text = await renderText(
      `As citenp:${DOE}[] shows.\n\nbibliography::[]`,
      { [BIBTEX_STYLE_PARAM]: 'apa' },
    );

    expect(text).toContain('Doe (2020)');
    expect(text).toContain(`<<bibref-${DOE},`);
  });

  it('falls back to the plain numeric label for citenp under a numeric style', async () => {
    const text = await renderText(
      `As citenp:${DOE}[] shows.\n\nbibliography::[]`,
      { [BIBTEX_STYLE_PARAM]: 'vancouver' },
    );

    expect(text).toContain('(1)');
    expect(text).not.toContain('NO_PRINTED_FORM');
  });

  it('orders the reference list by appearance when asked', async () => {
    const text = await renderText(
      `cite:${SMITH}[] then cite:${DOE}[].\n\nbibliography::[]`,
      { [BIBTEX_STYLE_PARAM]: 'vancouver', [BIBTEX_ORDER_PARAM]: 'appearance' },
    );

    // Smith cited first → Smith is entry 1 and precedes Doe in the list.
    expect(text.indexOf(`bibref-${SMITH}`)).toBeGreaterThan(-1);
    expect(text.indexOf(`anchor:bibref-${SMITH}[]`)).toBeLessThan(text.indexOf(`anchor:bibref-${DOE}[]`));
    expect(text).toMatch(/anchor:bibref-smith19\[\]\s*1\./);
  });

  it('orders the reference list alphabetically when asked', async () => {
    const text = await renderText(
      `cite:${SMITH}[] then cite:${DOE}[].\n\nbibliography::[]`,
      { [BIBTEX_STYLE_PARAM]: 'vancouver', [BIBTEX_ORDER_PARAM]: 'alphabetical' },
    );

    // Doe < Smith alphabetically → Doe becomes entry 1 despite being cited second.
    expect(text.indexOf(`anchor:bibref-${DOE}[]`)).toBeLessThan(text.indexOf(`anchor:bibref-${SMITH}[]`));
    expect(text).toMatch(/anchor:bibref-doe20\[\]\s*1\./);
  });

  it('renders a bibitem macro as an inline standalone reference', async () => {
    const text = await renderText(`See bibitem:${DOE}[].`, { [BIBTEX_STYLE_PARAM]: 'apa' });

    expect(text).toContain('Alpha Study');
    expect(text).not.toContain(`bibitem:${DOE}[]`);
  });

  it('appends the generated reference list when no bibliography placeholder is present', async () => {
    const text = await renderText(`A claim cite:${DOE}[].`, { [BIBTEX_STYLE_PARAM]: 'apa' });

    expect(text).toContain(`anchor:bibref-${DOE}[]`);
    expect(text).toContain('Alpha Study');
  });

  it('replaces the bibliography placeholder in place', async () => {
    const text = await renderText(
      `Body cite:${DOE}[].\n\nbibliography::[]\n`,
      { [BIBTEX_STYLE_PARAM]: 'apa' },
    );
    expect(text).not.toContain('bibliography::[]');
  });

  it('reports an unknown citation key as a malformed-citation diagnostic (never throws)', async () => {
    const output = await renderRaw(`cite:missingkey[].\n\nbibliography::[]`, { [BIBTEX_STYLE_PARAM]: 'apa' });

    expect(output.ok).toBe(false);
    if (!output.ok) {
      expect(output.diagnostic.code).toBe('malformed-citation');
      expect(output.diagnostic.message).toContain('missingkey');
    }
  });

  it('reports an unreadable .bib as a malformed-citation diagnostic (never throws)', async () => {
    const output = await createCitationJsShim().render({
      source: `cite:${DOE}[].\n\nbibliography::[]`,
      params: { [BIBTEX_DATABASE_PARAM]: 'this is not valid bibtex @@@' },
      preferredFormat: 'svg',
    });

    expect(output.ok).toBe(false);
    if (!output.ok) {
      expect(output.diagnostic.code).toBe('malformed-citation');
    }
  });

  it('reports an unsupported CSL style as a malformed-citation diagnostic', async () => {
    const output = await renderRaw(`cite:${DOE}[].\n\nbibliography::[]`, { [BIBTEX_STYLE_PARAM]: 'no-such-style' });

    expect(output.ok).toBe(false);
    if (!output.ok) {
      expect(output.diagnostic.code).toBe('malformed-citation');
    }
  });

  it('is deterministic: identical input yields identical bytes', async () => {
    const source = `cite:${DOE}[] and cite:${SMITH}[].\n\nbibliography::[]`;
    const parameters = { [BIBTEX_STYLE_PARAM]: 'vancouver', [BIBTEX_ORDER_PARAM]: 'appearance' };
    const a = await createCitationJsShim().render(input(source, parameters));
    const b = await createCitationJsShim().render(input(source, parameters));
    if (a.ok && b.ok) {
      expect([...a.asset.bytes]).toEqual([...b.asset.bytes]);
    } else {
      throw new Error('expected both renders to succeed');
    }
  });

  it('leaves a document with no citation macros unchanged aside from placeholder handling', async () => {
    const text = await renderText('Just prose, no citations here.', { [BIBTEX_STYLE_PARAM]: 'apa' });
    expect(text).toBe('Just prose, no citations here.');
  });

  it('derives alphabetical sort keys across entries with varied author/title/year shapes', async () => {
    // A literal (organisation) author, a title-only entry, a bare entry with neither author nor title
    // nor year, and a conventional family-name entry — so the alphabetical sort-key fallback chain and
    // the year fallback are all exercised.
    const variedBib = [
      '@book{orgkey,author={{Acme Corporation}},title={Org Handbook},year={2001}}',
      '@misc{titleonly,title={Zzz Solo Title},year={2002}}',
      '@misc{barekey,note={no author, title, or year}}',
      `@article{${DOE},title={Alpha Study},author={Doe, John},year={2020}}`,
    ].join('\n');

    const text = await renderText(
      `cite:orgkey[] cite:titleonly[] cite:barekey[] cite:${DOE}[].\n\nbibliography::[]`,
      {
        [BIBTEX_DATABASE_PARAM]: variedBib,
        [BIBTEX_STYLE_PARAM]: 'apa',
        [BIBTEX_ORDER_PARAM]: 'alphabetical',
      },
    );

    expect(text).toContain('anchor:bibref-orgkey[]');
    expect(text).toContain('anchor:bibref-titleonly[]');
    expect(text).toContain('anchor:bibref-barekey[]');
    expect(text).toContain(`anchor:bibref-${DOE}[]`);
  });

  it('passes a locator through the CSL cluster for a single-key cite', async () => {
    const text = await renderText(
      `See cite:${DOE}[12].\n\nbibliography::[]`,
      { [BIBTEX_STYLE_PARAM]: 'apa' },
    );
    expect(text).toContain('12');
    expect(text).toContain(`<<bibref-${DOE},`);
  });

  it('passes a locator through the narrative citenp year cluster', async () => {
    const text = await renderText(
      `As citenp:${DOE}[12] shows.\n\nbibliography::[]`,
      { [BIBTEX_STYLE_PARAM]: 'apa' },
    );
    expect(text).toContain('Doe');
    expect(text).toContain('12');
  });

  it('treats a missing bibtex database as empty and reports the cite as malformed', async () => {
    const output = await createCitationJsShim().render({
      source: `cite:${DOE}[].\n\nbibliography::[]`,
      params: { [BIBTEX_STYLE_PARAM]: 'apa' },
      preferredFormat: 'svg',
    });

    expect(output.ok).toBe(false);
    if (!output.ok) {
      expect(output.diagnostic.code).toBe('malformed-citation');
    }
  });

  it('reports an unknown bibitem key as a malformed-citation diagnostic', async () => {
    const output = await renderRaw('See bibitem:nosuchkey[].', { [BIBTEX_STYLE_PARAM]: 'apa' });

    expect(output.ok).toBe(false);
    if (!output.ok) {
      expect(output.diagnostic.code).toBe('malformed-citation');
      expect(output.diagnostic.message).toContain('nosuchkey');
    }
  });
});
