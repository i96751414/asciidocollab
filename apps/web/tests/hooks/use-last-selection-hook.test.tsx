/**
 * Covers the `useLastSelection` hook wrapper (the bound, memoised read/write/clear helpers).
 * Runs in the jsdom project, which provides a real `localStorage`. The underlying storage
 * functions are unit-tested separately in `use-last-selection.test.ts`.
 */
import { renderHook, act } from '@testing-library/react';
import { useLastSelection, lastSelectionKey } from '@/hooks/use-last-selection';

const USER = 'user-1';
const PROJECT = 'proj-1';
const FILE = { nodeId: 'n1', nodeName: 'intro.adoc', nodeType: 'file' as const, path: '/intro.adoc' };

beforeEach(() => {
  localStorage.clear();
});

describe('useLastSelection (bound helpers)', () => {
  it('round-trips a file selection and cursor line, then clears it', () => {
    const { result } = renderHook(() => useLastSelection(USER, PROJECT));

    expect(result.current.readLastSelection()).toBeNull();

    act(() => { result.current.rememberFile(FILE); });
    expect(result.current.readLastSelection()).toEqual(FILE);

    act(() => { result.current.rememberLine(42); });
    expect(result.current.readLastSelection()).toEqual({ ...FILE, line: 42 });

    act(() => { result.current.clearLastSelection(); });
    expect(localStorage.getItem(lastSelectionKey(USER, PROJECT))).toBeNull();
  });

  it('round-trips a per-file cursor line and prunes it (US7)', () => {
    const { result } = renderHook(() => useLastSelection(USER, PROJECT));

    expect(result.current.readCursorLine('n1')).toBeUndefined();

    act(() => { result.current.rememberCursorLine('n1', 12); });
    act(() => { result.current.rememberCursorLine('n2', 34); });
    expect(result.current.readCursorLine('n1')).toBe(12);
    expect(result.current.readCursorLine('n2')).toBe(34);

    act(() => { result.current.pruneCursor('n1'); });
    expect(result.current.readCursorLine('n1')).toBeUndefined();
    expect(result.current.readCursorLine('n2')).toBe(34);
  });

  it('returns a stable helper object while userId/projectId are unchanged', () => {
    const { result, rerender } = renderHook(({ u, p }) => useLastSelection(u, p), {
      initialProps: { u: USER, p: PROJECT },
    });
    const first = result.current;
    rerender({ u: USER, p: PROJECT });
    expect(result.current).toBe(first);
  });
});
