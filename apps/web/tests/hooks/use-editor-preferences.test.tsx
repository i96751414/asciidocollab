import { renderHook, act, waitFor } from '@testing-library/react';
import { useEditorPreferences, isEditorThemeValue, isPreviewStyleValue } from '@/hooks/use-editor-preferences';

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

test('fetches prefs from correct URL including http://localhost:4000', async () => {
  const { result } = renderHook(() => useEditorPreferences());
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  const url = String(mockFetch.mock.calls[0][0]);
  expect(url).toContain('http://localhost:4000');
  expect(url).toContain('/auth/me/editor-preferences');
  void result;
});

test('PUT is sent to correct URL including http://localhost:4000', async () => {
  const { result } = renderHook(() => useEditorPreferences());

  act(() => result.current.setFontSize(20));

  await act(async () => {
    jest.advanceTimersByTime(500);
    await Promise.resolve();
  });

  const putCall = mockFetch.mock.calls.find(
    ([, options]: [unknown, { method?: string }]) => options?.method === 'PUT',
  );
  expect(putCall).toBeDefined();
  expect(String(putCall[0])).toContain('http://localhost:4000');
  expect(String(putCall[0])).toContain('/auth/me/editor-preferences');
});

test('PUT sends credentials include and Content-Type application/json', async () => {
  const { result } = renderHook(() => useEditorPreferences());

  act(() => result.current.setFontSize(20));

  await act(async () => {
    jest.advanceTimersByTime(500);
    await Promise.resolve();
  });

  const putCall = mockFetch.mock.calls.find(
    ([, options]: [unknown, { method?: string }]) => options?.method === 'PUT',
  );
  expect(putCall[1].credentials).toBe('include');
  expect(putCall[1].headers['Content-Type']).toBe('application/json');
});

test('falls back to localStorage prefs when GET returns non-ok', async () => {
  mockLocalStorage.store[LS_KEY] = JSON.stringify({ fontSize: 22, theme: 'dracula' });
  mockFetch.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });

  const { result } = renderHook(() => useEditorPreferences());

  // Should keep localStorage values on API error
  await act(async () => { await Promise.resolve(); });
  expect(result.current.fontSize).toBe(22);
  expect(result.current.theme).toBe('dracula');
});

// ── L74: non-ok GET must NOT overwrite state (response.ok=false → reject → catch → no update) ──

test('GET returning non-ok does NOT update fontSize from API response (localStorage value preserved)', async () => {
  // Store different prefs than the API would return so we can detect if API was applied
  mockLocalStorage.store[LS_KEY] = JSON.stringify({ fontSize: 22, theme: 'dracula' });
  // API returns ok=false but with json body that has different values — should be rejected
  mockFetch.mockResolvedValue({
    ok: false,
    json: () => Promise.resolve({ fontSize: 11, theme: 'default' }),
  });

  const { result } = renderHook(() => useEditorPreferences());

  // Flush 3 microtask levels: fetch → .then(ok?) → .then(setState) / .catch()
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  // With L74 mutation (always ok → json called → prefs set to {11, default}),
  // fontSize would become 11. Original code rejects and keeps 22.
  expect(result.current.fontSize).toBe(22);
  expect(result.current.theme).toBe('dracula');
});

test('isStoredPrefs returns false for null (not an object in the sense of the guard)', async () => {
  mockLocalStorage.store[LS_KEY] = JSON.stringify(null);
  const { result } = renderHook(() => useEditorPreferences());
  // null is filtered, so defaults are used
  expect(result.current.fontSize).toBe(14);
});

test('isStoredPrefs returns false for a primitive number', async () => {
  mockLocalStorage.store[LS_KEY] = JSON.stringify(42);
  const { result } = renderHook(() => useEditorPreferences());
  expect(result.current.fontSize).toBe(14);
});

// ── isEditorThemeValue: validates all valid theme strings (kills L7, L10, L11) ──

test('isEditorThemeValue returns true for all valid themes', () => {
  expect(isEditorThemeValue('default')).toBe(true);
  expect(isEditorThemeValue('high-contrast')).toBe(true);
  expect(isEditorThemeValue('dracula')).toBe(true);
  expect(isEditorThemeValue('tomorrow')).toBe(true);
  expect(isEditorThemeValue('espresso')).toBe(true);
});

test('isEditorThemeValue returns false for an unknown theme', () => {
  expect(isEditorThemeValue('unknown-theme')).toBe(false);
  expect(isEditorThemeValue('')).toBe(false);
});

// ── GET fetch includes credentials (kills L67 ObjectLiteral) ────────────────────

test('GET fetch for prefs includes credentials: include', async () => {
  const { result } = renderHook(() => useEditorPreferences());
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  const getCall = mockFetch.mock.calls[0];
  expect(getCall[1]).toMatchObject({ credentials: 'include' });
  void result;
});

// ── GET fetch URL must contain the auth path (kills L67 StringLiteral) ──────────

test('GET fetch URL contains /auth/me/editor-preferences', async () => {
  const { result } = renderHook(() => useEditorPreferences());
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  const url = String(mockFetch.mock.calls[0][0]);
  expect(url).toContain('/auth/me/editor-preferences');
  void result;
});

test('theme falls back to default when stored theme string is not a recognized theme value', () => {
  mockLocalStorage.store[LS_KEY] = JSON.stringify({ fontSize: 14, theme: 'INVALID-THEME' });
  // Use a never-resolving fetch so the API response never overwrites the localStorage-derived state
  mockFetch.mockReturnValue(new Promise(() => {}));
  const { result } = renderHook(() => useEditorPreferences());
  expect(result.current.theme).toBe('default');
});

// ── softWrap ──────────────────────────────────────────────────────────────────

test('softWrap defaults to true', () => {
  const { result } = renderHook(() => useEditorPreferences());
  expect(result.current.softWrap).toBe(true);
});

test('softWrap included in initial GET response', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ fontSize: 14, theme: 'default', softWrap: false }),
  });
  const { result } = renderHook(() => useEditorPreferences());
  await waitFor(() => expect(result.current.softWrap).toBe(false));
});

test('setSoftWrap updates state and includes softWrap in PUT payload', async () => {
  const { result } = renderHook(() => useEditorPreferences());
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
  await act(async () => {
    result.current.setSoftWrap(false);
    jest.advanceTimersByTime(600);
  });
  await waitFor(() => expect(result.current.softWrap).toBe(false));
  const putCall = mockFetch.mock.calls.find((c: unknown[]) => {
    const options = c[1] as { method?: string };
    return options?.method === 'PUT';
  });
  expect(putCall).toBeDefined();
  if (putCall) {
    const body = JSON.parse((putCall[1] as { body: string }).body);
    expect(body).toHaveProperty('softWrap', false);
  }
});

test('localStorage cache updated when softWrap changes', async () => {
  const { result } = renderHook(() => useEditorPreferences());
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
  await act(async () => {
    result.current.setSoftWrap(false);
  });
  const stored = JSON.parse(mockLocalStorage.store[LS_KEY] ?? '{}');
  expect(stored.softWrap).toBe(false);
});

test('loads valid scrollSync, softWrap, and theme from localStorage', () => {
  // Never-resolving fetch so the server response cannot overwrite localStorage state.
  mockFetch.mockReturnValue(new Promise(() => {}));
  mockLocalStorage.store[LS_KEY] = JSON.stringify({
    fontSize: 16, theme: 'default', scrollSyncEnabled: false, softWrap: false,
  });
  const { result } = renderHook(() => useEditorPreferences());
  expect(result.current.fontSize).toBe(16);
  expect(result.current.theme).toBe('default');
  expect(result.current.scrollSyncEnabled).toBe(false);
  expect(result.current.softWrap).toBe(false);
});

test('ignores server response fields with the wrong types and keeps previous values', async () => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ fontSize: 'big', theme: 123, scrollSyncEnabled: 'yes', softWrap: 'no' }),
  });
  const { result } = renderHook(() => useEditorPreferences());
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  // All invalid → falls back to the defaults that were already in state.
  expect(result.current.fontSize).toBe(14);
  expect(result.current.theme).toBe('default');
  expect(typeof result.current.scrollSyncEnabled).toBe('boolean');
  expect(typeof result.current.softWrap).toBe('boolean');
});

// ── previewStyle (US1 + US2) ────────────────────────────────────────────────────

test('previewStyle defaults to asciidocollab', () => {
  const { result } = renderHook(() => useEditorPreferences());
  expect(result.current.previewStyle).toBe('asciidocollab');
});

test('previewStyle is seeded from localStorage before the API responds (no flash)', () => {
  // Never-resolving fetch so the API cannot overwrite the localStorage-seeded value.
  mockFetch.mockReturnValue(new Promise(() => {}));
  mockLocalStorage.store[LS_KEY] = JSON.stringify({ fontSize: 14, theme: 'default', previewStyle: 'asciidoctor' });
  const { result } = renderHook(() => useEditorPreferences());
  expect(result.current.previewStyle).toBe('asciidoctor');
});

test('an invalid stored previewStyle falls back to the default', () => {
  mockFetch.mockReturnValue(new Promise(() => {}));
  mockLocalStorage.store[LS_KEY] = JSON.stringify({ fontSize: 14, theme: 'default', previewStyle: 'Asciidocollab' });
  const { result } = renderHook(() => useEditorPreferences());
  expect(result.current.previewStyle).toBe('asciidocollab');
});

test('previewStyle included in initial GET response', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ fontSize: 14, theme: 'default', previewStyle: 'asciidoctor' }),
  });
  const { result } = renderHook(() => useEditorPreferences());
  await waitFor(() => expect(result.current.previewStyle).toBe('asciidoctor'));
});

test('setPreviewStyle updates state and includes previewStyle in the PUT payload', async () => {
  const { result } = renderHook(() => useEditorPreferences());
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
  await act(async () => {
    result.current.setPreviewStyle('asciidoctor');
    jest.advanceTimersByTime(600);
  });
  await waitFor(() => expect(result.current.previewStyle).toBe('asciidoctor'));
  const putCall = mockFetch.mock.calls.find((c: unknown[]) => (c[1] as { method?: string })?.method === 'PUT');
  expect(putCall).toBeDefined();
  if (putCall) {
    const body = JSON.parse((putCall[1] as { body: string }).body);
    expect(body).toHaveProperty('previewStyle', 'asciidoctor');
  }
});

test('localStorage cache updated when previewStyle changes', async () => {
  const { result } = renderHook(() => useEditorPreferences());
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
  await act(async () => {
    result.current.setPreviewStyle('asciidoctor');
  });
  const stored = JSON.parse(mockLocalStorage.store[LS_KEY] ?? '{}');
  expect(stored.previewStyle).toBe('asciidoctor');
});

// T040 — offline reconciliation: a transient save failure must not lose the choice; it
// applies for the session and rides the next successful save to the account.
test('previewStyle applies for the session and reconciles on the next successful save when a save fails', async () => {
  const { result } = renderHook(() => useEditorPreferences());
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());

  // First save fails transiently (offline).
  mockFetch.mockRejectedValueOnce(new Error('network down'));
  await act(async () => {
    result.current.setPreviewStyle('asciidoctor');
    jest.advanceTimersByTime(600);
    await Promise.resolve();
  });
  // Still applied locally for the current session.
  expect(result.current.previewStyle).toBe('asciidoctor');
  expect(JSON.parse(mockLocalStorage.store[LS_KEY] ?? '{}').previewStyle).toBe('asciidoctor');

  // A later change triggers a successful save that still carries the chosen style.
  mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
  await act(async () => {
    result.current.setFontSize(16);
    jest.advanceTimersByTime(600);
    await Promise.resolve();
  });
  const putCalls = mockFetch.mock.calls.filter((c: unknown[]) => (c[1] as { method?: string })?.method === 'PUT');
  const lastPut = putCalls.at(-1);
  expect(lastPut).toBeDefined();
  if (lastPut) {
    expect(JSON.parse((lastPut[1] as { body: string }).body)).toHaveProperty('previewStyle', 'asciidoctor');
  }
});

test('isPreviewStyleValue validates the supported tokens', () => {
  expect(isPreviewStyleValue('asciidocollab')).toBe(true);
  expect(isPreviewStyleValue('asciidoctor')).toBe(true);
  expect(isPreviewStyleValue('Asciidocollab')).toBe(false);
  expect(isPreviewStyleValue('')).toBe(false);
});
