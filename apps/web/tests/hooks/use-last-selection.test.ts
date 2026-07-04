/**
 * Contract tests (C1–C12) for the last-selection persistence seam.
 * See specs/019-persist-file-selection/contracts/last-selection-storage.md.
 *
 * Runs in the `node` jest project (no jsdom), so we install a minimal in-memory
 * localStorage polyfill on globalThis and target the pure storage functions the
 * `useLastSelection` hook delegates to.
 */
import {
  lastSelectionKey,
  readLastSelection,
  rememberFile,
  rememberLine,
  clearLastSelection,
  fileCursorsKey,
  rememberCursorLine,
  readCursorLine,
  pruneCursor,
  type LastSelection,
} from '@/hooks/use-last-selection';

class LocalStorageMock {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

/** A localStorage whose every method throws, simulating private mode / quota errors. */
const throwingStorage = {
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('denied'); },
  removeItem() { throw new Error('denied'); },
  clear() { throw new Error('denied'); },
};

function installStorage(storage: unknown): void {
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
}

const USER = 'user-1';
const PROJECT = 'proj-1';
const FILE = { nodeId: 'n1', nodeName: 'intro.adoc', nodeType: 'file' as const, path: '/intro.adoc' };

beforeEach(() => {
  installStorage(new LocalStorageMock());
});

describe('lastSelectionKey', () => {
  it('builds a user- and project-scoped key (no magic strings)', () => {
    expect(lastSelectionKey(USER, PROJECT)).toBe('asciidocollab:last-selection:user-1:proj-1');
  });
});

describe('readLastSelection', () => {
  it('C1: returns null when no entry exists', () => {
    expect(readLastSelection(USER, PROJECT)).toBeNull();
  });

  it('C2: returns the parsed value when a valid entry exists', () => {
    rememberFile(USER, PROJECT, FILE);
    expect(readLastSelection(USER, PROJECT)).toEqual(FILE);
  });

  it('C3: returns null (no throw) when stored JSON is malformed', () => {
    localStorage.setItem(lastSelectionKey(USER, PROJECT), '{not valid json');
    expect(() => readLastSelection(USER, PROJECT)).not.toThrow();
    expect(readLastSelection(USER, PROJECT)).toBeNull();
  });

  it('C3b: returns null when stored JSON is the wrong shape (missing fields / array)', () => {
    localStorage.setItem(lastSelectionKey(USER, PROJECT), JSON.stringify({ nodeId: '', nodeName: 'x', nodeType: 'file', path: '/x' }));
    expect(readLastSelection(USER, PROJECT)).toBeNull();
    localStorage.setItem(lastSelectionKey(USER, PROJECT), JSON.stringify([FILE]));
    expect(readLastSelection(USER, PROJECT)).toBeNull();
    localStorage.setItem(lastSelectionKey(USER, PROJECT), JSON.stringify({ ...FILE, nodeType: 'banana' }));
    expect(readLastSelection(USER, PROJECT)).toBeNull();
  });

  it('C4: drops a non-finite or < 1 line (treated as absent, not fatal)', () => {
    localStorage.setItem(lastSelectionKey(USER, PROJECT), JSON.stringify({ ...FILE, line: 0 }));
    expect(readLastSelection(USER, PROJECT)).toEqual(FILE);
    localStorage.setItem(lastSelectionKey(USER, PROJECT), JSON.stringify({ ...FILE, line: Number.NaN }));
    expect(readLastSelection(USER, PROJECT)).toEqual(FILE);
    localStorage.setItem(lastSelectionKey(USER, PROJECT), JSON.stringify({ ...FILE, line: 42 }));
    expect(readLastSelection(USER, PROJECT)).toEqual({ ...FILE, line: 42 });
  });

  it('C10: returns null when localStorage throws', () => {
    installStorage(throwingStorage);
    expect(() => readLastSelection(USER, PROJECT)).not.toThrow();
    expect(readLastSelection(USER, PROJECT)).toBeNull();
  });
});

describe('rememberFile', () => {
  it('C5: writes the entry and drops any previously stored line', () => {
    localStorage.setItem(lastSelectionKey(USER, PROJECT), JSON.stringify({ ...FILE, line: 99 }));
    rememberFile(USER, PROJECT, FILE);
    expect(readLastSelection(USER, PROJECT)).toEqual(FILE);
  });

  it('C6: does not write when a folder is passed', () => {
    rememberFile(USER, PROJECT, { nodeId: 'd1', nodeName: 'src', nodeType: 'folder', path: '/src' });
    expect(localStorage.getItem(lastSelectionKey(USER, PROJECT))).toBeNull();
  });

  it('C10: is a safe no-op when localStorage throws', () => {
    installStorage(throwingStorage);
    expect(() => rememberFile(USER, PROJECT, FILE)).not.toThrow();
  });
});

describe('rememberLine', () => {
  it('C7: merges the line into the existing entry', () => {
    rememberFile(USER, PROJECT, FILE);
    rememberLine(USER, PROJECT, 40);
    expect(readLastSelection(USER, PROJECT)).toEqual({ ...FILE, line: 40 });
  });

  it('C8: does not fabricate an entry when none exists', () => {
    rememberLine(USER, PROJECT, 40);
    expect(localStorage.getItem(lastSelectionKey(USER, PROJECT))).toBeNull();
  });

  it('C10: is a safe no-op when localStorage throws', () => {
    installStorage(throwingStorage);
    expect(() => rememberLine(USER, PROJECT, 40)).not.toThrow();
  });

  it('C10b: is a safe no-op when the entry reads back but the write throws', () => {
    // getItem succeeds (so an entry exists and is merged) but setItem throws (e.g. quota).
    installStorage({
      getItem: () => JSON.stringify(FILE),
      setItem: () => { throw new Error('quota'); },
      removeItem: () => undefined,
    });
    expect(() => rememberLine(USER, PROJECT, 40)).not.toThrow();
  });
});

describe('clearLastSelection', () => {
  it('C9: removes the entry', () => {
    rememberFile(USER, PROJECT, FILE);
    clearLastSelection(USER, PROJECT);
    expect(readLastSelection(USER, PROJECT)).toBeNull();
  });

  it('C10: is a safe no-op when localStorage throws', () => {
    installStorage(throwingStorage);
    expect(() => clearLastSelection(USER, PROJECT)).not.toThrow();
  });
});

describe('isolation', () => {
  it('C11: two projectIds for the same user are independent', () => {
    const fileA: LastSelection = { ...FILE, nodeId: 'a' };
    const fileB: LastSelection = { ...FILE, nodeId: 'b' };
    rememberFile(USER, 'proj-a', fileA);
    rememberFile(USER, 'proj-b', fileB);
    expect(readLastSelection(USER, 'proj-a')).toEqual(fileA);
    expect(readLastSelection(USER, 'proj-b')).toEqual(fileB);
  });

  it('C12: two userIds for the same project are independent — user A never reads user B', () => {
    const fileA: LastSelection = { ...FILE, nodeId: 'a' };
    const fileB: LastSelection = { ...FILE, nodeId: 'b' };
    rememberFile('user-a', PROJECT, fileA);
    rememberFile('user-b', PROJECT, fileB);
    expect(readLastSelection('user-a', PROJECT)).toEqual(fileA);
    expect(readLastSelection('user-b', PROJECT)).toEqual(fileB);
  });
});

// --- Per-file cursor map --------------------------------------------------

describe('fileCursorsKey', () => {
  it('builds a user- and project-scoped key (no magic strings)', () => {
    expect(fileCursorsKey(USER, PROJECT)).toBe('asciidocollab:file-cursors:user-1:proj-1');
  });

  it('is distinct from the last-selection key (separate store)', () => {
    expect(fileCursorsKey(USER, PROJECT)).not.toBe(lastSelectionKey(USER, PROJECT));
  });
});

describe('readCursorLine', () => {
  it('returns undefined when no entry exists (caller opens at top)', () => {
    expect(readCursorLine(USER, PROJECT, 'n1')).toBeUndefined();
  });

  it('returns the stored 1-based line for a remembered file', () => {
    rememberCursorLine(USER, PROJECT, 'n1', 42);
    expect(readCursorLine(USER, PROJECT, 'n1')).toBe(42);
  });

  it('returns undefined (no throw) when stored JSON is malformed', () => {
    localStorage.setItem(fileCursorsKey(USER, PROJECT), '{not valid json');
    expect(() => readCursorLine(USER, PROJECT, 'n1')).not.toThrow();
    expect(readCursorLine(USER, PROJECT, 'n1')).toBeUndefined();
  });

  it('returns undefined when the map is the wrong shape (array / not an object)', () => {
    localStorage.setItem(fileCursorsKey(USER, PROJECT), JSON.stringify([{ n1: { line: 5 } }]));
    expect(readCursorLine(USER, PROJECT, 'n1')).toBeUndefined();
    localStorage.setItem(fileCursorsKey(USER, PROJECT), JSON.stringify('nope'));
    expect(readCursorLine(USER, PROJECT, 'n1')).toBeUndefined();
  });

  it('drops a non-finite or < 1 line for a single entry without affecting others', () => {
    rememberCursorLine(USER, PROJECT, 'good', 7);
    // Hand-craft a map with one corrupt entry alongside a valid one.
    localStorage.setItem(
      fileCursorsKey(USER, PROJECT),
      JSON.stringify({ good: { line: 7 }, bad: { line: 0 }, naned: { line: Number.NaN } }),
    );
    expect(readCursorLine(USER, PROJECT, 'good')).toBe(7);
    expect(readCursorLine(USER, PROJECT, 'bad')).toBeUndefined();
    expect(readCursorLine(USER, PROJECT, 'naned')).toBeUndefined();
  });

  it('returns undefined (no throw) when an entry is the wrong shape', () => {
    localStorage.setItem(
      fileCursorsKey(USER, PROJECT),
      JSON.stringify({ n1: 5, n2: { line: 'x' }, n3: null }),
    );
    expect(readCursorLine(USER, PROJECT, 'n1')).toBeUndefined();
    expect(readCursorLine(USER, PROJECT, 'n2')).toBeUndefined();
    expect(readCursorLine(USER, PROJECT, 'n3')).toBeUndefined();
  });

  it('returns undefined (no throw) when localStorage throws', () => {
    installStorage(throwingStorage);
    expect(() => readCursorLine(USER, PROJECT, 'n1')).not.toThrow();
    expect(readCursorLine(USER, PROJECT, 'n1')).toBeUndefined();
  });
});

describe('rememberCursorLine', () => {
  it('persists a per-file map keyed by nodeId, with the validated line', () => {
    rememberCursorLine(USER, PROJECT, 'n1', 10);
    expect(JSON.parse(localStorage.getItem(fileCursorsKey(USER, PROJECT))!)).toEqual({ n1: { line: 10 } });
  });

  it('merges a second file without clobbering the first (two files → distinct entries)', () => {
    rememberCursorLine(USER, PROJECT, 'n1', 10);
    rememberCursorLine(USER, PROJECT, 'n2', 20);
    expect(readCursorLine(USER, PROJECT, 'n1')).toBe(10);
    expect(readCursorLine(USER, PROJECT, 'n2')).toBe(20);
  });

  it('overwrites the same file with a newer line', () => {
    rememberCursorLine(USER, PROJECT, 'n1', 10);
    rememberCursorLine(USER, PROJECT, 'n1', 99);
    expect(readCursorLine(USER, PROJECT, 'n1')).toBe(99);
  });

  it('does not write a non-finite or < 1 line', () => {
    rememberCursorLine(USER, PROJECT, 'n1', 0);
    rememberCursorLine(USER, PROJECT, 'n1', Number.NaN);
    rememberCursorLine(USER, PROJECT, 'n1', Number.POSITIVE_INFINITY);
    expect(readCursorLine(USER, PROJECT, 'n1')).toBeUndefined();
  });

  it('recovers from a corrupt existing map by starting fresh', () => {
    localStorage.setItem(fileCursorsKey(USER, PROJECT), '{not valid json');
    rememberCursorLine(USER, PROJECT, 'n1', 5);
    expect(readCursorLine(USER, PROJECT, 'n1')).toBe(5);
  });

  it('is a safe no-op when localStorage throws', () => {
    installStorage(throwingStorage);
    expect(() => rememberCursorLine(USER, PROJECT, 'n1', 5)).not.toThrow();
  });
});

describe('pruneCursor', () => {
  it('removes a deleted file’s entry, leaving the others', () => {
    rememberCursorLine(USER, PROJECT, 'n1', 10);
    rememberCursorLine(USER, PROJECT, 'n2', 20);
    pruneCursor(USER, PROJECT, 'n1');
    expect(readCursorLine(USER, PROJECT, 'n1')).toBeUndefined();
    expect(readCursorLine(USER, PROJECT, 'n2')).toBe(20);
  });

  it('is a no-op when the file was never remembered', () => {
    rememberCursorLine(USER, PROJECT, 'n2', 20);
    expect(() => pruneCursor(USER, PROJECT, 'missing')).not.toThrow();
    expect(readCursorLine(USER, PROJECT, 'n2')).toBe(20);
  });

  it('is a no-op when no map exists', () => {
    expect(() => pruneCursor(USER, PROJECT, 'n1')).not.toThrow();
    expect(localStorage.getItem(fileCursorsKey(USER, PROJECT))).toBeNull();
  });

  it('is a safe no-op when localStorage throws', () => {
    installStorage(throwingStorage);
    expect(() => pruneCursor(USER, PROJECT, 'n1')).not.toThrow();
  });
});

describe('cursor-map isolation', () => {
  it('two projectIds for the same user are independent', () => {
    rememberCursorLine(USER, 'proj-a', 'n1', 3);
    rememberCursorLine(USER, 'proj-b', 'n1', 8);
    expect(readCursorLine(USER, 'proj-a', 'n1')).toBe(3);
    expect(readCursorLine(USER, 'proj-b', 'n1')).toBe(8);
  });

  it('two userIds on one browser are independent — user A never reads user B', () => {
    rememberCursorLine('user-a', PROJECT, 'n1', 3);
    rememberCursorLine('user-b', PROJECT, 'n1', 8);
    expect(readCursorLine('user-a', PROJECT, 'n1')).toBe(3);
    expect(readCursorLine('user-b', PROJECT, 'n1')).toBe(8);
  });

  it('is independent from the last-selection store (coexistence)', () => {
    rememberFile(USER, PROJECT, FILE);
    rememberLine(USER, PROJECT, 5);
    rememberCursorLine(USER, PROJECT, FILE.nodeId, 50);
    // The single last-selection keeps its own line; the per-file map keeps a distinct one.
    expect(readLastSelection(USER, PROJECT)).toEqual({ ...FILE, line: 5 });
    expect(readCursorLine(USER, PROJECT, FILE.nodeId)).toBe(50);
  });
});
