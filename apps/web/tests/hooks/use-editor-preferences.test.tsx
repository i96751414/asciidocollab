import { renderHook, act, waitFor } from '@testing-library/react';
import { useEditorPreferences } from '@/hooks/use-editor-preferences';

const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

const mockLocalStorage = {
  store: {} as Record<string, string>,
  getItem: jest.fn((key: string) => mockLocalStorage.store[key] ?? null),
  setItem: jest.fn((key: string, value: string) => { mockLocalStorage.store[key] = value; }),
  removeItem: jest.fn((key: string) => { delete mockLocalStorage.store[key]; }),
  clear: jest.fn(() => { mockLocalStorage.store = {}; }),
};
Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true });

const LS_KEY = 'asciidocollab:editor-preferences';

beforeEach(() => {
  jest.useFakeTimers();
  mockFetch.mockReset();
  mockLocalStorage.clear();
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ fontSize: 14, theme: 'default' }),
  });
});

afterEach(() => {
  jest.useRealTimers();
});

test('uses default prefs when localStorage is empty', () => {
  // No data set in localStorage
  const { result } = renderHook(() => useEditorPreferences());
  expect(result.current.fontSize).toBe(14);
  expect(result.current.theme).toBe('default');
});

test('uses default prefs when localStorage contains invalid JSON', () => {
  mockLocalStorage.store['asciidocollab:editor-preferences'] = 'not-json!!!';
  const { result } = renderHook(() => useEditorPreferences());
  expect(result.current.fontSize).toBe(14);
});

test('uses default prefs when localStorage contains non-object value', () => {
  mockLocalStorage.store['asciidocollab:editor-preferences'] = JSON.stringify([1, 2, 3]);
  const { result } = renderHook(() => useEditorPreferences());
  expect(result.current.fontSize).toBe(14);
});

test('falls back to default fontSize when stored value has wrong type', () => {
  mockLocalStorage.store['asciidocollab:editor-preferences'] = JSON.stringify({ fontSize: 'big', theme: 'default' });
  const { result } = renderHook(() => useEditorPreferences());
  expect(result.current.fontSize).toBe(14);
});

test('falls back to default theme when stored theme is invalid', () => {
  mockLocalStorage.store['asciidocollab:editor-preferences'] = JSON.stringify({ fontSize: 18, theme: 'not-a-theme' });
  const { result } = renderHook(() => useEditorPreferences());
  expect(result.current.theme).toBe('default');
  expect(result.current.fontSize).toBe(18); // valid fontSize still used
});

test('applies localStorage value immediately on mount before API response', () => {
  mockLocalStorage.store[LS_KEY] = JSON.stringify({ fontSize: 20, theme: 'high-contrast' });

  const { result } = renderHook(() => useEditorPreferences());
  // Immediately (before async API): localStorage value applied
  expect(result.current.fontSize).toBe(20);
  expect(result.current.theme).toBe('high-contrast');
});

test('overwrites with API response when received', async () => {
  mockLocalStorage.store[LS_KEY] = JSON.stringify({ fontSize: 20, theme: 'high-contrast' });
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ fontSize: 14, theme: 'default' }),
  });

  const { result } = renderHook(() => useEditorPreferences());

  // Wait until state converges to API-authoritative values
  await waitFor(() => {
    expect(result.current.fontSize).toBe(14);
    expect(result.current.theme).toBe('default');
  });
});

test('PUT is debounced 500ms after a preference change', async () => {
  const { result } = renderHook(() => useEditorPreferences());

  act(() => result.current.setFontSize(18));
  expect(mockFetch).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: 'PUT' }));

  await act(async () => {
    jest.advanceTimersByTime(500);
    await Promise.resolve();
  });

  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining('/auth/me/editor-preferences'),
    expect.objectContaining({ method: 'PUT' }),
  );
});

// Issue C7: rapid preference changes must coalesce into ONE PUT, not fire many
test('rapid setFontSize calls coalesce into a single debounced PUT', async () => {
  const { result } = renderHook(() => useEditorPreferences());

  // Fire many rapid changes (simulating slider drag)
  act(() => {
    result.current.setFontSize(10);
    result.current.setFontSize(12);
    result.current.setFontSize(14);
    result.current.setFontSize(16);
  });

  await act(async () => {
    jest.advanceTimersByTime(500);
    await Promise.resolve();
  });

  // Only ONE PUT must have been sent, not four
  const putCalls = mockFetch.mock.calls.filter(
    ([, options]: [unknown, { method?: string }]) => options?.method === 'PUT',
  );
  expect(putCalls).toHaveLength(1);
  // And it must carry the final value
  expect(putCalls[0][1].body).toContain('"fontSize":16');
});

test('localStorage is updated immediately on change before PUT completes', () => {
  const { result } = renderHook(() => useEditorPreferences());
  act(() => result.current.setFontSize(22));
  expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
    LS_KEY,
    expect.stringContaining('"fontSize":22'),
  );
});

test('setTheme updates local state and persists to localStorage', async () => {
  const { result } = renderHook(() => useEditorPreferences());

  act(() => result.current.setTheme('dracula'));

  expect(result.current.theme).toBe('dracula');
  expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
    LS_KEY,
    expect.stringContaining('"theme":"dracula"'),
  );
});
