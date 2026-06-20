import {
  INCLUDE_PLACEHOLDER_CLASS,
  INCLUDE_PLACEHOLDER_TARGET_ATTR,
  escapeHtml,
  buildIncludePlaceholderBlock,
} from '@/lib/asciidoc/include-placeholder';

describe('INCLUDE_PLACEHOLDER_CLASS', () => {
  it('equals "adoc-include-placeholder"', () => {
    expect(INCLUDE_PLACEHOLDER_CLASS).toBe('adoc-include-placeholder');
  });
});

describe('INCLUDE_PLACEHOLDER_TARGET_ATTR', () => {
  it('equals "data-include-target"', () => {
    expect(INCLUDE_PLACEHOLDER_TARGET_ATTR).toBe('data-include-target');
  });
});

describe('escapeHtml', () => {
  it('escapes & to &amp;', () => {
    expect(escapeHtml('a&b')).toBe('a&amp;b');
  });

  it('escapes < to &lt;', () => {
    expect(escapeHtml('a<b')).toBe('a&lt;b');
  });

  it('escapes > to &gt;', () => {
    expect(escapeHtml('a>b')).toBe('a&gt;b');
  });

  it('escapes " to &quot;', () => {
    expect(escapeHtml('a"b')).toBe('a&quot;b');
  });

  it("escapes ' to &#39;", () => {
    expect(escapeHtml("a'b")).toBe('a&#39;b');
  });

  it('escapes all special chars in combination', () => {
    expect(escapeHtml("& < > \" '")).toBe('&amp; &lt; &gt; &quot; &#39;');
  });

  it('returns plain strings unchanged', () => {
    expect(escapeHtml('parts/chapter1.adoc')).toBe('parts/chapter1.adoc');
  });

  it('escapes & before < to avoid double-escaping', () => {
    // "&lt;" input → "&amp;lt;" (& is escaped first)
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });
});

describe('buildIncludePlaceholderBlock', () => {
  it('produces the correct passthrough block for a plain target', () => {
    const result = buildIncludePlaceholderBlock('parts/chapter1.adoc');
    const expected = [
      '++++',
      '<div class="adoc-include-placeholder" data-include-target="parts/chapter1.adoc" role="button" tabindex="0">included: parts/chapter1.adoc</div>',
      '++++',
      '',
    ].join('\n');
    expect(result).toBe(expected);
  });

  it('contains exactly the INCLUDE_PLACEHOLDER_CLASS value as the class', () => {
    const result = buildIncludePlaceholderBlock('file.adoc');
    expect(result).toContain(`class="${INCLUDE_PLACEHOLDER_CLASS}"`);
  });

  it('contains INCLUDE_PLACEHOLDER_TARGET_ATTR as the attribute name', () => {
    const result = buildIncludePlaceholderBlock('file.adoc');
    expect(result).toContain(`${INCLUDE_PLACEHOLDER_TARGET_ATTR}="`);
  });

  it('HTML-escapes special chars in the target for both attribute value and visible text', () => {
    const target = 'path/to/file&name<>.adoc';
    const escaped = 'path/to/file&amp;name&lt;&gt;.adoc';
    const result = buildIncludePlaceholderBlock(target);
    // escaped appears in the data-include-target attribute
    expect(result).toContain(`data-include-target="${escaped}"`);
    // escaped appears in the visible text
    expect(result).toContain(`included: ${escaped}</div>`);
    // the raw unescaped target must NOT appear as-is
    expect(result).not.toContain(target);
  });
});
