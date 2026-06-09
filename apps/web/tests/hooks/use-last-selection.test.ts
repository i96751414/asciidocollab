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
  it('builds a user- and project-scoped key (FR-011, no magic strings)', () => {
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
  it('C11: two projectIds for the same user are independent (FR-003)', () => {
    const fileA: LastSelection = { ...FILE, nodeId: 'a' };
    const fileB: LastSelection = { ...FILE, nodeId: 'b' };
    rememberFile(USER, 'proj-a', fileA);
    rememberFile(USER, 'proj-b', fileB);
    expect(readLastSelection(USER, 'proj-a')).toEqual(fileA);
    expect(readLastSelection(USER, 'proj-b')).toEqual(fileB);
  });

  it('C12: two userIds for the same project are independent — user A never reads user B (FR-011)', () => {
    const fileA: LastSelection = { ...FILE, nodeId: 'a' };
    const fileB: LastSelection = { ...FILE, nodeId: 'b' };
    rememberFile('user-a', PROJECT, fileA);
    rememberFile('user-b', PROJECT, fileB);
    expect(readLastSelection('user-a', PROJECT)).toEqual(fileA);
    expect(readLastSelection('user-b', PROJECT)).toEqual(fileB);
  });
});
