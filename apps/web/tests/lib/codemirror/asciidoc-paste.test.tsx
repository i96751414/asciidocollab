import {
  looksLikeUrl,
  urlToLinkMarkup,
  htmlToAsciidoc,
  imageMacro,
} from '@/lib/codemirror/asciidoc-paste';

// jsdom environment (.test.tsx) — DOMPurify + turndown need a DOM.

describe('looksLikeUrl (FR-039)', () => {
  test('accepts http/https/mailto URLs', () => {
    expect(looksLikeUrl('https://example.com/a')).toBe(true);
    expect(looksLikeUrl('  http://x.io ')).toBe(true);
    expect(looksLikeUrl('mailto:a@b.com')).toBe(true);
  });
  test('rejects prose / multi-word text', () => {
    expect(looksLikeUrl('see https://x.io here')).toBe(false);
    expect(looksLikeUrl('just words')).toBe(false);
  });
});

describe('urlToLinkMarkup (FR-039)', () => {
  test('http URL → url[label]', () => {
    expect(urlToLinkMarkup('https://x.io', 'site')).toBe('https://x.io[site]');
  });
  test('relative path → link:path[label]', () => {
    expect(urlToLinkMarkup('docs/guide.adoc', 'guide')).toBe('link:docs/guide.adoc[guide]');
  });
  test('empty label on a URL yields a bare URL', () => {
    expect(urlToLinkMarkup('https://x.io', '')).toBe('https://x.io');
  });
});

describe('imageMacro (FR-040)', () => {
  test('builds an image:: block macro', () => {
    expect(imageMacro('assets/diagram.png')).toBe('image::assets/diagram.png[]');
  });
});

describe('htmlToAsciidoc (FR-062)', () => {
  test('converts headings, bold, and lists', () => {
    const result = htmlToAsciidoc('<h2>Title</h2><p>a <strong>bold</strong> word</p><ul><li>one</li><li>two</li></ul>');
    expect(result).toContain('== Title');
    expect(result).toContain('*bold*');
    expect(result).toContain('* one');
    expect(result).toContain('* two');
  });

  test('strips scripts (sanitized before conversion — Constitution IX)', () => {
    const result = htmlToAsciidoc('<p>safe</p><script>alert(1)</script>');
    expect(result).toContain('safe');
    expect(result).not.toContain('alert(1)');
  });

  test('converts an anchor to an AsciiDoc link', () => {
    expect(htmlToAsciidoc('<a href="https://x.io">x</a>')).toContain('https://x.io[x]');
  });
});
