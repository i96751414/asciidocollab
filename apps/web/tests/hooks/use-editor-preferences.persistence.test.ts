/* @jest-environment jsdom */
/**
 * T024 — US3 persistence tests for `showIncludedFiles`.
 *
 * These are green verification tests: T006 already implements the full
 * client-only persistence behaviour. This suite confirms the same-browser
 * persistence story (US3) and the client-only guarantee.
 */
import { renderHook, act } from '@testing-library/react';
import { useEditorPreferences } from '@/hooks/use-editor-preferences';

// ── Test infrastructure (mirrors use-editor-preferences.test.tsx) ────────────

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
  // Use a never-resolving fetch by default so the server response can never
  // overwrite localStorage-derived state during synchronous assertions.
  mockFetch.mockReturnValue(new Promise(() => {}));
});

afterEach(() => {
  jest.useRealTimers();
});

// ── T024 persistence tests ───────────────────────────────────────────────────

test('persistence round-trip: setShowIncludedFiles(true) is read back by a new hook instance', () => {
  // First hook instance — simulate the user toggling the preference on.
  const { result: first } = renderHook(() => useEditorPreferences());
  act(() => first.current.setShowIncludedFiles(true));
  expect(first.current.showIncludedFiles).toBe(true);

  // localStorage now contains the persisted value; a second renderHook call
  // represents a fresh page load that re-reads from storage.
  const { result: second } = renderHook(() => useEditorPreferences());
  expect(second.current.showIncludedFiles).toBe(true);
});

test('no account PUT ever carries showIncludedFiles (client-only guarantee)', async () => {
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

  const { result } = renderHook(() => useEditorPreferences());

  // Toggle the client-only flag.
  act(() => result.current.setShowIncludedFiles(true));

  // Trigger a PUT by changing a server-synced preference.
  act(() => result.current.setFontSize(16));

  await act(async () => {
    jest.advanceTimersByTime(600);
    await Promise.resolve();
  });

  const putCalls = mockFetch.mock.calls.filter(
    (c: unknown[]) => (c[1] as { method?: string })?.method === 'PUT',
  );
  expect(putCalls.length).toBeGreaterThan(0);
  for (const putCall of putCalls) {
    const body = JSON.parse((putCall[1] as { body: string }).body) as Record<string, unknown>;
    expect(body).not.toHaveProperty('showIncludedFiles');
  }
});

test('fresh storage (no key) yields the default false', () => {
  // localStorage is empty (cleared in beforeEach).
  const { result } = renderHook(() => useEditorPreferences());
  expect(result.current.showIncludedFiles).toBe(false);
});

test('setShowIncludedFiles(false) after true persists false across a re-initialization', () => {
  // Set true first.
  const { result: first } = renderHook(() => useEditorPreferences());
  act(() => first.current.setShowIncludedFiles(true));
  expect(JSON.parse(mockLocalStorage.store[LS_KEY] ?? '{}').showIncludedFiles).toBe(true);

  // Now set back to false.
  act(() => first.current.setShowIncludedFiles(false));
  expect(JSON.parse(mockLocalStorage.store[LS_KEY] ?? '{}').showIncludedFiles).toBe(false);

  // A fresh hook instance (simulating page reload) must read false.
  const { result: second } = renderHook(() => useEditorPreferences());
  expect(second.current.showIncludedFiles).toBe(false);
});
