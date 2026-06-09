/**
 * Tests for asciidoc-render.worker.ts
 *
 * The worker module is imported directly (not via `new Worker(url)`) so Jest can
 * execute it.  We shim the global `onmessage` setter and `postMessage` so the
 * worker's message handler is captured and called synchronously in tests.
 *
 * Asciidoctor is mocked here so tests focus on the worker's message handling and
 * HTML post-processing logic without requiring the real (Opal-based) library.
 */

let onMessageHandler: ((event: MessageEvent) => void) | null = null;
const postMessageMock = jest.fn();

// Shim the worker globals before the module is imported.
Object.defineProperty(globalThis, 'onmessage', {
  set(handler: (event: MessageEvent) => void) {
    onMessageHandler = handler;
  },
  get() {
    return onMessageHandler;
  },
  configurable: true,
});
Object.defineProperty(globalThis, 'postMessage', {
  value: postMessageMock,
  writable: true,
  configurable: true,
});

const mockConvert = jest.fn();
const mockFindBy = jest.fn();
const mockSetId = jest.fn();
const mockGetId = jest.fn();
const mockGetContext = jest.fn();
const mockLoad = jest.fn();

jest.mock('asciidoctor', () => {
  const MockAsciidoctor = jest.fn().mockReturnValue({
    load: mockLoad,
  });
  return MockAsciidoctor;
});

function makeBlock(options: {
  lineNumber: number | null;
  id?: string | null;
  context?: string;
  level?: number | null;
}) {
  const { lineNumber, id = null, context = 'paragraph', level = null } = options;
  const mockId = jest.fn().mockReturnValue(id);
  const localSetId = jest.fn((newId: string) => { mockId.mockReturnValue(newId); });
  const block: Record<string, unknown> = {
    getSourceLocation: jest.fn().mockReturnValue(
      lineNumber === null ? null : { getLineNumber: jest.fn().mockReturnValue(lineNumber) },
    ),
    getId: mockId,
    setId: localSetId,
    getContext: jest.fn().mockReturnValue(context),
  };
  if (level !== null) {
    block['getLevel'] = jest.fn().mockReturnValue(level);
  }
  return block as ReturnType<typeof jest.fn> & typeof block;
}

function sendMessage(data: { requestId: number; content: string }) {
  if (onMessageHandler) {
    onMessageHandler({ data } as MessageEvent);
  } else {
    throw new Error('onmessage handler not registered');
  }
}

describe('asciidoc-render.worker', () => {
  beforeEach(() => {
    jest.resetModules();
    postMessageMock.mockClear();
    mockConvert.mockClear();
    mockFindBy.mockClear();
    mockSetId.mockClear();
    mockGetId.mockClear();
    mockGetContext.mockClear();
    mockLoad.mockClear();
    onMessageHandler = null;

    // Default: convert returns HTML with id attributes matching the block IDs
    // that the worker injects via setId.
    mockConvert.mockReturnValue(
      '<h2 id="__src_section_1" class="sect1">Title</h2>' +
      '<div id="__src_paragraph_3" class="paragraph"><p>Content</p></div>',
    );
    mockFindBy.mockReturnValue([
      makeBlock({ lineNumber: 1, id: null, context: 'section' }),
      makeBlock({ lineNumber: 3, id: null, context: 'paragraph' }),
      makeBlock({ lineNumber: null }), // no source location — skipped
    ]);
    mockLoad.mockReturnValue({ findBy: mockFindBy, convert: mockConvert });
  });

  // (a) ok=true with data-source-line injected for blocks that have IDs
  it('posts RenderResult with ok=true and data-source-line in HTML for valid input', () => {
    require('@/workers/asciidoc-render.worker');
    sendMessage({ requestId: 1, content: '= Hello\n\nWorld' });

    expect(postMessageMock).toHaveBeenCalledTimes(1);
    const result = postMessageMock.mock.calls[0][0];
    expect(result.ok).toBe(true);
    expect(result.html).toContain('data-source-line="1"');
    expect(result.html).toContain('data-source-line="3"');
    expect(result.error).toBeNull();
  });

  // (b) ok=false with error when Asciidoctor throws
  it('posts RenderResult with ok=false when Asciidoctor throws', () => {
    mockLoad.mockImplementation(() => { throw new Error('parse error'); });
    require('@/workers/asciidoc-render.worker');
    sendMessage({ requestId: 2, content: 'bad content' });

    const result = postMessageMock.mock.calls[0][0];
    expect(result.ok).toBe(false);
    expect(result.html).toBeNull();
    expect(result.error).toBe('parse error');
  });

  // (c) requestId is echoed correctly
  it('echoes requestId in the response', () => {
    require('@/workers/asciidoc-render.worker');
    sendMessage({ requestId: 42, content: '= Hello' });

    expect(postMessageMock.mock.calls[0][0].requestId).toBe(42);
  });

  // (d) multiple sequential requests each echo their own requestId
  it('echoes the correct requestId for each sequential request', () => {
    require('@/workers/asciidoc-render.worker');
    sendMessage({ requestId: 10, content: '= First' });
    sendMessage({ requestId: 20, content: '= Second' });

    expect(postMessageMock).toHaveBeenCalledTimes(2);
    expect(postMessageMock.mock.calls[0][0].requestId).toBe(10);
    expect(postMessageMock.mock.calls[1][0].requestId).toBe(20);
  });

  // (e) include:: directives are not resolved (safe mode) — literal text in output
  it('includes include:: directive as literal text in safe mode', () => {
    const htmlWithInclude = '<p>include::some-file.adoc[]</p>';
    mockConvert.mockReturnValueOnce(htmlWithInclude);
    mockFindBy.mockReturnValueOnce([]); // no blocks with source lines
    require('@/workers/asciidoc-render.worker');
    sendMessage({ requestId: 3, content: 'include::some-file.adoc[]' });

    const result = postMessageMock.mock.calls[0][0];
    expect(result.ok).toBe(true);
    expect(result.html).toBe(htmlWithInclude);
  });

  // (f) blocks without an existing ID get a synthetic __src_<context>_<line> ID
  it('assigns a synthetic ID to blocks that have no existing ID', () => {
    const block = makeBlock({ lineNumber: 7, id: null, context: 'paragraph' });
    mockConvert.mockReturnValueOnce('<div id="__src_paragraph_7"><p>text</p></div>');
    mockFindBy.mockReturnValueOnce([block]);
    require('@/workers/asciidoc-render.worker');
    sendMessage({ requestId: 4, content: '= Doc' });

    expect(block.setId).toHaveBeenCalledWith('__src_paragraph_7');
  });

  // (g) blocks that already have an ID keep it; data-source-line is injected next to it
  it('preserves existing IDs and still injects data-source-line', () => {
    const block = makeBlock({ lineNumber: 5, id: '_section_title', context: 'section' });
    mockConvert.mockReturnValueOnce('<h2 id="_section_title">Title</h2>');
    mockFindBy.mockReturnValueOnce([block]);
    require('@/workers/asciidoc-render.worker');
    sendMessage({ requestId: 5, content: '= Doc\n\n== Title' });

    const result = postMessageMock.mock.calls[0][0];
    expect(result.ok).toBe(true);
    expect(block.setId).not.toHaveBeenCalled();
    expect(result.html).toContain('data-source-line="5"');
  });

  // (h) document-level block is skipped (no wrapping HTML element in output)
  it('skips document-level blocks', () => {
    const documentBlock = makeBlock({ lineNumber: 1, id: null, context: 'document' });
    const paraBlock = makeBlock({ lineNumber: 3, id: null, context: 'paragraph' });
    mockConvert.mockReturnValueOnce('<div id="__src_paragraph_3"><p>text</p></div>');
    mockFindBy.mockReturnValueOnce([documentBlock, paraBlock]);
    require('@/workers/asciidoc-render.worker');
    sendMessage({ requestId: 6, content: '= Doc\n\nParagraph.' });

    expect(documentBlock.setId).not.toHaveBeenCalled();
    expect(paraBlock.setId).toHaveBeenCalledWith('__src_paragraph_3');
  });

  // (i) blocks without source location are skipped
  it('skips blocks with no source location', () => {
    const blockNoLoc = makeBlock({ lineNumber: null });
    const blockWithLoc = makeBlock({ lineNumber: 5, id: null, context: 'paragraph' });
    mockConvert.mockReturnValueOnce('<div id="__src_paragraph_5"><p>text</p></div>');
    mockFindBy.mockReturnValueOnce([blockNoLoc, blockWithLoc]);
    require('@/workers/asciidoc-render.worker');
    sendMessage({ requestId: 7, content: '= Doc' });

    expect(blockNoLoc.setId).not.toHaveBeenCalled();
    expect(blockWithLoc.setId).toHaveBeenCalledTimes(1);
  });

  // (j) level-0 section skips normal processing and data-source-line is injected into <h1>
  it('injects data-source-line into the showtitle <h1> from the level-0 section line number', () => {
    const level0Section = makeBlock({ lineNumber: 1, id: null, context: 'section', level: 0 });
    const para = makeBlock({ lineNumber: 3, id: null, context: 'paragraph' });
    mockConvert.mockReturnValueOnce('<h1>Doc Title</h1><div id="__src_paragraph_3"><p>text</p></div>');
    mockFindBy.mockReturnValueOnce([level0Section, para]);
    require('@/workers/asciidoc-render.worker');
    sendMessage({ requestId: 8, content: '= Doc Title\n\ntext' });

    const result = postMessageMock.mock.calls[0][0];
    expect(result.ok).toBe(true);
    expect(result.html).toContain('<h1 data-source-line="1">Doc Title</h1>');
    expect(level0Section.setId).not.toHaveBeenCalled();
  });

  // (l) docTitleLineNum is injected even when the converted HTML starts with a leading newline
  it('injects data-source-line into <h1> when converted HTML has a leading newline before the tag', () => {
    const level0Section = makeBlock({ lineNumber: 1, id: null, context: 'section', level: 0 });
    // Asciidoctor sometimes emits a leading newline before the h1 in embedded mode.
    mockConvert.mockReturnValueOnce('\n<h1>Title With Leading Newline</h1>');
    mockFindBy.mockReturnValueOnce([level0Section]);
    require('@/workers/asciidoc-render.worker');
    sendMessage({ requestId: 10, content: '= Title With Leading Newline' });

    const result = postMessageMock.mock.calls[0][0];
    expect(result.ok).toBe(true);
    expect(result.html).toContain('<h1 data-source-line="1">');
  });

  // (m) source blocks with a known language are syntax-highlighted (highlight.js)
  it('applies highlight.js token spans to a known-language source block', () => {
    const codeHtml =
      '<div class="listingblock"><div class="content">' +
      '<pre class="highlight"><code class="language-ruby" data-lang="ruby">' +
      "def hello(name = &#39;World&#39;)\n  puts &quot;hi&quot;\nend" +
      '</code></pre></div></div>';
    mockConvert.mockReturnValueOnce(codeHtml);
    mockFindBy.mockReturnValueOnce([]);
    require('@/workers/asciidoc-render.worker');
    sendMessage({ requestId: 30, content: '[,ruby]\n----\ndef hello\nend\n----' });

    const result = postMessageMock.mock.calls[0][0];
    expect(result.ok).toBe(true);
    // The <pre> is marked as highlighted and ruby keywords become hljs spans.
    expect(result.html).toContain('class="highlight hljs"');
    expect(result.html).toContain('hljs-keyword');
    // The escaped quote entities are unescaped before highlighting and the
    // string body is re-emitted as an hljs-string token.
    expect(result.html).toContain('hljs-string');
  });

  // (n) source blocks with an unknown language fall back to auto-detection
  it('auto-detects highlighting for an unknown language', () => {
    const codeHtml =
      '<pre class="highlight"><code class="language-totally-unknown" data-lang="totally-unknown">' +
      'const x = 1;' +
      '</code></pre>';
    mockConvert.mockReturnValueOnce(codeHtml);
    mockFindBy.mockReturnValueOnce([]);
    require('@/workers/asciidoc-render.worker');
    sendMessage({ requestId: 31, content: 'code' });

    const result = postMessageMock.mock.calls[0][0];
    expect(result.ok).toBe(true);
    expect(result.html).toContain('class="highlight hljs"');
  });

  // (p) HTML entities in code are unescaped in the correct order: a literal
  // "&lt;" the user typed is emitted by Asciidoctor as "&amp;lt;". Decoding must
  // replace "&amp;" LAST, so it round-trips back to "&amp;lt;" after highlight.js
  // re-escapes — NOT collapse to "&lt;" (which would mean "&amp;" was decoded
  // first and a real "<" was wrongly produced).
  it('unescapes code entities in the correct order (ampersand last)', () => {
    const codeHtml =
      '<pre class="highlight"><code class="language-ruby" data-lang="ruby">' +
      '# &amp;lt;' + // raw code text the user typed: "# &lt;"
      '</code></pre>';
    mockConvert.mockReturnValueOnce(codeHtml);
    mockFindBy.mockReturnValueOnce([]);
    require('@/workers/asciidoc-render.worker');
    sendMessage({ requestId: 33, content: '[,ruby]\n----\n# &lt;\n----' });

    const result = postMessageMock.mock.calls[0][0];
    expect(result.ok).toBe(true);
    // The literal "&lt;" text survives the decode→highlight→re-escape round-trip.
    expect(result.html).toContain('&amp;lt;');
  });

  // (o) plain literal blocks (no language) are left untouched
  it('leaves a plain literal block (no language) unmodified', () => {
    const literalHtml = '<div class="literalblock"><div class="content"><pre>just text</pre></div></div>';
    mockConvert.mockReturnValueOnce(literalHtml);
    mockFindBy.mockReturnValueOnce([]);
    require('@/workers/asciidoc-render.worker');
    sendMessage({ requestId: 32, content: '----\njust text\n----' });

    const result = postMessageMock.mock.calls[0][0];
    expect(result.ok).toBe(true);
    expect(result.html).toBe(literalHtml);
    expect(result.html).not.toContain('hljs');
  });

  // (r) id attributes that are NOT in blockSourceLines are passed through unchanged
  it('leaves an id unmodified when it has no corresponding source line entry', () => {
    const block = makeBlock({ lineNumber: 5, id: 'known-para', context: 'paragraph' });
    mockConvert.mockReturnValueOnce(
      '<div id="known-para">Para</div>' +
      '<div id="extra-anchor">Anchor</div>',
    );
    mockFindBy.mockReturnValueOnce([block]);
    require('@/workers/asciidoc-render.worker');
    sendMessage({ requestId: 50, content: '= Doc' });

    const result = postMessageMock.mock.calls[0][0];
    expect(result.ok).toBe(true);
    expect(result.html).toContain('id="known-para" data-source-line="5"');
    // "extra-anchor" has no line number entry → kept verbatim
    expect(result.html).toContain('id="extra-anchor"');
    expect(result.html).not.toContain('id="extra-anchor" data-source-line');
  });

  // (s) a non-Error thrown value is converted via String() in the error message
  it('serialises a non-Error thrown value as the error message', () => {
    mockLoad.mockImplementationOnce(() => { throw 'string-only-error'; });
    require('@/workers/asciidoc-render.worker');
    sendMessage({ requestId: 51, content: 'bad' });

    const result = postMessageMock.mock.calls[0][0];
    expect(result.ok).toBe(false);
    expect(result.error).toBe('string-only-error');
  });

  // (q) when hljs throws during highlight, the original markup is preserved unchanged
  it('preserves original source-block markup when hljs.highlight throws', () => {
    jest.doMock('highlight.js/lib/common', () => ({
      __esModule: true,
      default: {
        getLanguage: jest.fn().mockReturnValue({ name: 'javascript' }),
        highlight: jest.fn().mockImplementation(() => { throw new Error('hljs internal error'); }),
        highlightAuto: jest.fn(),
      },
    }));

    const codeHtml =
      '<pre class="highlight"><code class="language-javascript">const x = 1;</code></pre>';
    mockConvert.mockReturnValueOnce(codeHtml);
    mockFindBy.mockReturnValueOnce([]);
    require('@/workers/asciidoc-render.worker');
    sendMessage({ requestId: 99, content: '[,javascript]\n----\nconst x = 1;\n----' });

    const result = postMessageMock.mock.calls[0][0];
    expect(result.ok).toBe(true);
    // The original escaped markup is returned verbatim — no hljs class or spans.
    expect(result.html).toBe(codeHtml);

    jest.dontMock('highlight.js/lib/common');
  });

  // (k) level-0 section does not add a blockSourceLine entry (no id injection attempt)
  it('level-0 section is excluded from blockSourceLines so no id-based injection is attempted', () => {
    const level0Section = makeBlock({ lineNumber: 1, id: null, context: 'section', level: 0 });
    mockConvert.mockReturnValueOnce('<h1>Title</h1>');
    mockFindBy.mockReturnValueOnce([level0Section]);
    require('@/workers/asciidoc-render.worker');
    sendMessage({ requestId: 9, content: '= Title' });

    expect(level0Section.setId).not.toHaveBeenCalled();
    const result = postMessageMock.mock.calls[0][0];
    expect(result.html).toContain('<h1 data-source-line="1">Title</h1>');
  });
});
