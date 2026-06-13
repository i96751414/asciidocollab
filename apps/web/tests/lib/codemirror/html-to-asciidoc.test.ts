import {
  convertInlineMarkdown,
  markdownSubsetToAsciidoc,
} from '@/lib/codemirror/html-to-asciidoc';

describe('convertInlineMarkdown', () => {
  test('bold ** and __ → *', () => {
    expect(convertInlineMarkdown('a **bold** b')).toBe('a *bold* b');
    expect(convertInlineMarkdown('a __bold__ b')).toBe('a *bold* b');
  });

  test('italic single * → _ ; underscore italic kept', () => {
    expect(convertInlineMarkdown('a *italic* b')).toBe('a _italic_ b');
    expect(convertInlineMarkdown('a _italic_ b')).toBe('a _italic_ b');
  });

  test('bold and italic coexist without clobbering each other', () => {
    expect(convertInlineMarkdown('**b** and *i*')).toBe('*b* and _i_');
  });

  test('http link → url[label]; relative link → link:url[label]', () => {
    expect(convertInlineMarkdown('see [docs](https://x.dev/a)')).toBe('see https://x.dev/a[docs]');
    expect(convertInlineMarkdown('see [guide](guide.adoc)')).toBe('see link:guide.adoc[guide]');
  });
});

describe('markdownSubsetToAsciidoc', () => {
  test('ATX headings map # count → = count', () => {
    expect(markdownSubsetToAsciidoc('# Title')).toBe('= Title');
    expect(markdownSubsetToAsciidoc('## Section')).toBe('== Section');
    expect(markdownSubsetToAsciidoc('### Sub')).toBe('=== Sub');
  });

  test('unordered lists with nesting → * / **', () => {
    const md = '- a\n- b\n  - c';
    expect(markdownSubsetToAsciidoc(md)).toBe('* a\n* b\n** c');
  });

  test('ordered lists → . / ..', () => {
    const md = '1. first\n2. second\n   1. nested';
    expect(markdownSubsetToAsciidoc(md)).toBe('. first\n. second\n.. nested');
  });

  test('fenced code block → [source,lang] + ---- delimiters, body verbatim', () => {
    const md = '```js\nconst x = **not bold**;\n```';
    expect(markdownSubsetToAsciidoc(md)).toBe('[source,js]\n----\nconst x = **not bold**;\n----');
  });

  test('fenced code block without language omits the [source] line', () => {
    const md = '```\nplain\n```';
    expect(markdownSubsetToAsciidoc(md)).toBe('----\nplain\n----');
  });

  test('GFM pipe table → |=== AsciiDoc table', () => {
    const md = '| H1 | H2 |\n| --- | --- |\n| a | b |\n| c | d |';
    expect(markdownSubsetToAsciidoc(md)).toBe(
      '|===\n| H1 | H2\n\n| a | b\n| c | d\n|===',
    );
  });

  test('inline markup inside list items and headings is converted', () => {
    expect(markdownSubsetToAsciidoc('## A **bold** title')).toBe('== A *bold* title');
    expect(markdownSubsetToAsciidoc('- item with [link](https://x.io)')).toBe(
      '* item with https://x.io[link]',
    );
  });

  test('plain paragraphs and blank lines pass through', () => {
    expect(markdownSubsetToAsciidoc('hello world\n\nsecond para')).toBe(
      'hello world\n\nsecond para',
    );
  });
});
