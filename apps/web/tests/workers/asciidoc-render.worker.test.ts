/**
 * Tests for asciidoc-render.worker.ts
 *
 * The worker module is imported directly (not via `new Worker(url)`) so Jest can
 * execute it.  We shim the global `onmessage` setter and `postMessage` so the
 * worker's message handler is captured and called synchronously in tests.
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
const mockSetAttribute = jest.fn();
const mockLoad = jest.fn();

jest.mock('asciidoctor', () => {
  const MockAsciidoctor = jest.fn().mockReturnValue({
    load: mockLoad,
  });
  return MockAsciidoctor;
});

function makeBlock(lineNumber: number | null) {
  return {
    getSourceLocation: jest.fn().mockReturnValue(
      lineNumber === null ? null : { getLineNumber: jest.fn().mockReturnValue(lineNumber) },
    ),
    setAttribute: mockSetAttribute,
  };
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
    mockSetAttribute.mockClear();
    mockLoad.mockClear();
    onMessageHandler = null;

    const htmlResult = '<h1 data-source-line="1">Hello</h1><p data-source-line="2">World</p>';
    mockConvert.mockReturnValue(htmlResult);
    mockFindBy.mockReturnValue([
      makeBlock(1),
      makeBlock(2),
      makeBlock(null), // block with no source location — should be skipped
    ]);
    mockLoad.mockReturnValue({ findBy: mockFindBy, convert: mockConvert });
  });

  // (a) ok=true with data-source-line attributes for valid AsciiDoc
  it('posts RenderResult with ok=true and HTML containing data-source-line for valid input', () => {
    require('@/workers/asciidoc-render.worker');
    sendMessage({ requestId: 1, content: '= Hello\n\nWorld' });

    expect(postMessageMock).toHaveBeenCalledTimes(1);
    const result = postMessageMock.mock.calls[0][0];
    expect(result.ok).toBe(true);
    expect(result.html).toContain('data-source-line');
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
    require('@/workers/asciidoc-render.worker');
    sendMessage({ requestId: 3, content: 'include::some-file.adoc[]' });

    const result = postMessageMock.mock.calls[0][0];
    expect(result.ok).toBe(true);
    expect(result.html).toBe(htmlWithInclude);
  });

  // (f) data-source-line on admonition blocks and list items
  it('calls setAttribute on all block types including admonitions and list items', () => {
    const admonitionBlock = makeBlock(45);
    const listItemBlock = makeBlock(10);
    mockFindBy.mockReturnValueOnce([admonitionBlock, listItemBlock]);
    require('@/workers/asciidoc-render.worker');
    sendMessage({ requestId: 4, content: '= Doc\n\nNOTE: note\n\n* item' });

    expect(mockSetAttribute).toHaveBeenCalledWith('data-source-line', '45');
    expect(mockSetAttribute).toHaveBeenCalledWith('data-source-line', '10');
  });

  // Issue 4: setAttribute value must be a string so data-source-line renders in HTML
  it('calls setAttribute with a string value for data-source-line, not a number', () => {
    const block = makeBlock(7);
    mockFindBy.mockReturnValueOnce([block]);
    require('@/workers/asciidoc-render.worker');
    sendMessage({ requestId: 1, content: '= Doc' });

    // Must be '7' (string), not 7 (number)
    expect(mockSetAttribute).toHaveBeenCalledWith('data-source-line', '7');
  });

  // Blocks without source location are skipped
  it('skips setAttribute for blocks with no source location', () => {
    const blockNoLoc = makeBlock(null);
    const blockWithLoc = makeBlock(5);
    mockFindBy.mockReturnValueOnce([blockNoLoc, blockWithLoc]);
    require('@/workers/asciidoc-render.worker');
    sendMessage({ requestId: 5, content: '= Doc' });

    expect(mockSetAttribute).toHaveBeenCalledTimes(1);
    expect(mockSetAttribute).toHaveBeenCalledWith('data-source-line', '5');
  });
});
