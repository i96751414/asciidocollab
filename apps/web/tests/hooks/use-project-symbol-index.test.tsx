import { renderHook, waitFor } from '@testing-library/react';
import { useProjectSymbolIndex } from '@/hooks/use-project-symbol-index';
import { getDocumentContent } from '@/lib/api/file-content';
import { fetchProjectFileTree } from '@/lib/api/file-tree';

jest.mock('@/lib/api/file-content', () => ({ getDocumentContent: jest.fn() }));
jest.mock('@/lib/api/file-tree', () => ({ fetchProjectFileTree: jest.fn() }));
// SSE subscription is irrelevant to these unit assertions.
jest.mock('@/hooks/use-file-tree-events', () => ({ useFileTreeEvents: jest.fn() }));

const mockGetContent = getDocumentContent as jest.MockedFunction<typeof getDocumentContent>;
const mockFetchTree = fetchProjectFileTree as jest.MockedFunction<typeof fetchProjectFileTree>;

// Tree: main.adoc → a.adoc + b.adoc; b.adoc → a.adoc (cycle/dup); c.adoc is unreachable.
const TREE = {
  id: 'root',
  name: '',
  type: 'folder',
  path: '',
  parentId: null,
  children: [
    { id: 'main', name: 'main.adoc', type: 'file', path: 'main.adoc', parentId: 'root', children: [] },
    { id: 'a', name: 'a.adoc', type: 'file', path: 'a.adoc', parentId: 'root', children: [] },
    { id: 'b', name: 'b.adoc', type: 'file', path: 'b.adoc', parentId: 'root', children: [] },
    { id: 'c', name: 'c.adoc', type: 'file', path: 'c.adoc', parentId: 'root', children: [] },
  ],
};

const CONTENT: Record<string, string> = {
  main: 'include::a.adoc[]\ninclude::b.adoc[]\n',
  a: '[[anchor-a]]\n== Section A\n',
  b: 'include::a.adoc[]\n[[anchor-b]]\n',
  c: 'unreachable\n',
};

beforeEach(() => {
  mockGetContent.mockReset();
  mockFetchTree.mockReset();
  mockFetchTree.mockResolvedValue(TREE as never);
  mockGetContent.mockImplementation((_projectId: string, fileId: string) =>
    Promise.resolve(CONTENT[fileId] ?? ''),
  );
});

describe('useProjectSymbolIndex', () => {
  test('builds a cross-file index that resolves an anchor defined in an included file', async () => {
    const { result } = renderHook(() => useProjectSymbolIndex({ projectId: 'p1', rootFileId: 'main' }));
    await waitFor(() => expect(result.current.index).not.toBeNull());
    expect(result.current.index!.resolveXref('anchor-a')).not.toBe('unresolved');
    expect(result.current.index!.resolveXref('anchor-b')).not.toBe('unresolved');
    expect(result.current.index!.resolveXref('nope')).toBe('unresolved');
  });

  test('fetches every reachable file exactly once and never the unreachable one (FR-073/SC-025)', async () => {
    const { result } = renderHook(() => useProjectSymbolIndex({ projectId: 'p1', rootFileId: 'main' }));
    await waitFor(() => expect(result.current.index).not.toBeNull());
    // Give the debounced live-rebuild a chance to (wrongly) refetch.
    await new Promise((resolve) => setTimeout(resolve, 300));

    const fetchedIds = mockGetContent.mock.calls.map((call) => call[1]);
    expect(fetchedIds.toSorted()).toEqual(['a', 'b', 'main']); // bounded to reachable files
    expect(fetchedIds).not.toContain('c'); // unreachable file never read
    // Each reachable file read at most once (deduped against the cache).
    expect(new Set(fetchedIds).size).toBe(fetchedIds.length);
  });

  test('uses the open file live overlay instead of fetching it', async () => {
    const { result } = renderHook(() =>
      useProjectSymbolIndex({
        projectId: 'p1',
        rootFileId: 'main',
        openFileId: 'main',
        liveContent: 'include::a.adoc[]\n',
      }),
    );
    await waitFor(() => expect(result.current.index).not.toBeNull());
    const fetchedIds = mockGetContent.mock.calls.map((call) => call[1]);
    expect(fetchedIds).not.toContain('main'); // root is the open file → served from the overlay
    expect(fetchedIds.toSorted()).toEqual(['a']); // only the included file is fetched
  });

  test('returns a null index when no root is configured (current-file-only fallback)', async () => {
    const { result } = renderHook(() => useProjectSymbolIndex({ projectId: 'p1', rootFileId: null }));
    await waitFor(() => expect(mockFetchTree).not.toHaveBeenCalled());
    expect(result.current.index).toBeNull();
    expect(mockGetContent).not.toHaveBeenCalled();
  });
});
