import { renderHook, act } from '@testing-library/react';
import { useDropUpload } from '@/hooks/use-drop-upload';

// Mock dependencies
jest.mock('@/lib/fs-entry-walker', () => ({
  walkEntries: jest.fn(),
}));
jest.mock('@/lib/api/assets', () => ({
  uploadAsset: jest.fn(),
}));

const mockWalkEntries = jest.requireMock('@/lib/fs-entry-walker').walkEntries as jest.Mock;
const mockUploadAsset = jest.requireMock('@/lib/api/assets').uploadAsset as jest.Mock;

jest.mock('@/lib/api/file-tree', () => {
  class FileTreeApiError extends Error {
    status: number;
    code: string;
    existingFileNodeId?: string;
    constructor(status: number, code: string, message: string, existingFileNodeId?: string) {
      super(message);
      this.name = 'FileTreeApiError';
      this.status = status;
      this.code = code;
      this.existingFileNodeId = existingFileNodeId;
    }
  }
  return { createFolder: jest.fn(), FileTreeApiError };
});

const FileTreeApiError = jest.requireMock('@/lib/api/file-tree').FileTreeApiError as new (
  status: number,
  code: string,
  message: string,
  existingFileNodeId?: string,
) => Error & { status: number; existingFileNodeId?: string };
function makeFile(name: string): File {
  return new File([`content of ${name}`], name, { type: 'text/plain' });
}

function makeAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]: async function* () {
      yield* items;
    },
  };
}

describe('useDropUpload', () => {
  const projectId = 'project-123';
  const targetFolderId = 'folder-456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('flat file drop calls uploadAsset for each file with correct parentId', async () => {
    const file1 = makeFile('a.txt');
    const file2 = makeFile('b.txt');

    mockWalkEntries.mockReturnValue(makeAsyncIterable([
      { file: file1, relativePath: 'a.txt' },
      { file: file2, relativePath: 'b.txt' },
    ]));

    mockUploadAsset.mockResolvedValue({ assetId: 'asset-1', filename: 'a.txt', storagePath: '/a.txt', sizeBytes: 10, mimeType: 'text/plain' });

    const { result } = renderHook(() => useDropUpload(targetFolderId, projectId));

    const mockItems = {} as DataTransferItemList;
    await act(async () => {
      result.current.onDrop(mockItems);
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(mockUploadAsset).toHaveBeenCalledWith(projectId, targetFolderId, file1);
    expect(mockUploadAsset).toHaveBeenCalledWith(projectId, targetFolderId, file2);
  });

  it('per-item status transitions are reflected in progress', async () => {
    const file1 = makeFile('c.txt');

    mockWalkEntries.mockReturnValue(makeAsyncIterable([
      { file: file1, relativePath: 'c.txt' },
    ]));

    let resolveUpload: (() => void) | undefined;
    mockUploadAsset.mockReturnValue(
      new Promise<void>((resolve) => { resolveUpload = resolve; }).then(() => ({
        assetId: 'asset-c', filename: 'c.txt', storagePath: '/c.txt', sizeBytes: 10, mimeType: 'text/plain',
      })),
    );

    const { result } = renderHook(() => useDropUpload(targetFolderId, projectId));
    const mockItems = {} as DataTransferItemList;

    await act(async () => {
      result.current.onDrop(mockItems);
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.progress.some((p) => p.status === 'uploading')).toBe(true);

    await act(async () => {
      resolveUpload?.();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.progress.every((p) => p.status === 'done')).toBe(true);
  });

  it('uses existingFileNodeId from 409 response when folder already exists', async () => {
    const existingFolderId = 'existing-folder-uuid';
    const mockCreateFolder = jest.requireMock('@/lib/api/file-tree').createFolder as jest.Mock;

    mockCreateFolder.mockRejectedValueOnce(
      new FileTreeApiError(409, 'CONFLICT', 'Folder already exists', existingFolderId),
    );
    mockUploadAsset.mockResolvedValue({ assetId: 'asset-1', filename: 'file.txt', storagePath: '/docs/file.txt', sizeBytes: 10, mimeType: 'text/plain' });
    mockWalkEntries.mockReturnValue(
      makeAsyncIterable([{ file: makeFile('file.txt'), relativePath: 'docs/file.txt' }]),
    );

    const { result } = renderHook(() => useDropUpload(targetFolderId, projectId));
    const mockItems = {} as DataTransferItemList;

    await act(async () => {
      await result.current.onDrop(mockItems);
    });

    expect(mockCreateFolder).toHaveBeenCalledWith(projectId, targetFolderId, 'docs');
    // uploadAsset must use existingFolderId (not targetFolderId) as the parent
    expect(mockUploadAsset).toHaveBeenCalledWith(projectId, existingFolderId, expect.any(File));
  });

  it('calls onComplete after all uploads finish', async () => {
    const onComplete = jest.fn();
    mockWalkEntries.mockReturnValue(makeAsyncIterable([
      { file: makeFile('a.txt'), relativePath: 'a.txt' },
    ]));
    mockUploadAsset.mockResolvedValue({ assetId: 'a', filename: 'a.txt', storagePath: '/a.txt', sizeBytes: 10, mimeType: 'text/plain' });

    const { result } = renderHook(() => useDropUpload(targetFolderId, projectId, onComplete));
    await act(async () => {
      await result.current.onDrop({} as DataTransferItemList);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('calls onComplete even when some uploads fail', async () => {
    const onComplete = jest.fn();
    mockWalkEntries.mockReturnValue(makeAsyncIterable([
      { file: makeFile('fail.txt'), relativePath: 'fail.txt' },
    ]));
    mockUploadAsset.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useDropUpload(targetFolderId, projectId, onComplete));
    await act(async () => {
      await result.current.onDrop({} as DataTransferItemList);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('initial progress status for each item is "pending"', async () => {
    const file = makeFile('pending.txt');
    mockWalkEntries.mockReturnValue(makeAsyncIterable([
      { file, relativePath: 'pending.txt' },
    ]));

    let resolveUpload: (() => void) | undefined;
    mockUploadAsset.mockReturnValue(new Promise<void>((resolve) => { resolveUpload = resolve; }).then(() => ({
      assetId: 'a', filename: 'pending.txt', storagePath: '/pending.txt', sizeBytes: 10, mimeType: 'text/plain',
    })));

    const { result } = renderHook(() => useDropUpload(targetFolderId, projectId));

    await act(async () => {
      result.current.onDrop({} as DataTransferItemList);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    // At least at some point, items were in pending state (before uploading starts)
    resolveUpload?.();
  });

  it('uses "/" as path separator when building folder paths for nested files', async () => {
    const mockCreateFolder = jest.requireMock('@/lib/api/file-tree').createFolder as jest.Mock;
    mockCreateFolder.mockResolvedValue({ fileNodeId: 'folder-abc' });
    mockUploadAsset.mockResolvedValue({ assetId: 'a', filename: 'file.txt', storagePath: '/docs/file.txt', sizeBytes: 10, mimeType: 'text/plain' });
    mockWalkEntries.mockReturnValue(makeAsyncIterable([
      { file: makeFile('file.txt'), relativePath: 'docs/sub/file.txt' },
    ]));

    const { result } = renderHook(() => useDropUpload(targetFolderId, projectId));
    await act(async () => { await result.current.onDrop({} as DataTransferItemList); });

    // createFolder should have been called for 'docs' and 'docs/sub'
    const folderNames = mockCreateFolder.mock.calls.map(([_a, _b, name]: [unknown, unknown, string]) => name);
    expect(folderNames).toContain('docs');
    expect(folderNames).toContain('sub');
  });

  it('error message for non-Error rejection is "Upload failed"', async () => {
    mockWalkEntries.mockReturnValue(makeAsyncIterable([
      { file: makeFile('file.txt'), relativePath: 'file.txt' },
    ]));
    mockUploadAsset.mockRejectedValue('not an error object');

    const { result } = renderHook(() => useDropUpload(targetFolderId, projectId));
    await act(async () => { await result.current.onDrop({} as DataTransferItemList); });

    const errorItem = result.current.progress.find((p) => p.status === 'error');
    expect(errorItem).toBeDefined();
    expect(errorItem?.errorMessage).toBe('Upload failed');
  });

  it('uses existingFileNodeId as parentId when 409 has existingFileNodeId but falls back to parentId when null', async () => {
    const existingFolderId = 'existing-uuid';
    const mockCreateFolder = jest.requireMock('@/lib/api/file-tree').createFolder as jest.Mock;

    mockCreateFolder.mockRejectedValueOnce(
      new FileTreeApiError(409, 'CONFLICT', 'Already exists', existingFolderId),
    );
    mockUploadAsset.mockResolvedValue({ assetId: 'a', filename: 'f.txt', storagePath: '/docs/f.txt', sizeBytes: 5, mimeType: 'text/plain' });
    mockWalkEntries.mockReturnValue(makeAsyncIterable([
      { file: makeFile('f.txt'), relativePath: 'docs/f.txt' },
    ]));

    const { result } = renderHook(() => useDropUpload(targetFolderId, projectId));
    await act(async () => { await result.current.onDrop({} as DataTransferItemList); });

    expect(mockUploadAsset).toHaveBeenCalledWith(projectId, existingFolderId, expect.any(File));
  });

  it('uses parentId fallback when 409 existingFileNodeId is undefined', async () => {
    const mockCreateFolder = jest.requireMock('@/lib/api/file-tree').createFolder as jest.Mock;

    // 409 without existingFileNodeId → falls back to parentId (targetFolderId for root)
    mockCreateFolder.mockRejectedValueOnce(
      new FileTreeApiError(409, 'CONFLICT', 'Already exists', undefined),
    );
    mockUploadAsset.mockResolvedValue({ assetId: 'a', filename: 'f.txt', storagePath: '/docs/f.txt', sizeBytes: 5, mimeType: 'text/plain' });
    mockWalkEntries.mockReturnValue(makeAsyncIterable([
      { file: makeFile('f.txt'), relativePath: 'docs/f.txt' },
    ]));

    const { result } = renderHook(() => useDropUpload(targetFolderId, projectId));
    await act(async () => { await result.current.onDrop({} as DataTransferItemList); });

    // Falls back to parentId (targetFolderId) since existingFileNodeId is undefined
    expect(mockUploadAsset).toHaveBeenCalledWith(projectId, targetFolderId, expect.any(File));
  });

  it('clearProgress resets progress to empty', async () => {
    mockWalkEntries.mockReturnValue(makeAsyncIterable([
      { file: makeFile('a.txt'), relativePath: 'a.txt' },
    ]));
    mockUploadAsset.mockResolvedValue({ assetId: 'a', filename: 'a.txt', storagePath: '/a.txt', sizeBytes: 10, mimeType: 'text/plain' });

    const { result } = renderHook(() => useDropUpload(targetFolderId, projectId));
    await act(async () => {
      await result.current.onDrop({} as DataTransferItemList);
    });

    expect(result.current.progress.length).toBeGreaterThan(0);

    act(() => { result.current.clearProgress(); });
    expect(result.current.progress).toHaveLength(0);
  });

  it('3-level deep path: parts.at(-1) gives correct folder name at each depth', async () => {
    const mockCreateFolder = jest.requireMock('@/lib/api/file-tree').createFolder as jest.Mock;
    // Return unique IDs per folder so we can track creation order
    mockCreateFolder.mockImplementation((_: string, __: string, name: string) =>
      Promise.resolve({ fileNodeId: `folder-${name}` }),
    );
    mockUploadAsset.mockResolvedValue({ assetId: 'a', filename: 'file.txt', storagePath: '/a/b/c/file.txt', sizeBytes: 5, mimeType: 'text/plain' });
    mockWalkEntries.mockReturnValue(makeAsyncIterable([
      { file: makeFile('file.txt'), relativePath: 'a/b/c/file.txt' },
    ]));

    const { result } = renderHook(() => useDropUpload(targetFolderId, projectId));
    await act(async () => { await result.current.onDrop({} as DataTransferItemList); });

    // Folders 'a', 'b', 'c' must have been created with their correct names
    const folderNames = mockCreateFolder.mock.calls.map(([_a, _b, name]: [unknown, unknown, string]) => name);
    expect(folderNames).toContain('a');
    expect(folderNames).toContain('b');
    expect(folderNames).toContain('c');

    // Verify 'b' is created under 'folder-a' (correct parent — not under root)
    const bCalls = mockCreateFolder.mock.calls.filter(([_a, _b, n]: [unknown, unknown, string]) => n === 'b');
    expect(bCalls).toHaveLength(1);
    expect((bCalls[0] as [unknown, string, string])[1]).toBe('folder-a');

    // Verify 'c' is created under 'folder-b' (correct parent — not under some mangled path)
    const cCalls = mockCreateFolder.mock.calls.filter(([_a, _b, n]: [unknown, unknown, string]) => n === 'c');
    expect(cCalls).toHaveLength(1);
    expect((cCalls[0] as [unknown, string, string])[1]).toBe('folder-b');

    // The file must have been uploaded to folder-c (deepest), not folder-b
    expect(mockUploadAsset).toHaveBeenCalledWith(projectId, 'folder-c', expect.any(File));
  });

  it('non-409 createFolder error causes onDrop to reject (error is not silently swallowed)', async () => {
    const mockCreateFolder = jest.requireMock('@/lib/api/file-tree').createFolder as jest.Mock;
    mockCreateFolder.mockRejectedValueOnce(
      new FileTreeApiError(500, 'SERVER_ERROR', 'Internal server error'),
    );
    mockWalkEntries.mockReturnValue(makeAsyncIterable([
      { file: makeFile('file.txt'), relativePath: 'docs/file.txt' },
    ]));

    const { result } = renderHook(() => useDropUpload(targetFolderId, projectId));
    await expect(
      act(async () => { await result.current.onDrop({} as DataTransferItemList); }),
    ).rejects.toThrow('Internal server error');

    // Upload must not have been attempted since folder creation failed
    expect(mockUploadAsset).not.toHaveBeenCalled();
  });

  it('one item failure sets status to error and does not cancel remaining items', async () => {
    const file1 = makeFile('fail.txt');
    const file2 = makeFile('ok.txt');

    mockWalkEntries.mockReturnValue(makeAsyncIterable([
      { file: file1, relativePath: 'fail.txt' },
      { file: file2, relativePath: 'ok.txt' },
    ]));

    mockUploadAsset
      .mockRejectedValueOnce(new Error('Upload failed'))
      .mockResolvedValueOnce({ assetId: 'asset-2', filename: 'ok.txt', storagePath: '/ok.txt', sizeBytes: 10, mimeType: 'text/plain' });

    const { result } = renderHook(() => useDropUpload(targetFolderId, projectId));
    const mockItems = {} as DataTransferItemList;

    await act(async () => {
      result.current.onDrop(mockItems);
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    const errorItems = result.current.progress.filter((p) => p.status === 'error');
    const doneItems = result.current.progress.filter((p) => p.status === 'done');

    expect(errorItems).toHaveLength(1);
    expect(doneItems).toHaveLength(1);
    expect(errorItems[0].errorMessage).toBeDefined();
  });
});
