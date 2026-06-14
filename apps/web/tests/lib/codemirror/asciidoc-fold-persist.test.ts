/* @jest-environment jsdom */

/**
 * Unit tests for the whole-document fold controls + per-file fold persistence
 * (US10, FR-042/043). The jsdom environment (set by the pragma above) is required
 * because the persistence plugin is a CodeMirror `ViewPlugin`: exercising it needs
 * a real `EditorView` (and therefore a DOM), and jsdom also supplies `localStorage`.
 */
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { codeFolding, foldEffect, foldedRanges } from '@codemirror/language';
import {
  foldStorageKey,
  headingsToFoldForLevel,
  parseFoldState,
  foldToLevel,
  serializeFolds,
  foldPersistence,
  type SerializedFold,
} from '@/lib/codemirror/asciidoc-fold-persist';
import { type HeadingLevelInfo } from '@/lib/codemirror/asciidoc-heading-levels';

const PROJECT = 'proj-1';
const FILE = 'file-1';

// Two top-level sections so `foldToLevel(1)` has a real range to fold and
// `foldedRanges` returns something observable.
const DOC = ['= Title', '', '== One', 'alpha', '', '== Two', 'beta', ''].join('\n');

/** A view whose state carries fold support plus the persistence plugin under test. */
function makeView(extensions: Extension[], documentText = DOC): EditorView {
  return new EditorView({
    state: EditorState.create({ doc: documentText, extensions: [codeFolding(), ...extensions] }),
  });
}

/** Read folded ranges back out of a view as plain offset pairs. */
function foldsOf(view: EditorView): SerializedFold[] {
  const out: SerializedFold[] = [];
  const iterator = foldedRanges(view.state).iter();
  while (iterator.value !== null) {
    out.push({ from: iterator.from, to: iterator.to });
    iterator.next();
  }
  return out;
}

/** Read + reconcile the persisted fold state for a key, as the plugin would. */
function storedFolds(key: string, documentLength: number): SerializedFold[] {
  return parseFoldState(globalThis.localStorage.getItem(key), documentLength);
}

/** Build a minimal heading info; callers override the fields a test cares about. */
function heading(overrides: Partial<HeadingLevelInfo>): HeadingLevelInfo {
  return {
    line: 1,
    from: 0,
    rawLevel: 1,
    effectiveLevel: 1,
    discrete: false,
    beyondMax: false,
    ...overrides,
  };
}

/** Flush the plugin's `queueMicrotask` restore. */
function flushMicrotasks(): Promise<void> {
  return Promise.resolve();
}

beforeEach(() => {
  globalThis.localStorage.clear();
});

describe('foldStorageKey', () => {
  it('builds a project- and file-scoped key with the module prefix', () => {
    expect(foldStorageKey(PROJECT, FILE)).toBe('asciidocollab:folds:proj-1:file-1');
  });
});

describe('headingsToFoldForLevel', () => {
  it('keeps non-discrete, in-range headings at or above the level', () => {
    const headings = [
      heading({ effectiveLevel: 1 }),
      heading({ effectiveLevel: 2 }),
      heading({ effectiveLevel: 3 }),
    ];
    expect(headingsToFoldForLevel(headings, 2)).toEqual([
      heading({ effectiveLevel: 2 }),
      heading({ effectiveLevel: 3 }),
    ]);
  });

  it('drops discrete, beyond-max, and below-level headings', () => {
    const discrete = heading({ effectiveLevel: 2, discrete: true });
    const beyond = heading({ effectiveLevel: 2, beyondMax: true });
    const below = heading({ effectiveLevel: 1 });
    expect(headingsToFoldForLevel([discrete, beyond, below], 2)).toEqual([]);
  });
});

describe('parseFoldState', () => {
  it('returns [] for a missing (null) value', () => {
    expect(parseFoldState(null, 100)).toEqual([]);
  });

  it('returns [] for an empty string', () => {
    expect(parseFoldState('', 100)).toEqual([]);
  });

  it('returns [] for a corrupt / non-JSON value', () => {
    expect(parseFoldState('not json {{{', 100)).toEqual([]);
  });

  it('returns [] when the parsed JSON is not an array', () => {
    expect(parseFoldState(JSON.stringify({ from: 0, to: 5 }), 100)).toEqual([]);
  });

  it('keeps well-formed in-range entries', () => {
    const raw = JSON.stringify([{ from: 2, to: 6 }]);
    expect(parseFoldState(raw, 100)).toEqual([{ from: 2, to: 6 }]);
  });

  it('drops malformed and out-of-range entries', () => {
    const raw = JSON.stringify([
      { from: 2, to: 6 }, // kept
      { from: -1, to: 6 }, // from < 0
      { from: 0, to: 200 }, // to > documentLength
      { from: 6, to: 6 }, // from not < to
      { from: '0', to: 5 }, // from not a number
      { from: 0, to: '5' }, // to not a number
      { from: 0 }, // missing to
      { to: 5 }, // missing from
      null, // not an object
      42, // not an object
      'x', // not an object
    ]);
    expect(parseFoldState(raw, 100)).toEqual([{ from: 2, to: 6 }]);
  });
});

describe('serializeFolds', () => {
  it('returns [] when no ranges are folded', () => {
    const view = makeView([]);
    expect(serializeFolds(view)).toEqual([]);
    view.destroy();
  });

  it('reads the currently folded ranges from editor state', () => {
    const view = makeView([]);
    view.dispatch({ effects: foldEffect.of({ from: 7, to: 14 }) });
    expect(serializeFolds(view)).toEqual([{ from: 7, to: 14 }]);
    view.destroy();
  });
});

describe('foldToLevel', () => {
  it('folds sections at or above the level and reports success', () => {
    const view = makeView([]);
    const ran = foldToLevel(1)(view);
    expect(ran).toBe(true);
    expect(foldsOf(view).length).toBeGreaterThan(0);
    view.destroy();
  });

  it('returns false when no heading qualifies (no effects)', () => {
    const view = makeView([], 'plain paragraph with no headings\n');
    const ran = foldToLevel(1)(view);
    expect(ran).toBe(false);
    expect(foldsOf(view)).toEqual([]);
    view.destroy();
  });

  it('returns false when the level is too deep for any section', () => {
    const view = makeView([]);
    expect(foldToLevel(5)(view)).toBe(false);
    view.destroy();
  });

  it('skips qualifying headings that have no foldable range', () => {
    // "== One" has a body and folds; the trailing "== Empty" has only a blank
    // line, so foldRangeForSection returns null and is skipped (line 68 false).
    const documentText = ['== One', 'alpha', '', '== Empty', ''].join('\n');
    const view = makeView([], documentText);
    expect(foldToLevel(1)(view)).toBe(true);
    expect(foldsOf(view)).toHaveLength(1);
    view.destroy();
  });
});

describe('foldPersistence', () => {
  it('is a no-op extension when the storage key is null', () => {
    const view = makeView([foldPersistence(null)]);
    view.dispatch({ effects: foldEffect.of({ from: 7, to: 14 }) });
    // Nothing under the prefix should have been written.
    expect(globalThis.localStorage.length).toBe(0);
    view.destroy();
  });

  it('persists fold changes once restore has settled', async () => {
    const key = foldStorageKey(PROJECT, FILE);
    const view = makeView([foldPersistence(key)]);
    await flushMicrotasks(); // mount restore baselines from the empty fold set

    view.dispatch({ effects: foldEffect.of({ from: 7, to: 14 }) });
    expect(storedFolds(key, view.state.doc.length)).toEqual([{ from: 7, to: 14 }]);
    view.destroy();
  });

  it('only baselines for a missing key, writing nothing until folds change', async () => {
    const key = foldStorageKey(PROJECT, FILE);
    const view = makeView([foldPersistence(key)]);
    await flushMicrotasks();
    // No folds applied, nothing stored yet because current === baseline ('[]').
    expect(globalThis.localStorage.getItem(key)).toBeNull();
    expect(foldsOf(view)).toEqual([]);
    view.destroy();
  });

  it('treats a corrupt stored value as no saved folds', async () => {
    const key = foldStorageKey(PROJECT, FILE);
    globalThis.localStorage.setItem(key, 'not-json{{{');
    const view = makeView([foldPersistence(key)]);
    await flushMicrotasks();
    expect(foldsOf(view)).toEqual([]);
    view.destroy();
  });

  it('restores saved folds on mount when the document is present', async () => {
    const key = foldStorageKey(PROJECT, FILE);
    const stored: SerializedFold[] = [{ from: 7, to: 14 }];
    globalThis.localStorage.setItem(key, JSON.stringify(stored));

    const view = makeView([foldPersistence(key)]);
    expect(foldsOf(view)).toEqual([]); // not applied synchronously
    await flushMicrotasks();
    expect(foldsOf(view)).toEqual(stored); // applied in the microtask
    view.destroy();
  });

  it('does NOT clobber stored folds with a transient empty set before restore lands', async () => {
    const key = foldStorageKey(PROJECT, FILE);
    const stored: SerializedFold[] = [{ from: 7, to: 14 }];
    globalThis.localStorage.setItem(key, JSON.stringify(stored));

    const view = makeView([foldPersistence(key)]);
    // A mount-time dispatch (e.g. cursor restore) fires update() while `restoring`
    // is still true and folds are not yet applied. It must not write '[]'.
    view.dispatch({ selection: { anchor: 1 } });
    expect(storedFolds(key, view.state.doc.length)).toEqual(stored);

    await flushMicrotasks();
    expect(foldsOf(view)).toEqual(stored);
    expect(storedFolds(key, view.state.doc.length)).toEqual(stored);
    view.destroy();
  });

  it('defers restore until content arrives on the collab path (empty doc at mount)', async () => {
    const key = foldStorageKey(PROJECT, FILE);
    const stored: SerializedFold[] = [{ from: 7, to: 14 }];
    globalThis.localStorage.setItem(key, JSON.stringify(stored));

    // Empty doc at mount: tryRestore bails out (doc.length === 0), nothing restored.
    const view = makeView([foldPersistence(key)], '');
    await flushMicrotasks();
    expect(foldsOf(view)).toEqual([]);

    // First sync brings the content in; update() re-attempts the restore.
    view.dispatch({ changes: { from: 0, insert: DOC } });
    await flushMicrotasks();
    expect(foldsOf(view)).toEqual(stored);
    view.destroy();
  });

  it('swallows storage write failures (quota / private mode)', async () => {
    const key = foldStorageKey(PROJECT, FILE);
    const storageProto = Object.getPrototypeOf(globalThis.localStorage);
    const setItemSpy = jest.spyOn(storageProto, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    const view = makeView([foldPersistence(key)]);
    await flushMicrotasks();
    expect(() => view.dispatch({ effects: foldEffect.of({ from: 7, to: 14 }) })).not.toThrow();
    expect(setItemSpy).toHaveBeenCalled();

    setItemSpy.mockRestore();
    view.destroy();
  });
});
