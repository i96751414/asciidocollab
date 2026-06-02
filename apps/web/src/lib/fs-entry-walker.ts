/** Walks a DataTransferItemList recursively, yielding each file with its relative path. */
export async function* walkEntries(
  items: DataTransferItemList,
): AsyncIterable<{ file: File; relativePath: string }> {
  for (const item of items) {
    const entry = getEntry(item);
    if (!entry) continue;
    yield* walkEntry(entry, '');
  }
}

async function* walkEntry(
  entry: FileSystemEntry,
  prefix: string,
): AsyncIterable<{ file: File; relativePath: string }> {
  const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

  if (isFileEntry(entry)) {
    const file = await getFile(entry);
    yield { file, relativePath };
  } else if (isDirectoryEntry(entry)) {
    const reader = entry.createReader();
    let batch: FileSystemEntry[];
    do {
      batch = await readEntries(reader);
      for (const child of batch) {
        yield* walkEntry(child, relativePath);
      }
    } while (batch.length > 0);
  }
}

function getEntry(item: DataTransferItem): FileSystemEntry | null {
  // Use unprefixed getAsEntry first (standards), then webkit-prefixed for Safari
  if ('getAsEntry' in item && typeof item.getAsEntry === 'function') {
    return item.getAsEntry() ?? null;
  }
  return item.webkitGetAsEntry?.() ?? null;
}

function isFileEntry(entry: FileSystemEntry): entry is FileSystemFileEntry {
  return entry.isFile;
}

function isDirectoryEntry(entry: FileSystemEntry): entry is FileSystemDirectoryEntry {
  return entry.isDirectory;
}

function getFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}
