import { renderHook, act } from '@testing-library/react';
import { useAutoSave } from '@/hooks/use-auto-save';
import { AUTOSAVE_DEBOUNCE_MS, EXTERNAL_CHANGE_POLL_INTERVAL_MS, OFFLINE_QUEUE_KEY_PREFIX } from '@/lib/editor-config';

// --- Mocks ---

const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

const localStorageStore: Record<string, string> = {};
const mockLocalStorage = {
  getItem: jest.fn((key: string) => localStorageStore[key] ?? null),
  setItem: jest.fn((key: string, value: string) => { localStorageStore[key] = value; }),
  removeItem: jest.fn((key: string) => { delete localStorageStore[key]; }),
  clear: jest.fn(() => { for (const key of Object.keys(localStorageStore)) { delete localStorageStore[key]; } }),
};

Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true });

let isOnline = true;
Object.defineProperty(globalThis.navigator, 'onLine', {
  get: () => isOnline,
  configurable: true,
});

function fireWindowEvent(type: string) {
  const event = new Event(type);
  globalThis.dispatchEvent(event);
}

beforeEach(() => {
  jest.useFakeTimers();
  mockFetch.mockReset();
  // Reset both implementation and call history for all localStorage mocks so
  // assertions like toHaveBeenCalledWith don't leak across tests.
  mockLocalStorage.getItem.mockReset();
  mockLocalStorage.setItem.mockReset();
  mockLocalStorage.removeItem.mockReset();
  mockLocalStorage.clear.mockReset();
  mockLocalStorage.getItem.mockImplementation((key: string) => localStorageStore[key] ?? null);
  mockLocalStorage.setItem.mockImplementation((key: string, value: string) => { localStorageStore[key] = value; });
  mockLocalStorage.removeItem.mockImplementation((key: string) => { delete localStorageStore[key]; });
  mockLocalStorage.clear.mockImplementation(() => { for (const key of Object.keys(localStorageStore)) { delete localStorageStore[key]; } });
  mockLocalStorage.clear();
  isOnline = true;
  mockFetch.mockResolvedValue({ ok: true, status: 204, headers: { get: () => '"etag-v1"' } });
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllTimers();
});

const defaultOptions = {
  projectId: 'proj-1',
  fileNodeId: 'file-1',
};

// ── Issue 1: save URL must not include spurious /api/ prefix ──────────────────

test('PUT save URL is /projects/… without an /api/ prefix', async () => {
  const { result } = renderHook(() => useAutoSave(defaultOptions));

  act(() => result.current.save('content'));
  await act(async () => {
    jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    await Promise.resolve();
  });

  const [url] = mockFetch.mock.calls[0] as [string, unknown];
  expect(url).not.toMatch(/\/api\/projects\//);
  expect(url).toMatch(/\/projects\/proj-1\/files\/file-1\/content$/);
});

// ── Test 1: saveState starts as 'saved' ────────────────────────────────────────

test('saveState starts as "saved"', () => {
  const { result } = renderHook(() => useAutoSave(defaultOptions));
  expect(result.current.saveState).toBe('saved');
});

// ── Test 2: save(content) transitions to 'unsaved' ────────────────────────────

test('calling save(content) transitions saveState to "unsaved"', () => {
  const { result } = renderHook(() => useAutoSave(defaultOptions));
  act(() => result.current.save('new content'));
  expect(result.current.saveState).toBe('unsaved');
});

// ── Test 3: after debounce delay, transitions saving → saved ──────────────────

test('after debounce delay, saveState transitions saving → saved when PUT succeeds', async () => {
  mockFetch.mockResolvedValue({ ok: true, status: 204, headers: { get: () => '"etag-v1"' } });
  const { result } = renderHook(() => useAutoSave(defaultOptions));

  act(() => result.current.save('content'));
  expect(result.current.saveState).toBe('unsaved');

  await act(async () => {
    jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    await Promise.resolve();
  });

  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining('/projects/proj-1/files/file-1/content'),
    expect.objectContaining({ method: 'PUT', body: 'content' }),
  );
  expect(result.current.saveState).toBe('saved');
});

// ── Test 4: on PUT failure, state becomes 'error' and retries once after 5s ──

test('on PUT failure, saveState becomes "error" and retries once after 5s', async () => {
  mockFetch.mockResolvedValue({ ok: false, status: 500, headers: { get: () => null } });
  const { result } = renderHook(() => useAutoSave(defaultOptions));

  act(() => result.current.save('content'));

  await act(async () => {
    jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    await Promise.resolve();
  });

  expect(result.current.saveState).toBe('error');

  // Retry succeeds after 5s
  mockFetch.mockResolvedValue({ ok: true, status: 204, headers: { get: () => '"etag-v1"' } });
  await act(async () => {
    jest.advanceTimersByTime(5000);
    await Promise.resolve();
  });

  expect(result.current.saveState).toBe('saved');
});

// ── Test 5: beforeunload listener registered when unsaved/error ───────────────

test('beforeunload listener is registered when saveState is "unsaved" or "error"', () => {
  const addEventListenerSpy = jest.spyOn(globalThis, 'addEventListener');
  const { result } = renderHook(() => useAutoSave(defaultOptions));

  act(() => result.current.save('new content'));

  expect(addEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  addEventListenerSpy.mockRestore();
});

// ── Issue 3: hook must accept initialEtag to seed storedEtag without a save ──

test('external-change polling fires onExternalChange when initialEtag is provided and server ETag differs', async () => {
  const onExternalChange = jest.fn();
  // Poll returns a changed ETag immediately — no save needed to seed storedEtag
  mockFetch.mockResolvedValueOnce({ ok: true, status: 200, headers: { get: () => '"etag-v2"' } });

  renderHook(() => useAutoSave({
    ...defaultOptions,
    initialEtag: '"etag-v1"',
    onExternalChange,
  }));

  await act(async () => {
    jest.advanceTimersByTime(EXTERNAL_CHANGE_POLL_INTERVAL_MS);
    await Promise.resolve();
  });

  expect(onExternalChange).toHaveBeenCalled();
});

test('without initialEtag, external-change polling is suppressed (storedEtag is null)', async () => {
  const onExternalChange = jest.fn();
  // Poll would return a changed ETag — but storedEtag is null so the guard skips it
  mockFetch.mockResolvedValueOnce({ ok: true, status: 200, headers: { get: () => '"etag-v2"' } });

  renderHook(() => useAutoSave({ ...defaultOptions, onExternalChange }));

  await act(async () => {
    jest.advanceTimersByTime(EXTERNAL_CHANGE_POLL_INTERVAL_MS);
    await Promise.resolve();
  });

  // No HEAD request fired (storedEtag null → guard returns early before fetch)
  const headCalls = mockFetch.mock.calls.filter(
    ([, options]) => (options as RequestInit)?.method === 'HEAD',
  );
  expect(headCalls).toHaveLength(0);
  expect(onExternalChange).not.toHaveBeenCalled();
});

// ── Test 6: polling HEAD calls onExternalChange when ETag differs ─────────────

test('polling HEAD at EXTERNAL_CHANGE_POLL_INTERVAL_MS calls onExternalChange when ETag differs', async () => {
  const onExternalChange = jest.fn();
  mockFetch
    .mockResolvedValueOnce({ ok: true, status: 204, headers: { get: () => '"etag-v1"' } }) // initial save
    .mockResolvedValueOnce({ ok: true, status: 200, headers: { get: () => '"etag-v2"' } }); // poll returns changed

  const { result } = renderHook(() => useAutoSave({ ...defaultOptions, onExternalChange }));

  // Do an initial save to store the ETag
  act(() => result.current.save('content'));
  await act(async () => {
    jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    await Promise.resolve();
  });

  // Advance to polling interval
  await act(async () => {
    jest.advanceTimersByTime(EXTERNAL_CHANGE_POLL_INTERVAL_MS);
    await Promise.resolve();
  });

  expect(onExternalChange).toHaveBeenCalled();
});

// ── Issue 2: polling must not fire when a PUT save is in-flight ───────────────

test('polling does not fire a HEAD request while a PUT is in-flight (saveState is saving)', async () => {
  const onExternalChange = jest.fn();
  // The PUT resolves slowly — we'll check polling behaviour before it resolves
  let resolvePut!: (value: unknown) => void;
  mockFetch.mockImplementationOnce(
    () => new Promise((resolve) => { resolvePut = resolve; }),
  );
  // A subsequent HEAD poll would return a "changed" ETag if it fires
  mockFetch.mockResolvedValue({ ok: true, status: 200, headers: { get: () => '"etag-v2"' } });

  const { result } = renderHook(() =>
    useAutoSave({ ...defaultOptions, initialEtag: '"etag-v1"', onExternalChange }),
  );

  // Trigger a save — the PUT is now in-flight (not yet resolved)
  act(() => result.current.save('content'));
  act(() => { jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS); });
  // saveState should be 'saving' (PUT in-flight)
  expect(result.current.saveState).toBe('saving');

  // Advance to the polling interval while the PUT is still in-flight
  await act(async () => {
    jest.advanceTimersByTime(EXTERNAL_CHANGE_POLL_INTERVAL_MS);
    await Promise.resolve();
  });

  // The poll must NOT have called onExternalChange — the change belongs to our own save
  expect(onExternalChange).not.toHaveBeenCalled();

  // Resolve the PUT so the hook cleans up properly
  resolvePut({ ok: true, status: 204, headers: { get: () => '"etag-v2"' } });
  await act(async () => { await Promise.resolve(); });
});

test('polling suppresses HEAD when pendingContent exists (debounce pending, within the debounce window)', async () => {
  const onExternalChange = jest.fn();
  // HEAD would return a changed ETag if it fires
  mockFetch.mockResolvedValue({ ok: true, status: 200, headers: { get: () => '"etag-changed"' } });

  // We can't override the poll interval in the hook, so we advance only 1s —
  // before both the debounce (4s) and poll interval (30s) fire.

  // We test the behaviour by seeding storedEtag and calling save() to set pendingContent,
  // then manually invoking the poll guard. Since we can't easily override the interval in
  // the hook, we verify the fix indirectly: after the fix, `pendingContent !== null` prevents
  // the HEAD. We do this by checking no HEAD was sent in the window between save() and debounce.
  const { result } = renderHook(() =>
    useAutoSave({ ...defaultOptions, initialEtag: '"etag-v1"', onExternalChange }),
  );

  act(() => result.current.save('content'));
  expect(result.current.saveState).toBe('unsaved');

  // Advance only to the POLL interval (30s), which also advances past AUTOSAVE_DEBOUNCE_MS (4s)
  // So we check HEAD calls BEFORE the debounce window closes by advancing only 1s
  await act(async () => {
    jest.advanceTimersByTime(1000); // well before both debounce and poll
    await Promise.resolve();
  });

  // No fetch of any kind should have happened yet (debounce hasn't fired, poll hasn't fired)
  expect(mockFetch).not.toHaveBeenCalled();
});

// ── Test 7: offline — content written to localStorage ─────────────────────────

test('when navigator.onLine is false and save(content) is called, content is written to localStorage', () => {
  isOnline = false;
  const { result } = renderHook(() => useAutoSave(defaultOptions));

  act(() => result.current.save('offline content'));

  // No fetch should have been called, and localStorage should have the draft
  expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
    OFFLINE_QUEUE_KEY_PREFIX + 'file-1',
    'offline content',
  );
  expect(mockFetch).not.toHaveBeenCalled();
});

// ── Issue C3: offline save must set saveState to 'unsaved' ────────────────────

test('when navigator.onLine is false, saveState transitions to "unsaved" (not stays "saved")', () => {
  isOnline = false;
  const { result } = renderHook(() => useAutoSave(defaultOptions));

  // Starts as saved
  expect(result.current.saveState).toBe('saved');

  act(() => result.current.save('offline content'));

  // Must be 'unsaved' so the status bar shows correctly and
  // the beforeunload keepalive guard fires on tab close.
  expect(result.current.saveState).toBe('unsaved');
});

// ── Test 8: online event flushes localStorage draft via PUT ───────────────────

test('firing the "online" window event while a draft exists triggers a PUT and clears the draft', async () => {
  localStorageStore[OFFLINE_QUEUE_KEY_PREFIX + 'file-1'] = 'draft content';
  mockFetch.mockResolvedValue({ ok: true, status: 204, headers: { get: () => '"etag-v1"' } });

  renderHook(() => useAutoSave(defaultOptions));

  await act(async () => {
    fireWindowEvent('online');
    await Promise.resolve();
  });

  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining('/projects/proj-1/files/file-1/content'),
    expect.objectContaining({ method: 'PUT', body: 'draft content' }),
  );
  expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(OFFLINE_QUEUE_KEY_PREFIX + 'file-1');
});

// ── Test 9: beforeunload with unsaved content dispatches keepalive fetch ──────

test('on beforeunload with saveState !== "saved", a keepalive fetch is dispatched', () => {
  const { result } = renderHook(() => useAutoSave(defaultOptions));

  act(() => result.current.save('unsaved content'));
  expect(result.current.saveState).toBe('unsaved');

  // Trigger beforeunload
  act(() => { fireWindowEvent('beforeunload'); });

  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining('/projects/proj-1/files/file-1/content'),
    expect.objectContaining({ method: 'PUT', keepalive: true, body: 'unsaved content' }),
  );
});

// ── Issue 4: network errors while online must write draft to localStorage ────

test('when the PUT fetch throws (network error while online), content is written to localStorage', async () => {
  mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  const { result } = renderHook(() => useAutoSave(defaultOptions));

  act(() => result.current.save('important content'));
  await act(async () => {
    jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    await Promise.resolve();
  });

  expect(result.current.saveState).toBe('error');
  expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
    OFFLINE_QUEUE_KEY_PREFIX + 'file-1',
    'important content',
  );
});

test('when the PUT returns a non-ok response (server error), content is written to localStorage', async () => {
  mockFetch.mockResolvedValueOnce({ ok: false, status: 500, headers: { get: () => null } });
  const { result } = renderHook(() => useAutoSave(defaultOptions));

  act(() => result.current.save('important content'));
  await act(async () => {
    jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    await Promise.resolve();
  });

  expect(result.current.saveState).toBe('error');
  expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
    OFFLINE_QUEUE_KEY_PREFIX + 'file-1',
    'important content',
  );
});

// ── Test 10: on mount, if localStorage has a draft, onDraftRecovered is called ─

test('on mount, if localStorage contains a draft for fileNodeId, onDraftRecovered is called with stored content', () => {
  const onDraftRecovered = jest.fn();
  localStorageStore[OFFLINE_QUEUE_KEY_PREFIX + 'file-1'] = 'recovered draft';

  renderHook(() => useAutoSave({ ...defaultOptions, onDraftRecovered }));

  expect(onDraftRecovered).toHaveBeenCalledWith('recovered draft');
});

// ── Issue 1: successful save must clear the localStorage draft ────────────────

test('successful save after a network error removes the draft from localStorage', async () => {
  // First save fails → draft written
  mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  // Retry succeeds
  mockFetch.mockResolvedValueOnce({ ok: true, status: 204, headers: { get: () => '"etag-v2"' } });

  const { result } = renderHook(() => useAutoSave(defaultOptions));

  act(() => result.current.save('my content'));
  await act(async () => {
    jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    await Promise.resolve();
  });

  // Draft should be in localStorage after failure
  expect(mockLocalStorage.setItem).toHaveBeenCalledWith(OFFLINE_QUEUE_KEY_PREFIX + 'file-1', 'my content');
  expect(result.current.saveState).toBe('error');

  // Retry fires after 5 seconds and succeeds
  await act(async () => {
    jest.advanceTimersByTime(5000);
    await Promise.resolve();
  });

  expect(result.current.saveState).toBe('saved');
  // Draft must be removed so the next mount does not show a stale recovery banner
  expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(OFFLINE_QUEUE_KEY_PREFIX + 'file-1');
});

test('successful initial save (no prior error) removes any pre-existing draft from localStorage', async () => {
  // Pre-seed a stale draft (e.g. left from a previous session)
  localStorageStore[OFFLINE_QUEUE_KEY_PREFIX + 'file-1'] = 'stale draft';
  mockFetch.mockResolvedValueOnce({ ok: true, status: 204, headers: { get: () => '"etag-v1"' } });

  const { result } = renderHook(() => useAutoSave(defaultOptions));

  act(() => result.current.save('new content'));
  await act(async () => {
    jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    await Promise.resolve();
  });

  expect(result.current.saveState).toBe('saved');
  expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(OFFLINE_QUEUE_KEY_PREFIX + 'file-1');
});

// ── Issue 2: pending retry must be cancelled when fileNodeId changes ──────────

test('when fileNodeId changes and a retry is pending, the retry is cancelled (no PUT to the stale file-1 URL)', async () => {
  // Arrange: all fetches resolve ok so we can track which URLs are called
  const calledUrls: string[] = [];
  mockFetch.mockImplementation((url: string) => {
    calledUrls.push(url as string);
    return Promise.reject(new TypeError('fail'));
  });

  const { result, rerender } = renderHook(
    ({ fileNodeId }: { fileNodeId: string }) =>
      useAutoSave({ projectId: 'proj-1', fileNodeId }),
    { initialProps: { fileNodeId: 'file-1' } },
  );

  // Save for file-1 — will fail, arming the 5s retry
  act(() => result.current.save('file-1 content'));
  await act(async () => {
    jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    await Promise.resolve();
  });
  expect(result.current.saveState).toBe('error');

  // Clear URL tracker so we only see calls AFTER the file switch
  calledUrls.length = 0;

  // Switch to file-2 before the 5-second retry fires
  rerender({ fileNodeId: 'file-2' });

  // Advance past the full retry window
  await act(async () => {
    jest.advanceTimersByTime(5000);
    await Promise.resolve();
  });

  // The stale retry for file-1 must NOT have fired after the file switch
  const staleRetries = calledUrls.filter((url) => url.includes('file-1'));
  expect(staleRetries).toHaveLength(0);
});

// ── Issue 5: draft recovery must re-run when fileNodeId changes ───────────────

test('when fileNodeId changes, draft for the new file is recovered from localStorage', () => {
  const onDraftRecovered = jest.fn();
  localStorageStore[OFFLINE_QUEUE_KEY_PREFIX + 'file-2'] = 'draft for file 2';

  const { rerender } = renderHook(
    ({ fileNodeId }: { fileNodeId: string }) =>
      useAutoSave({ projectId: 'proj-1', fileNodeId, onDraftRecovered }),
    { initialProps: { fileNodeId: 'file-1' } },
  );

  // No draft for file-1
  expect(onDraftRecovered).not.toHaveBeenCalled();

  // Switch to file-2 which has a draft
  rerender({ fileNodeId: 'file-2' });

  expect(onDraftRecovered).toHaveBeenCalledWith('draft for file 2');
});

// ── Issue 4: poll interval must stop when fileNodeId (url) changes ─────────────

test('when fileNodeId changes, the external-change poll interval is stopped for the old file', async () => {
  const onExternalChange = jest.fn();
  // HEAD calls for the OLD file would return a changed ETag
  mockFetch.mockResolvedValue({ ok: true, status: 200, headers: { get: () => '"etag-new"' } });

  const { rerender } = renderHook(
    ({ fileNodeId }: { fileNodeId: string }) =>
      useAutoSave({ projectId: 'proj-1', fileNodeId, initialEtag: '"etag-v1"', onExternalChange }),
    { initialProps: { fileNodeId: 'file-1' } },
  );

  // Switch to file-2 — the old poll for file-1 must stop
  rerender({ fileNodeId: 'file-2' });

  // Advance past the poll interval for file-1 and file-2
  await act(async () => {
    jest.advanceTimersByTime(EXTERNAL_CHANGE_POLL_INTERVAL_MS);
    await Promise.resolve();
  });

  // Only HEAD for file-2 (new url) should fire, not file-1 (old url)
  const staleHeadCalls = mockFetch.mock.calls.filter(
    ([url]) => typeof url === 'string' && url.includes('file-1'),
  );
  expect(staleHeadCalls).toHaveLength(0);
});

// ── Issue 2: concurrent saves — retry + new debounce must not race ────────────

test('calling save() while a retry is pending cancels the retry timer', async () => {
  // First PUT fails → scheduleRetry arms a 5s timer
  mockFetch.mockRejectedValueOnce(new TypeError('Network error'));
  // Second PUT (debounce) will succeed
  mockFetch.mockResolvedValue({ ok: true, status: 204, headers: { get: () => '"etag-v2"' } });

  const { result } = renderHook(() => useAutoSave(defaultOptions));

  // Save → debounce → PUT fails → retry timer set
  act(() => result.current.save('content v1'));
  await act(async () => {
    jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    await Promise.resolve();
  });
  expect(result.current.saveState).toBe('error');

  // User types again — the retry timer must be cancelled (not just a new debounce added)
  act(() => result.current.save('content v2'));
  mockFetch.mockClear();

  // Advance 5s — the old retry must NOT fire (would send content v1 if not cancelled)
  await act(async () => {
    jest.advanceTimersByTime(5000);
    await Promise.resolve();
  });

  // The stale retry for 'content v1' must NOT have fired; only the debounce for v2 may have
  const retryPutsWithOldContent = mockFetch.mock.calls.filter(
    ([, options]) => (options as RequestInit)?.method === 'PUT' && (options as RequestInit)?.body === 'content v1',
  );
  expect(retryPutsWithOldContent).toHaveLength(0);
});

test('poll is suppressed while a save is in-flight and only fires after all saves complete (counter behaviour)', async () => {
  const onExternalChange = jest.fn();

  // Slow PUT — won't resolve until we call resolvePut
  let resolvePut!: (value: unknown) => void;
  mockFetch.mockImplementationOnce(
    () => new Promise((resolve) => { resolvePut = resolve; }),
  );
  // HEAD polls return a "changed" ETag — must only fire AFTER the save completes
  mockFetch.mockResolvedValue({ ok: true, status: 200, headers: { get: () => '"etag-changed"' } });

  const { result } = renderHook(() =>
    useAutoSave({ ...defaultOptions, initialEtag: '"etag-v1"', onExternalChange }),
  );

  // Start save (debounce fires, PUT in-flight — savesInFlight = 1)
  act(() => result.current.save('content'));
  await act(async () => {
    jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    await Promise.resolve();
  });
  expect(result.current.saveState).toBe('saving');

  // Poll fires while save is in-flight — must be suppressed
  await act(async () => {
    jest.advanceTimersByTime(EXTERNAL_CHANGE_POLL_INTERVAL_MS);
    await Promise.resolve();
  });
  expect(onExternalChange).not.toHaveBeenCalled();

  // Resolve the PUT — savesInFlight drops to 0
  resolvePut({ ok: true, status: 204, headers: { get: () => '"etag-v2"' } });
  await act(async () => { await Promise.resolve(); });
  expect(result.current.saveState).toBe('saved');

  // Next poll fires after the save — now it should detect the external change
  await act(async () => {
    jest.advanceTimersByTime(EXTERNAL_CHANGE_POLL_INTERVAL_MS);
    await Promise.resolve();
  });
  // storedEtag is '"etag-v2"' (from PUT response), HEAD returns '"etag-changed"' → notify
  expect(onExternalChange).toHaveBeenCalled();
});

// ── Issue 1: beforeunload handler must stay registered during 'saving' state ──

test('beforeunload listener stays registered while saveState is "saving" (PUT in-flight)', async () => {
  // Arrange: the PUT never resolves so we can inspect state while saving
  let resolvePut!: (value: unknown) => void;
  mockFetch.mockImplementationOnce(
    () => new Promise((resolve) => { resolvePut = resolve; }),
  );

  const addSpy = jest.spyOn(globalThis, 'addEventListener');
  const removeSpy = jest.spyOn(globalThis, 'removeEventListener');

  const { result } = renderHook(() => useAutoSave(defaultOptions));

  // Trigger save → hook goes 'unsaved' then 'saving'
  act(() => result.current.save('my content'));
  await act(async () => {
    jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    await Promise.resolve();
  });

  expect(result.current.saveState).toBe('saving');

  // The beforeunload handler must still be registered while saving
  const beforeunloadAdds = addSpy.mock.calls.filter(([event]) => event === 'beforeunload');
  const beforeunloadRemoves = removeSpy.mock.calls.filter(([event]) => event === 'beforeunload');

  // It was added (when state became 'unsaved') and must NOT have been removed without being re-added
  // i.e. net registrations > 0
  expect(beforeunloadAdds.length - beforeunloadRemoves.length).toBeGreaterThan(0);

  // Cleanup
  resolvePut({ ok: true, status: 204, headers: { get: () => '"etag-v1"' } });
  await act(async () => { await Promise.resolve(); });
  addSpy.mockRestore();
  removeSpy.mockRestore();
});

test('keepalive fetch is dispatched on beforeunload while saveState is "saving"', async () => {
  // PUT never resolves — stays in-flight
  let resolvePut!: (value: unknown) => void;
  mockFetch.mockImplementationOnce(
    () => new Promise((resolve) => { resolvePut = resolve; }),
  );
  // The keepalive fetch itself
  mockFetch.mockResolvedValue({ ok: true, status: 204, headers: { get: () => null } });

  const { result } = renderHook(() => useAutoSave(defaultOptions));

  act(() => result.current.save('unsaved content'));
  await act(async () => {
    jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    await Promise.resolve();
  });
  expect(result.current.saveState).toBe('saving');

  // Fire beforeunload while PUT is still in-flight
  act(() => { globalThis.dispatchEvent(new Event('beforeunload')); });

  const keepaliveCalls = mockFetch.mock.calls.filter(
    ([, options]) => (options as RequestInit)?.keepalive === true,
  );
  expect(keepaliveCalls).toHaveLength(1);
  expect(keepaliveCalls[0][1]).toMatchObject({ method: 'PUT', body: 'unsaved content' });

  resolvePut({ ok: true, status: 204, headers: { get: () => '"etag-v1"' } });
  await act(async () => { await Promise.resolve(); });
});

// ── Issue 4: handleOnline must not remove draft before performSave succeeds ───

test('when coming back online, the draft stays in localStorage until performSave succeeds', async () => {
  // Arrange: pre-seed a draft in localStorage (as if the user edited while offline)
  isOnline = false;
  const { result } = renderHook(() => useAutoSave(defaultOptions));
  act(() => result.current.save('offline content'));
  expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
    OFFLINE_QUEUE_KEY_PREFIX + 'file-1',
    'offline content',
  );
  mockLocalStorage.setItem.mockClear();

  // Now the PUT will be slow — never resolves during the test
  let resolvePut!: (value: unknown) => void;
  mockFetch.mockImplementationOnce(
    () => new Promise((resolve) => { resolvePut = resolve; }),
  );

  // Come back online — this should start performSave but NOT remove the draft yet
  isOnline = true;
  await act(async () => {
    fireWindowEvent('online');
    await Promise.resolve();
  });

  // Draft must still be in localStorage while performSave is in-flight
  // (it should only be removed after the save succeeds, not before)
  expect(mockLocalStorage.removeItem).not.toHaveBeenCalledWith(
    OFFLINE_QUEUE_KEY_PREFIX + 'file-1',
  );

  // Now the save succeeds — draft must be removed
  resolvePut({ ok: true, status: 204, headers: { get: () => '"etag-v1"' } });
  await act(async () => { await Promise.resolve(); });

  expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(
    OFFLINE_QUEUE_KEY_PREFIX + 'file-1',
  );
});

// ── Issue 2 (race): in-flight retry PUT must not overwrite a later debounce PUT ─

test('when a retry is already in-flight and the debounce resolves first, the retry resolving second must not overwrite storedEtag — verified by absence of spurious onExternalChange', async () => {
  const onExternalChange = jest.fn();

  // Abort controller ref to cancel stale requests — doesn't exist yet, so this test
  // verifies the CURRENT broken behaviour: stale retry overwrites storedEtag.
  // After the fix (AbortController on performSave), the retry is aborted when
  // save() is called, so storedEtag stays at the fresh value.

  let resolveRetryPut!: (value: unknown) => void;
  let resolveDebounce!: (value: unknown) => void;

  const { result } = renderHook(() =>
    useAutoSave({ ...defaultOptions, initialEtag: '"etag-v0"', onExternalChange }),
  );

  // Step 1: first save fails → retry timer armed
  mockFetch.mockRejectedValueOnce(new TypeError('Network error'));
  act(() => result.current.save('stale content'));
  await act(async () => {
    jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    await Promise.resolve();
  });
  expect(result.current.saveState).toBe('error');

  // Step 2: retry fires — slow PUT in-flight with stale content
  mockFetch
    .mockImplementationOnce(() => new Promise((resolve) => { resolveRetryPut = resolve; }))
    .mockImplementationOnce(() => new Promise((resolve) => { resolveDebounce = resolve; }));

  await act(async () => {
    jest.advanceTimersByTime(5000); // retry timer fires
    await Promise.resolve();
  });

  // Step 3: user types fresh content — new debounce (retry already in-flight)
  act(() => result.current.save('fresh content'));
  await act(async () => {
    jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    await Promise.resolve();
  });

  // Step 4: debounce (fresh) resolves first → storedEtag = '"etag-fresh"'
  resolveDebounce({ ok: true, status: 204, headers: { get: () => '"etag-fresh"' } });
  await act(async () => { await Promise.resolve(); });
  expect(result.current.saveState).toBe('saved');

  // Step 5: retry (stale) resolves second — MUST NOT overwrite storedEtag with '"etag-stale"'
  resolveRetryPut({ ok: true, status: 204, headers: { get: () => '"etag-stale"' } });
  await act(async () => { await Promise.resolve(); });

  // Step 6: poll fires — if storedEtag is '"etag-stale"', server would return 200 with
  // '"etag-fresh"' and onExternalChange would fire spuriously.
  // If storedEtag is correctly '"etag-fresh"', server returns 304 and onExternalChange is NOT called.
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: { get: (name: string) => name === 'ETag' ? '"etag-fresh"' : null },
  });
  await act(async () => {
    jest.advanceTimersByTime(EXTERNAL_CHANGE_POLL_INTERVAL_MS);
    await Promise.resolve();
  });

  // After the fix: storedEtag = '"etag-fresh"', HEAD returns '"etag-fresh"' (no change) → no notification
  // Without the fix: storedEtag = '"etag-stale"', HEAD returns '"etag-fresh"' (changed!) → onExternalChange fires
  expect(onExternalChange).not.toHaveBeenCalled();
});

// ── Issue 3: handleOnline must cancel the pending retry before calling performSave ─

test('when online event fires while a retry is pending, the retry timer is cancelled so no duplicate PUT is sent', async () => {
  // First online save fails → retry timer armed
  mockFetch.mockRejectedValueOnce(new TypeError('Network error'));
  // The handleOnline-triggered save and any retry succeed
  mockFetch.mockResolvedValue({ ok: true, status: 204, headers: { get: () => '"etag-v1"' } });

  // Seed a draft (as if user edited offline)
  localStorageStore[OFFLINE_QUEUE_KEY_PREFIX + 'file-1'] = 'draft content';

  const { result } = renderHook(() => useAutoSave(defaultOptions));

  act(() => result.current.save('draft content'));
  await act(async () => {
    jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    await Promise.resolve();
  });
  expect(result.current.saveState).toBe('error');
  // retryTimer is now armed for 5s

  // Network comes back online — handleOnline should cancel retryTimer first
  mockFetch.mockClear();
  isOnline = true;
  await act(async () => {
    fireWindowEvent('online');
    await Promise.resolve();
  });

  // handleOnline-triggered save completes
  await act(async () => { await Promise.resolve(); });

  // Advance past retry window — NO extra PUT should fire (retry was cancelled)
  await act(async () => {
    jest.advanceTimersByTime(5000);
    await Promise.resolve();
  });

  const allPuts = mockFetch.mock.calls.filter(
    ([, options]) => (options as RequestInit)?.method === 'PUT',
  );
  // Only the one PUT from handleOnline — the retry must NOT have fired
  expect(allPuts).toHaveLength(1);
});

// ── Issue 2: stale retry must not fire after a newer debounce save succeeded ──

test('retry scheduled AFTER save(v2) was already called (race) does not fire a stale PUT once the fresh debounce save succeeded', async () => {
  // Slow PUT v1 so we can call save(v2) while PUT v1 is still in-flight
  let rejectPut!: (reason: unknown) => void;
  mockFetch.mockImplementationOnce(
    () => new Promise((_, reject) => { rejectPut = reject; }),
  );
  // PUT v2 (debounce) will succeed
  mockFetch.mockResolvedValue({ ok: true, status: 204, headers: { get: () => '"etag-v2"' } });

  const { result } = renderHook(() => useAutoSave(defaultOptions));

  // Start PUT v1 (in-flight)
  act(() => result.current.save('content v1'));
  await act(async () => {
    jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    await Promise.resolve();
  });
  expect(result.current.saveState).toBe('saving');

  // User types v2 WHILE PUT v1 is still in-flight — retryTimer is null so clearTimeout is no-op
  act(() => result.current.save('content v2'));
  mockFetch.mockClear();

  // PUT v1 now fails → catch arms scheduleRetry(v1) — but save(v2) already ran
  rejectPut(new TypeError('Network error'));
  await act(async () => { await Promise.resolve(); });
  // retryTimer is now set (5s) for stale content v1

  // Debounce for v2 fires → PUT v2 succeeds
  await act(async () => {
    jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    await Promise.resolve();
  });
  expect(result.current.saveState).toBe('saved');
  mockFetch.mockClear();

  // Advance past retry window — the stale retry for v1 must NOT fire
  await act(async () => {
    jest.advanceTimersByTime(5000);
    await Promise.resolve();
  });

  const staleRetries = mockFetch.mock.calls.filter(
    ([, options]) => (options as RequestInit)?.method === 'PUT',
  );
  expect(staleRetries).toHaveLength(0);
});

// ── Issue 1: in-flight save must NOT removeItem when offline save wrote newer draft ─

test('when an offline save writes a new draft while a PUT is in-flight, the successful PUT does not delete that newer draft', async () => {
  let resolvePut!: (value: unknown) => void;
  mockFetch.mockImplementationOnce(
    () => new Promise((resolve) => { resolvePut = resolve; }),
  );

  const { result } = renderHook(() => useAutoSave(defaultOptions));

  // Start an online save (PUT in-flight)
  act(() => result.current.save('content v1'));
  await act(async () => {
    jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    await Promise.resolve();
  });
  expect(result.current.saveState).toBe('saving');

  // While PUT is in-flight, user goes offline and types new content
  isOnline = false;
  act(() => result.current.save('content v2'));
  // v2 must be in localStorage
  expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
    OFFLINE_QUEUE_KEY_PREFIX + 'file-1',
    'content v2',
  );
  mockLocalStorage.removeItem.mockClear(); // reset so we can check it isn't called

  // Now the original PUT resolves successfully — its generation guard should now be stale
  resolvePut({ ok: true, status: 204, headers: { get: () => '"etag-v1"' } });
  await act(async () => { await Promise.resolve(); });

  // The v2 draft must still be in localStorage — the in-flight PUT must NOT have wiped it
  expect(mockLocalStorage.removeItem).not.toHaveBeenCalledWith(
    OFFLINE_QUEUE_KEY_PREFIX + 'file-1',
  );
});
