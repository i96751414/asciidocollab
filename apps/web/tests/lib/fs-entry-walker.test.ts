import { walkEntries } from '@/lib/fs-entry-walker';

type MockFileEntry = {
  isFile: true;
  isDirectory: false;
  name: string;
  fullPath: string;
  file: (callback: (f: File) => void) => void;
};

type MockDirectoryEntry = {
  isFile: false;
  isDirectory: true;
  name: string;
  fullPath: string;
  createReader: () => { readEntries: (callback: (entries: (MockFileEntry | MockDirectoryEntry)[]) => void) => void };
};

function makeFileEntry(name: string, fullPath: string): MockFileEntry {
  const mockFile = new File([`content of ${name}`], name);
  return {
    isFile: true,
    isDirectory: false,
    name,
    fullPath,
    file: (callback) => callback(mockFile),
  };
}

function makeDirectoryEntry(name: string, fullPath: string, children: (MockFileEntry | MockDirectoryEntry)[]): MockDirectoryEntry {
  return {
    isFile: false,
    isDirectory: true,
    name,
    fullPath,
    createReader: () => {
      let called = false;
      return {
        readEntries: (callback) => {
          if (called) {
            callback([]);
          } else {
            called = true;
            callback(children);
          }
        },
      };
    },
  };
}

function makeDataTransferItemList(entries: (MockFileEntry | MockDirectoryEntry)[]): DataTransferItemList {
  const items = entries.map((entry) => ({
    kind: 'file',
    type: '',
    getAsFile: () => null,
    getAsString: () => {},
    webkitGetAsEntry: () => entry,
    getAsEntry: () => entry,
  }));

  const originalItems = [...items];
  return Object.assign(items, {
    length: originalItems.length,
    [Symbol.iterator]: function* () { yield* originalItems; },
    add: () => null,
    clear: () => {},
    remove: () => {},
  }) as unknown as DataTransferItemList;
}

describe('walkEntries', () => {
  it('flat file drop yields correct {file, relativePath} pairs', async () => {
    const entries = [
      makeFileEntry('a.txt', '/a.txt'),
      makeFileEntry('b.txt', '/b.txt'),
    ];
    const items = makeDataTransferItemList(entries);

    const results: Array<{ file: File; relativePath: string }> = [];
    for await (const item of walkEntries(items)) {
      results.push(item);
    }

    expect(results).toHaveLength(2);
    expect(results[0].relativePath).toBe('a.txt');
    expect(results[1].relativePath).toBe('b.txt');
    expect(results[0].file).toBeInstanceOf(File);
    expect(results[1].file).toBeInstanceOf(File);
  });

  it('directory drop recursively yields all contained files with correct relative paths', async () => {
    const fileInDirectory = makeFileEntry('file.txt', '/subdir/file.txt');
    const directory = makeDirectoryEntry('subdir', '/subdir', [fileInDirectory]);
    const items = makeDataTransferItemList([directory]);

    const results: Array<{ file: File; relativePath: string }> = [];
    for await (const item of walkEntries(items)) {
      results.push(item);
    }

    expect(results).toHaveLength(1);
    expect(results[0].relativePath).toBe('subdir/file.txt');
  });

  it('mixed file+folder drop works', async () => {
    const topFile = makeFileEntry('top.txt', '/top.txt');
    const nested = makeFileEntry('nested.txt', '/dir/nested.txt');
    const directory = makeDirectoryEntry('dir', '/dir', [nested]);
    const items = makeDataTransferItemList([topFile, directory]);

    const results: Array<{ relativePath: string }> = [];
    for await (const item of walkEntries(items)) {
      results.push(item);
    }

    expect(results).toHaveLength(2);
    const paths = results.map((result) => result.relativePath).toSorted();
    expect(paths).toEqual(['dir/nested.txt', 'top.txt']);
  });

  it('empty DataTransferItemList yields nothing', async () => {
    const items = makeDataTransferItemList([]);
    const results: Array<unknown> = [];
    for await (const item of walkEntries(items)) {
      results.push(item);
    }
    expect(results).toHaveLength(0);
  });
});

describe('walkEntries — getEntry fallback paths', () => {
  function makeItemListWithFallback(files: File[], hasEntry = false): DataTransferItemList {
    const items = files.map((file) => ({
      kind: 'file' as const,
      type: '',
      getAsFile: () => file,
      getAsString: () => {},
      webkitGetAsEntry: () => (hasEntry ? null : null),
      getAsEntry: () => null,
    }));
    const original = [...items];
    return Object.assign(items, {
      length: original.length,
      [Symbol.iterator]: function* () { yield* original; },
      add: () => null,
      clear: () => {},
      remove: () => {},
    }) as unknown as DataTransferItemList;
  }

  it('falls back to getAsFile() when getEntry() returns null', async () => {
    const file = new File(['hello'], 'fallback.txt', { type: 'text/plain' });
    const items = makeItemListWithFallback([file]);

    const results: Array<{ file: File; relativePath: string }> = [];
    for await (const item of walkEntries(items)) {
      results.push(item);
    }

    expect(results).toHaveLength(1);
    expect(results[0].file.name).toBe('fallback.txt');
    expect(results[0].relativePath).toBe('fallback.txt');
  });

  it('skips item when both getEntry() and getAsFile() return null', async () => {
    const item = {
      kind: 'file' as const,
      type: '',
      getAsFile: () => null,
      getAsString: () => {},
      webkitGetAsEntry: () => null,
      getAsEntry: () => null,
    };
    const arr = [item];
    const snapshot = [...arr];
    const items = Object.assign(arr, {
      length: snapshot.length,
      [Symbol.iterator]: function* () { yield* snapshot; },
      add: () => null,
      clear: () => {},
      remove: () => {},
    }) as unknown as DataTransferItemList;

    const results: Array<unknown> = [];
    for await (const r of walkEntries(items)) {
      results.push(r);
    }
    expect(results).toHaveLength(0);
  });

  it('skips non-file items (kind !== "file")', async () => {
    const item = {
      kind: 'string' as const,
      type: 'text/plain',
      getAsFile: () => null,
      getAsString: () => {},
      webkitGetAsEntry: () => null,
    };
    const arr = [item];
    const snapshot = [...arr];
    const items = Object.assign(arr, {
      length: snapshot.length,
      [Symbol.iterator]: function* () { yield* snapshot; },
      add: () => null,
      clear: () => {},
      remove: () => {},
    }) as unknown as DataTransferItemList;

    const results: Array<unknown> = [];
    for await (const r of walkEntries(items)) {
      results.push(r);
    }
    expect(results).toHaveLength(0);
  });

  it('uses webkitGetAsEntry when getAsEntry is not available', async () => {
    const mockFile = new File(['content'], 'webkit.txt');
    const mockEntry = {
      isFile: true,
      isDirectory: false,
      name: 'webkit.txt',
      fullPath: '/webkit.txt',
      file: (callback: (f: File) => void) => callback(mockFile),
    };

    const item = {
      kind: 'file' as const,
      type: '',
      getAsFile: () => null,  // null so fallback path is not taken — entry must come from webkitGetAsEntry
      getAsString: () => {},
      webkitGetAsEntry: () => mockEntry,
      // No getAsEntry property
    };
    const arr = [item];
    const snapshot = [...arr];
    const items = Object.assign(arr, {
      length: snapshot.length,
      [Symbol.iterator]: function* () { yield* snapshot; },
      add: () => null,
      clear: () => {},
      remove: () => {},
    }) as unknown as DataTransferItemList;

    const results: Array<{ file: File; relativePath: string }> = [];
    for await (const r of walkEntries(items)) {
      results.push(r);
    }
    expect(results).toHaveLength(1);
    expect(results[0].relativePath).toBe('webkit.txt');
    expect(results[0].file).toBeInstanceOf(File);
  });

  it('uses getAsEntry (not webkitGetAsEntry) when getAsEntry is available and returns a valid entry', async () => {
    const mockFile = new File(['content'], 'get-as-entry.txt');
    const mockEntry = {
      isFile: true,
      isDirectory: false,
      name: 'get-as-entry.txt',
      fullPath: '/get-as-entry.txt',
      file: (callback: (f: File) => void) => callback(mockFile),
    };

    // Has getAsEntry (returns valid entry) but webkitGetAsEntry returns null — entry must come via getAsEntry
    const item = {
      kind: 'file' as const,
      type: '',
      getAsFile: () => null,
      getAsString: () => {},
      getAsEntry: () => mockEntry,
      webkitGetAsEntry: () => null,
    };
    const arr = [item];
    const snapshot = [...arr];
    const items = Object.assign(arr, {
      length: snapshot.length,
      [Symbol.iterator]: function* () { yield* snapshot; },
      add: () => null,
      clear: () => {},
      remove: () => {},
    }) as unknown as DataTransferItemList;

    const results: Array<{ file: File; relativePath: string }> = [];
    for await (const r of walkEntries(items)) {
      results.push(r);
    }
    expect(results).toHaveLength(1);
    expect(results[0].relativePath).toBe('get-as-entry.txt');
    expect(results[0].file).toBeInstanceOf(File);
  });
});

describe('walkEntries — unknown entry type is silently skipped', () => {
  it('silently skips a FileSystemEntry that is neither a file nor a directory', async () => {
    // An entry with isFile=false and isDirectory=false is malformed/unknown.
    // The hook must skip it rather than attempting directory traversal on it.
    const unknownEntry = {
      isFile: false,
      isDirectory: false,
      name: 'unknown',
      fullPath: '/unknown',
      // Intentionally no createReader — calling it would throw TypeError
    };

    const arr = [{
      kind: 'file' as const,
      type: '',
      getAsFile: () => null,
      getAsString: () => {},
      getAsEntry: () => unknownEntry,
      webkitGetAsEntry: () => unknownEntry,
    }];
    const snapshot = [...arr];
    const items = Object.assign(arr, {
      length: snapshot.length,
      [Symbol.iterator]: function* () { yield* snapshot; },
      add: () => null,
      clear: () => {},
      remove: () => {},
    }) as unknown as DataTransferItemList;

    const results: Array<unknown> = [];
    for await (const r of walkEntries(items)) {
      results.push(r);
    }
    expect(results).toHaveLength(0);
  });
});

describe('walkEntries — optional chaining and kind guard', () => {
  function makeItemList(item: Record<string, unknown>): DataTransferItemList {
    const arr = [item];
    const snapshot = [...arr];
    return Object.assign(arr, {
      length: snapshot.length,
      [Symbol.iterator]: function* () { yield* snapshot; },
      add: () => null,
      clear: () => {},
      remove: () => {},
    }) as unknown as DataTransferItemList;
  }

  it('skips item with kind="string" even when getAsFile() would return a non-null file', async () => {
    const file = new File(['content'], 'string-type.txt');
    const item = {
      kind: 'string' as const,
      type: 'text/plain',
      getAsFile: () => file,
      getAsString: () => {},
      webkitGetAsEntry: () => null,
    };
    const results: Array<unknown> = [];
    for await (const r of walkEntries(makeItemList(item))) {
      results.push(r);
    }
    expect(results).toHaveLength(0);
  });

  it('falls back to getAsFile when getAsEntry property is null (not a callable function)', async () => {
    const file = new File(['content'], 'getasentry-null.txt');
    const item = {
      kind: 'file' as const,
      type: '',
      getAsFile: () => file,
      getAsString: () => {},
      getAsEntry: null as unknown as (() => FileSystemEntry | null),
      webkitGetAsEntry: () => null,
    };
    const results: Array<{ file: File; relativePath: string }> = [];
    for await (const r of walkEntries(makeItemList(item))) {
      results.push(r);
    }
    expect(results).toHaveLength(1);
    expect(results[0].file.name).toBe('getasentry-null.txt');
  });

  it('falls back to getAsFile when webkitGetAsEntry property is null and no getAsEntry is present', async () => {
    const file = new File(['content'], 'webkit-null.txt');
    const item = {
      kind: 'file' as const,
      type: '',
      getAsFile: () => file,
      getAsString: () => {},
      webkitGetAsEntry: null as unknown as (() => FileSystemEntry | null),
    };
    const results: Array<{ file: File; relativePath: string }> = [];
    for await (const r of walkEntries(makeItemList(item))) {
      results.push(r);
    }
    expect(results).toHaveLength(1);
    expect(results[0].file.name).toBe('webkit-null.txt');
  });
});

describe('walkEntries — multi-batch directory reader', () => {
  it('reads all entries when directory reader yields entries in multiple batches', async () => {
    const file1 = makeFileEntry('first.txt', '/dir/first.txt');
    const file2 = makeFileEntry('second.txt', '/dir/second.txt');

    // Reader returns file1 on first call, file2 on second call, [] on third call
    let batchIndex = 0;
    const batches = [[file1], [file2]];
    const multiBatchDir = {
      isFile: false as const,
      isDirectory: true as const,
      name: 'dir',
      fullPath: '/dir',
      createReader: () => ({
        readEntries: (callback: (entries: (typeof file1 | typeof file2)[]) => void) => {
          if (batchIndex < batches.length) {
            callback(batches[batchIndex++]);
          } else {
            callback([]);
          }
        },
      }),
    };

    const arr = [{
      kind: 'file' as const,
      type: '',
      getAsFile: () => null,
      getAsString: () => {},
      webkitGetAsEntry: () => multiBatchDir,
      getAsEntry: () => multiBatchDir,
    }];
    const snapshot = [...arr];
    const items = Object.assign(arr, {
      length: snapshot.length,
      [Symbol.iterator]: function* () { yield* snapshot; },
      add: () => null,
      clear: () => {},
      remove: () => {},
    }) as unknown as DataTransferItemList;

    const results: Array<{ file: File; relativePath: string }> = [];
    for await (const r of walkEntries(items)) {
      results.push(r);
    }

    expect(results).toHaveLength(2);
    const paths = results.map((r) => r.relativePath).toSorted();
    expect(paths).toEqual(['dir/first.txt', 'dir/second.txt']);
  });
});
