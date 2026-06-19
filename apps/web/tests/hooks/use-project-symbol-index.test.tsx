import { renderHook, waitFor, act } from '@testing-library/react';
import type { FileTreeEventDto } from '@asciidocollab/shared';
import { useProjectSymbolIndex } from '@/hooks/use-project-symbol-index';
import { getDocumentContent } from '@/lib/api/file-content';
import { fetchProjectFileTree } from '@/lib/api/file-tree';
import { useFileTreeEvents } from '@/hooks/use-file-tree-events';

jest.mock('@/lib/api/file-content', () => ({ getDocumentContent: jest.fn() }));
jest.mock('@/lib/api/file-tree', () => ({ fetchProjectFileTree: jest.fn() }));
// SSE subscription is irrelevant to these unit assertions.
jest.mock('@/hooks/use-file-tree-events', () => ({ useFileTreeEvents: jest.fn() }));

const mockGetContent = getDocumentContent as jest.MockedFunction<typeof getDocumentContent>;
const mockFetchTree = fetchProjectFileTree as jest.MockedFunction<typeof fetchProjectFileTree>;
const mockFileTreeEvents = useFileTreeEvents as jest.MockedFunction<typeof useFileTreeEvents>;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

/** A manually-resolvable promise, for driving async ordering in superseded-build races. */
function makeDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolveFunction) => {
    resolve = resolveFunction;
  });
  return { promise, resolve };
}

/** Grab the latest (stable) SSE handlers the hook registered with useFileTreeEvents. */
function latestSseHandlers(): {
  onEvent: (event: FileTreeEventDto) => void;
  onReconnect: () => void;
} {
  const calls = mockFileTreeEvents.mock.calls;
  const last = calls.at(-1)!;
  return { onEvent: last[1], onReconnect: last[2] };
}

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
  mockFileTreeEvents.mockClear();
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

  test('refresh() discards the cache and re-reads every reachable file (post-rename, no SSE)', async () => {
    const { result } = renderHook(() => useProjectSymbolIndex({ projectId: 'p1', rootFileId: 'main' }));
    await waitFor(() => expect(result.current.index).not.toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 300)); // let the debounced rebuild settle
    const before = mockGetContent.mock.calls.length;
    expect(before).toBeGreaterThan(0);

    // A symbol rename rewrote files server-side without a file-tree event; refresh() must re-fetch.
    result.current.refresh();
    await waitFor(() => expect(mockGetContent.mock.calls.length).toBeGreaterThan(before));
    const refetched = mockGetContent.mock.calls.slice(before).map((call) => call[1]);
    expect(refetched.toSorted()).toEqual(['a', 'b', 'main']); // full reachable set re-read
  });

  test('exposes the cached file contents (path→content) via getFiles', async () => {
    const { result } = renderHook(() =>
      useProjectSymbolIndex({ projectId: 'p1', rootFileId: 'main', openFileId: 'main', liveContent: 'include::a.adoc[]\n' }),
    );
    await waitFor(() => expect(result.current.index).not.toBeNull());
    const files = result.current.getFiles();
    expect(files['main.adoc']).toBe('include::a.adoc[]\n'); // open file served from the live overlay
    expect(files['a.adoc']).toBe(CONTENT.a);
  });

  test('tolerates a content fetch that rejects (caches null, still builds an index)', async () => {
    // b.adoc errors; the include walk must not throw and the index still resolves a.adoc's anchor.
    mockGetContent.mockImplementation((_projectId: string, fileId: string) =>
      fileId === 'b' ? Promise.reject(new Error('boom')) : Promise.resolve(CONTENT[fileId] ?? ''),
    );
    const { result } = renderHook(() => useProjectSymbolIndex({ projectId: 'p1', rootFileId: 'main' }));
    await waitFor(() => expect(result.current.index).not.toBeNull());
    expect(result.current.index!.resolveXref('anchor-a')).not.toBe('unresolved');
    // b failed to load, so its anchor is absent from the index.
    expect(result.current.index!.resolveXref('anchor-b')).toBe('unresolved');
  });

  test('still builds when the live overlay file is absent from the file-tree path map', async () => {
    // openFileId 'ghost' is not in TREE, so pathById has no entry → the getPath fallback returns null.
    const { result } = renderHook(() =>
      useProjectSymbolIndex({
        projectId: 'p1',
        rootFileId: 'ghost',
        openFileId: 'ghost',
        liveContent: 'include::a.adoc[]\n',
      }),
    );
    // The index still builds; ghost has no path entry, so the getPath fallback yields null.
    await waitFor(() => expect(result.current.index).not.toBeNull());
    expect(result.current.getIndex()).toBe(result.current.index);
  });

  test('exposes pathOf via the built index: maps a known id and returns null for an unknown one', async () => {
    const { result } = renderHook(() => useProjectSymbolIndex({ projectId: 'p1', rootFileId: 'main' }));
    await waitFor(() => expect(result.current.index).not.toBeNull());
    expect(result.current.index!.pathOf('main')).toBe('main.adoc'); // id present in the path map
    expect(result.current.index!.pathOf('ghost')).toBeNull(); // unknown id → null fallback
  });

  test('resolves includes pointing at files absent from the tree to nothing (no crash)', async () => {
    // main now includes a path the file tree has no id for; the path→id lookup falls back to null.
    mockGetContent.mockImplementation((_projectId: string, fileId: string) =>
      fileId === 'main' ? Promise.resolve('include::missing.adoc[]\n') : Promise.resolve(CONTENT[fileId] ?? ''),
    );
    const { result } = renderHook(() => useProjectSymbolIndex({ projectId: 'p1', rootFileId: 'main' }));
    await waitFor(() => expect(result.current.index).not.toBeNull());
    expect(result.current.index!.resolveXref('anchor-a')).toBe('unresolved'); // unresolved include ⇒ a.adoc absent
  });

  test('rebuilds and re-reads the affected file on a file-tree SSE event', async () => {
    const { result } = renderHook(() => useProjectSymbolIndex({ projectId: 'p1', rootFileId: 'main' }));
    await waitFor(() => expect(result.current.index).not.toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 300)); // let the debounced rebuild settle
    const before = mockGetContent.mock.calls.length;

    // An SSE event for 'a' invalidates that file's cache + the tree, triggering a rebuild.
    const { onEvent } = latestSseHandlers();
    act(() => {
      onEvent({ fileNodeId: 'a' } as never);
    });
    await waitFor(() => expect(mockGetContent.mock.calls.length).toBeGreaterThan(before));
    const refetched = mockGetContent.mock.calls.slice(before).map((call) => call[1]);
    expect(refetched).toContain('a'); // the invalidated file is re-read
  });

  test('clears the entire cache and rebuilds on an SSE reconnect', async () => {
    const { result } = renderHook(() => useProjectSymbolIndex({ projectId: 'p1', rootFileId: 'main' }));
    await waitFor(() => expect(result.current.index).not.toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 300)); // let the debounced rebuild settle
    const before = mockGetContent.mock.calls.length;

    // A reconnect drops the whole cache + tree and re-reads the full reachable set.
    const { onReconnect } = latestSseHandlers();
    act(() => {
      onReconnect();
    });
    await waitFor(() => expect(mockGetContent.mock.calls.length).toBeGreaterThan(before));
    const refetched = mockGetContent.mock.calls.slice(before).map((call) => call[1]);
    expect(refetched.toSorted()).toEqual(['a', 'b', 'main']); // full reachable set re-read
  });

  test('a build superseded while its tree fetch is in flight aborts without setting an index', async () => {
    const first = makeDeferred<typeof TREE>();
    const second = makeDeferred<typeof TREE>();
    mockFetchTree
      .mockReturnValueOnce(first.promise as never)
      .mockReturnValueOnce(second.promise as never);

    const { result } = renderHook(() => useProjectSymbolIndex({ projectId: 'p1', rootFileId: 'main' }));
    // Build #1 is parked awaiting the tree. refresh() starts build #2 (bumps the token).
    act(() => {
      result.current.refresh();
    });
    // Resolve build #2 first so it completes and produces the index.
    await act(async () => {
      second.resolve(TREE);
      await second.promise;
    });
    await waitFor(() => expect(result.current.index).not.toBeNull());
    const built = result.current.index;

    // Now let the stale build #1 resume: its token check fails, so it must not overwrite the index.
    await act(async () => {
      first.resolve(TREE);
      await first.promise;
    });
    expect(result.current.index).toBe(built); // unchanged by the superseded build
  });

  test('exposes the resolved cross-document attribute scope for the open file (US6/T034)', async () => {
    // main.adoc defines :productName: before including child.adoc, which references {productName}.
    // The open file is the child; its resolved scope must inherit productName from the parent.
    const tree = {
      ...TREE,
      children: [
        { id: 'main', name: 'main.adoc', type: 'file', path: 'main.adoc', parentId: 'root', children: [] },
        { id: 'child', name: 'child.adoc', type: 'file', path: 'child.adoc', parentId: 'root', children: [] },
      ],
    };
    mockFetchTree.mockResolvedValue(tree as never);
    const content: Record<string, string> = {
      main: ':productName: Acme\ninclude::child.adoc[]\n',
      child: ':edition: Pro\nSee {productName} {edition}.\n',
    };
    mockGetContent.mockImplementation((_projectId: string, fileId: string) =>
      Promise.resolve(content[fileId] ?? ''),
    );

    const { result } = renderHook(() =>
      useProjectSymbolIndex({
        projectId: 'p1',
        rootFileId: 'main',
        openFileId: 'child',
        liveContent: content.child, // the open file is served from the live overlay (as in the app)
      }),
    );
    await waitFor(() => expect(result.current.index).not.toBeNull());

    const scope = result.current.resolvedScopeOf('child');
    expect(scope.get('productname')).toBe('Acme'); // inherited from the parent
    expect(scope.get('edition')).toBe('Pro'); // the child's own definition
    expect(scope.has('mystery')).toBe(false);

    // Repeated calls for the same file return the SAME Map identity (memoised per index build), so the
    // editor's `[resolvedScope]` effect does not re-fire on every render. effectiveAttributes() itself
    // builds a fresh Map each call, so without memoisation these identities would differ.
    expect(result.current.resolvedScopeOf('child')).toBe(scope);
  });

  test('resolvedScopeOf returns an empty map before the index has built', () => {
    const { result } = renderHook(() => useProjectSymbolIndex({ projectId: 'p1', rootFileId: null }));
    expect(result.current.resolvedScopeOf('anything').size).toBe(0);
  });

  test('a build superseded while content fetches are in flight aborts without setting an index', async () => {
    const firstContent = makeDeferred<string>();
    let resumedSecond = false;
    mockGetContent.mockImplementation((_projectId: string, fileId: string) => {
      // The very first content fetch is parked; everything afterwards resolves normally.
      if (!resumedSecond) {
        resumedSecond = true;
        return firstContent.promise;
      }
      return Promise.resolve(CONTENT[fileId] ?? '');
    });

    const { result } = renderHook(() => useProjectSymbolIndex({ projectId: 'p1', rootFileId: 'main' }));
    // Build #1's tree resolves (default mock), then it parks on the first content fetch.
    await waitFor(() => expect(mockGetContent).toHaveBeenCalled());
    // refresh() supersedes build #1 mid-fetch (bumps the token) and runs build #2 to completion.
    act(() => {
      result.current.refresh();
    });
    await waitFor(() => expect(result.current.index).not.toBeNull());
    const built = result.current.index;

    // Resume the stale content fetch; the post-batch token check must abort build #1.
    await act(async () => {
      firstContent.resolve(CONTENT.main);
      await firstContent.promise;
    });
    expect(result.current.index).toBe(built); // superseded build left the index untouched
  });
});
