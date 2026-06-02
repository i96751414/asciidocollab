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

// We also need createFolder mock - it will be used via API call
jest.mock('@/lib/api/file-tree', () => ({
  createFolder: jest.fn(),
}));
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
