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
