import { renderHook, act } from '@testing-library/react';
import { useFileSelection } from '@/hooks/use-file-selection';

const API_BASE = 'http://localhost:4000';

function makeFetchResponse(body: string, contentType: string, ok = true): Response {
  return {
    ok,
    headers: new Headers({ 'Content-Type': contentType }),
    text: () => Promise.resolve(body),
    json: () => Promise.resolve({}),
  } as unknown as Response;
}

describe('useFileSelection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // T014 (a): selectFile triggers fetch to correct URL
  it('selectFile fetches content from correct URL', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      makeFetchResponse('hello', 'text/plain'),
    );
    globalThis.fetch = fetchMock;

    const { result } = renderHook(() => useFileSelection('p1'));

    await act(async () => {
      await result.current.selectFile('n1', 'doc.adoc', '/doc.adoc', 'file');
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/projects/p1/files/n1/content`,
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  // T014 (b): text/plain response sets content and isLoading=false
  it('text/plain response sets contentState.content and isLoading=false', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      makeFetchResponse('Hello World', 'text/plain'),
    );

    const { result } = renderHook(() => useFileSelection('p1'));

    await act(async () => {
      await result.current.selectFile('n1', 'doc.adoc', '/doc.adoc', 'file');
    });

    expect(result.current.contentState.content).toBe('Hello World');
    expect(result.current.contentState.isLoading).toBe(false);
    expect(result.current.contentState.error).toBeNull();
    expect(result.current.contentState.isBinary).toBe(false);
  });

  // T014 (c): image/png response sets isBinary=true, content=null
  it('image/png response sets isBinary=true and content=null', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      makeFetchResponse('', 'image/png'),
    );

    const { result } = renderHook(() => useFileSelection('p1'));

    await act(async () => {
      await result.current.selectFile('n1', 'image.png', '/image.png', 'file');
    });

    expect(result.current.contentState.isBinary).toBe(true);
    expect(result.current.contentState.content).toBeNull();
    expect(result.current.contentState.isLoading).toBe(false);
  });

  // T014 (d): network error sets contentState.error
  it('network error sets contentState.error', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('Network failure'));

    const { result } = renderHook(() => useFileSelection('p1'));

    await act(async () => {
      await result.current.selectFile('n1', 'doc.adoc', '/doc.adoc', 'file');
    });

    expect(result.current.contentState.error).toBe('Network failure');
    expect(result.current.contentState.content).toBeNull();
    expect(result.current.contentState.isLoading).toBe(false);
  });

  // T014 (e): calling selectFile twice aborts the first fetch
  it('calling selectFile twice aborts the first fetch via AbortController', async () => {
    let firstSignalAborted = false;
    let resolveFirst!: () => void;
    const firstFetchDone = new Promise<void>((resolve) => { resolveFirst = resolve; });

    globalThis.fetch = jest
      .fn()
      .mockImplementationOnce((_url: string, { signal }: RequestInit) => {
        signal?.addEventListener('abort', () => { firstSignalAborted = true; });
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => { reject(new DOMException('Aborted', 'AbortError')); });
          firstFetchDone.then(() => _resolve(makeFetchResponse('first', 'text/plain')));
        });
      })
      .mockImplementationOnce(() => Promise.resolve(makeFetchResponse('second', 'text/plain')));

    const { result } = renderHook(() => useFileSelection('p1'));

    act(() => { result.current.selectFile('n1', 'doc.adoc', '/doc.adoc', 'file'); });
    await act(async () => {
      await result.current.selectFile('n2', 'other.adoc', '/other.adoc', 'file');
    });

    expect(firstSignalAborted).toBe(true);
    resolveFirst();
  });

  // C3: unmounting while a fetch is in-flight must abort the request so setState is never called
  it('aborts any in-flight fetch when the hook is unmounted', async () => {
    let capturedSignal: AbortSignal | undefined;
    globalThis.fetch = jest.fn().mockImplementation((_url: string, { signal }: RequestInit) => {
      capturedSignal = signal;
      return new Promise(() => {}); // never resolves
    });

    const { result, unmount } = renderHook(() => useFileSelection('p1'));
    act(() => { result.current.selectFile('n1', 'doc.adoc', '/doc.adoc', 'file'); });

    expect(capturedSignal?.aborted).toBe(false);
    unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });

  // C2: clicking a folder must NOT trigger a fetch — nodeType 'folder' sets selection but skips loading
  it('selectFile with nodeType=folder sets selectedFile but does not fetch content', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock;

    const { result } = renderHook(() => useFileSelection('p1'));

    await act(async () => {
      await result.current.selectFile('folder-1', 'src', '/src', 'folder');
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.selectedFile).toMatchObject({ nodeId: 'folder-1', nodeType: 'folder' });
    expect(result.current.contentState.isLoading).toBe(false);
    expect(result.current.contentState.content).toBeNull();
  });

  // T014 (f): clearSelection resets state
  it('clearSelection resets selectedFile and contentState', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      makeFetchResponse('content', 'text/plain'),
    );

    const { result } = renderHook(() => useFileSelection('p1'));

    await act(async () => {
      await result.current.selectFile('n1', 'doc.adoc', '/doc.adoc', 'file');
    });

    expect(result.current.selectedFile).not.toBeNull();

    act(() => { result.current.clearSelection(); });

    expect(result.current.selectedFile).toBeNull();
    expect(result.current.contentState.content).toBeNull();
    expect(result.current.contentState.isLoading).toBe(false);
    expect(result.current.contentState.error).toBeNull();
    expect(result.current.contentState.isBinary).toBe(false);
  });
});

// Issue 3: use-file-selection must not define its own API_BASE — it must use
// fileContentUrl from lib/api/file-content so the content URL stays in sync.
describe('use-file-selection URL must match fileContentUrl', () => {
  test('use-file-selection.ts does not define its own NEXT_PUBLIC_API_URL constant', () => {
    const fs = require('node:fs');
    const source: string = fs.readFileSync(
      require.resolve('@/hooks/use-file-selection'),
      'utf8',
    );
    expect(source).not.toContain('process.env.NEXT_PUBLIC_API_URL');
    expect(source).toContain('fileContentUrl');
  });
});
