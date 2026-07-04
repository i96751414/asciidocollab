import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  looksLikeUrl,
  urlToLinkMarkup,
  htmlToAsciidoc,
  imageMacro,
  asciidocPasteHandlers,
} from '@/lib/codemirror/asciidoc-paste';

// jsdom environment (.test.tsx) — DOMPurify + turndown need a DOM, and the CM6
// paste/drop handlers (`asciidocPasteHandlers`) need a live EditorView.

describe('looksLikeUrl', () => {
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

describe('urlToLinkMarkup', () => {
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

describe('imageMacro', () => {
  test('builds an image:: block macro', () => {
    expect(imageMacro('assets/diagram.png')).toBe('image::assets/diagram.png[]');
  });
});

describe('htmlToAsciidoc', () => {
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

const DOC = 'one two three';

/** A view wired with the paste/drop handlers under test. */
function makeView(
  uploadImage?: (file: File) => Promise<string | null>,
  documentText = DOC,
): EditorView {
  return new EditorView({
    state: EditorState.create({
      doc: documentText,
      extensions: [asciidocPasteHandlers(uploadImage ? { uploadImage } : {})],
    }),
  });
}

/**
 * Build a minimal DataTransfer-like object. jsdom's ClipboardEvent does not
 * populate `clipboardData`, so the handler reads from this stand-in via the
 * synthetic event's own property.
 */
function makeClipboard(parts: { plain?: string; html?: string; files?: File[] }): DataTransfer {
  const store: Record<string, string> = {};
  if (parts.plain !== undefined) store['text/plain'] = parts.plain;
  if (parts.html !== undefined) store['text/html'] = parts.html;
  const fileList = parts.files ?? [];
  const transfer = {
    getData: (type: string) => store[type] ?? '',
    files: fileList,
  };
  return transfer as unknown as DataTransfer;
}

/**
 * Dispatch a synthetic paste at the editor's content DOM. The handler's
 * return/preventDefault is not observable (CM6 installs its own paste handler
 * that also calls preventDefault), so callers assert on document state — whether
 * our handler performed a replacement — instead.
 */
function firePaste(view: EditorView, clipboard: DataTransfer): void {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: clipboard });
  view.contentDOM.dispatchEvent(event);
}

/** Dispatch a synthetic drop carrying a dataTransfer (or none). */
function fireDrop(view: EditorView, transfer: DataTransfer | null): void {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: transfer });
  view.contentDOM.dispatchEvent(event);
}

/** Flush the microtask queue so an awaited uploadImage promise settles. */
function flushMicrotasks(): Promise<void> {
  return Promise.resolve();
}

describe('asciidocPasteHandlers (live EditorView)', () => {
let view: EditorView;

afterEach(() => {
  view.destroy();
});

describe('asciidocPasteHandlers — paste', () => {
  test('converts pasted HTML to AsciiDoc and replaces the selection', () => {
    view = makeView();
    view.dispatch({ selection: { anchor: 0, head: 0 } });
    firePaste(view, makeClipboard({ html: '<h2>Title</h2>', plain: 'Title' }));
    expect(view.state.doc.toString()).toContain('== Title');
  });

  test('falls through for plain-text-only paste (CM inserts the raw text verbatim)', () => {
    view = makeView();
    view.dispatch({ selection: { anchor: 0, head: 0 } });
    firePaste(view, makeClipboard({ plain: 'just words' }));
    // Our handler does no special transform; CM's default paste inserts the raw text.
    expect(view.state.doc.toString()).toBe(`just words${DOC}`);
  });

  test('wraps a selection with a link macro when a single URL is pasted', () => {
    view = makeView();
    view.dispatch({ selection: { anchor: 0, head: 3 } }); // select "one"
    firePaste(view, makeClipboard({ plain: 'https://example.com' }));
    expect(view.state.doc.toString()).toContain('https://example.com[one]');
  });

  test('does not URL-wrap when the selection is empty (raw URL is pasted, no macro)', () => {
    view = makeView();
    view.dispatch({ selection: { anchor: 0, head: 0 } });
    firePaste(view, makeClipboard({ plain: 'https://example.com' }));
    // No selection → no link macro; CM's default paste inserts the bare URL text.
    expect(view.state.doc.toString()).toBe(`https://example.com${DOC}`);
    expect(view.state.doc.toString()).not.toContain('[');
  });

  test('does nothing when the clipboard carries no data', () => {
    view = makeView();
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: null });
    view.contentDOM.dispatchEvent(event);
    expect(view.state.doc.toString()).toBe(DOC);
  });

  test('ignores blank/whitespace-only HTML and performs no replacement', () => {
    view = makeView();
    firePaste(view, makeClipboard({ html: '   ', plain: '' }));
    expect(view.state.doc.toString()).toBe(DOC);
  });

  test('uploads a pasted image file and inserts an image:: macro', async () => {
    const uploadImage = jest.fn(async () => 'assets/pic.png');
    view = makeView(uploadImage);
    const file = new File(['x'], 'pic.png', { type: 'image/png' });
    firePaste(view, makeClipboard({ files: [file] }));
    expect(uploadImage).toHaveBeenCalledWith(file);
    await flushMicrotasks();
    expect(view.state.doc.toString()).toContain('image::assets/pic.png[]');
  });

  test('leaves the document unchanged when an image upload fails (null path)', async () => {
    const uploadImage = jest.fn(async () => null);
    view = makeView(uploadImage);
    const file = new File(['x'], 'pic.png', { type: 'image/png' });
    firePaste(view, makeClipboard({ files: [file] }));
    await flushMicrotasks();
    expect(view.state.doc.toString()).toBe(DOC);
  });

  test('does not treat an image file as an upload when no uploader is configured', () => {
    view = makeView();
    view.dispatch({ selection: { anchor: 0, head: 0 } });
    const file = new File(['x'], 'pic.png', { type: 'image/png' });
    firePaste(view, makeClipboard({ files: [file], html: '<p>hi</p>', plain: 'hi' }));
    // No uploader → falls past the image branch into the HTML branch.
    expect(view.state.doc.toString()).toContain('hi');
  });
});

describe('asciidocPasteHandlers — defaults', () => {
  test('is constructible with no options (default empty options)', () => {
    view = new EditorView({
      state: EditorState.create({ doc: DOC, extensions: [asciidocPasteHandlers()] }),
    });
    view.dispatch({ selection: { anchor: 0, head: 0 } });
    firePaste(view, makeClipboard({ html: '<h3>Sub</h3>', plain: 'Sub' }));
    expect(view.state.doc.toString()).toContain('=== Sub');
  });
});

describe('asciidocPasteHandlers — drop', () => {
  test('uploads a dropped image file and inserts an image:: macro', async () => {
    const uploadImage = jest.fn(async () => 'assets/drop.png');
    view = makeView(uploadImage);
    const file = new File(['x'], 'drop.png', { type: 'image/png' });
    fireDrop(view, makeClipboard({ files: [file] }));
    await flushMicrotasks();
    expect(view.state.doc.toString()).toContain('image::assets/drop.png[]');
  });

  test('leaves the document unchanged when a dropped image upload fails (null path)', async () => {
    const uploadImage = jest.fn(async () => null);
    view = makeView(uploadImage);
    const file = new File(['x'], 'drop.png', { type: 'image/png' });
    fireDrop(view, makeClipboard({ files: [file] }));
    expect(uploadImage).toHaveBeenCalledWith(file);
    await flushMicrotasks();
    expect(view.state.doc.toString()).toBe(DOC);
  });

  test('does nothing for a drop without dataTransfer', () => {
    view = makeView(async () => 'x');
    fireDrop(view, null);
    expect(view.state.doc.toString()).toBe(DOC);
  });

  test('does nothing for a drop with no image and no uploader', () => {
    view = makeView();
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    fireDrop(view, makeClipboard({ files: [file] }));
    expect(view.state.doc.toString()).toBe(DOC);
  });

  test('recognises an image by extension when the MIME type is absent', async () => {
    const uploadImage = jest.fn(async () => 'assets/byext.png');
    view = makeView(uploadImage);
    const file = new File(['x'], 'byext.png', { type: '' });
    fireDrop(view, makeClipboard({ files: [file] }));
    expect(uploadImage).toHaveBeenCalledWith(file);
    await flushMicrotasks();
    expect(view.state.doc.toString()).toContain('image::assets/byext.png[]');
  });
});
});
