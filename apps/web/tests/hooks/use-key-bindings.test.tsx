import { renderHook, act, waitFor } from '@testing-library/react';
import { useKeyBindings } from '@/hooks/use-key-bindings';

const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
});

test('fetch uses credentials: include', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve([{ action: 'ns:act', keyCombo: 'A' }]),
  });
  renderHook(() => useKeyBindings('editor'));
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  const [, options] = mockFetch.mock.calls[0] as [unknown, RequestInit];
  expect(options.credentials).toBe('include');
});

test('fetch credentials value is exactly "include" (not empty string)', async () => {
  renderHook(() => useKeyBindings('editor'));
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  const [, options] = mockFetch.mock.calls[0] as [unknown, RequestInit];
  expect(options.credentials).not.toBe('');
  expect(options.credentials).toBe('include');
});

test('re-fetches when namespace changes (useEffect re-runs)', async () => {
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
  const { rerender } = renderHook(
    ({ ns }: { ns: string }) => useKeyBindings(ns),
    { initialProps: { ns: 'editor' } },
  );

  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
  mockFetch.mockClear();

  // Change namespace — should trigger a re-fetch
  act(() => rerender({ ns: 'file-tree' }));
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

  const url = String(mockFetch.mock.calls[0][0]);
  expect(url).toContain('file-tree');
});

test('fetch URL contains namespace query parameter', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve([{ action: 'editor:save', keyCombo: 'Ctrl+S' }]),
  });
  renderHook(() => useKeyBindings('editor'));
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  const url = String(mockFetch.mock.calls[0][0]);
  expect(url).toContain('namespace=editor');
});

test('fetch URL contains the API base http://localhost:4000', async () => {
  renderHook(() => useKeyBindings('editor'));
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  const url = String(mockFetch.mock.calls[0][0]);
  expect(url).toContain('http://localhost:4000');
});

test('returns Map with correct action→keyCombo entries', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve([{ action: 'editor:save', keyCombo: 'Ctrl+S' }]),
  });
  const { result } = renderHook(() => useKeyBindings('editor'));
  await waitFor(() => expect(result.current.size).toBeGreaterThan(0));
  expect(result.current.get('editor:save')).toBe('Ctrl+S');
});

test('returns empty Map when response is not ok', async () => {
  mockFetch.mockResolvedValueOnce({ ok: false, json: () => Promise.resolve([]) });
  const { result } = renderHook(() => useKeyBindings('editor'));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(result.current.size).toBe(0);
});
