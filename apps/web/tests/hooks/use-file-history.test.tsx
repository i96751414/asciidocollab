/**
 * Behaviour tests for `useFileHistory` — the browser-history seam that makes the
 * editor's per-file selection a real Back/Forward navigation (in-session).
 *
 * Runs in the jsdom project, which provides a real `globalThis.history` and dispatches
 * `popstate`. `history.state` is the single source of truth, so each test resets it
 * (without disturbing the shared length) in `beforeEach`.
 */
import { renderHook, act } from '@testing-library/react';
import { useFileHistory } from '@/hooks/use-file-history';
import type { SelectedFile } from '@/hooks/use-file-selection';

/** The public contract: the key under which a file is stored in `history.state`. */
const HISTORY_FILE_KEY = 'asciidocFile';

const FILE_A: SelectedFile = { nodeId: 'a', nodeName: 'a.adoc', nodeType: 'file', path: '/a.adoc' };
const FILE_B: SelectedFile = { nodeId: 'b', nodeName: 'b.adoc', nodeType: 'file', path: '/b.adoc' };

function currentEntry(): { nodeId: string; nodeName: string; nodeType: string; path: string } | undefined {
  return (globalThis.history.state as { asciidocFile?: ReturnType<typeof currentEntry> } | null)?.asciidocFile;
}

beforeEach(() => {
  globalThis.history.replaceState(null, '');
});

describe('useFileHistory', () => {
  it('records the first selected file as a baseline (replaceState — no new entry)', () => {
    const selectFile = jest.fn();
    const lengthBefore = globalThis.history.length;
    const { rerender } = renderHook(
      ({ file }: { file: SelectedFile | null }) => useFileHistory({ selectedFile: file, selectFile }),
      { initialProps: { file: null as SelectedFile | null } },
    );

    act(() => { rerender({ file: FILE_A }); });

    expect(currentEntry()?.nodeId).toBe('a');
    expect(globalThis.history.length).toBe(lengthBefore);
  });

  it('pushes a new entry when a different file is selected', () => {
    const selectFile = jest.fn();
    const { rerender } = renderHook(
      ({ file }: { file: SelectedFile | null }) => useFileHistory({ selectedFile: file, selectFile }),
      { initialProps: { file: null as SelectedFile | null } },
    );

    act(() => { rerender({ file: FILE_A }); });
    const lengthAfterBaseline = globalThis.history.length;

    act(() => { rerender({ file: FILE_B }); });

    expect(currentEntry()?.nodeId).toBe('b');
    expect(globalThis.history.length).toBe(lengthAfterBaseline + 1);
  });

  it('selects the file carried by a popstate entry (Back/Forward)', () => {
    const selectFile = jest.fn();
    renderHook(() => useFileHistory({ selectedFile: FILE_B, selectFile }));
    selectFile.mockClear();

    // The browser sets history.state to the target entry, then fires popstate.
    act(() => {
      globalThis.dispatchEvent(new PopStateEvent('popstate', { state: { [HISTORY_FILE_KEY]: FILE_A } }));
    });

    expect(selectFile).toHaveBeenCalledWith('a', 'a.adoc', '/a.adoc', 'file');
  });

  it('ignores a popstate entry that carries no file (page-level history)', () => {
    const selectFile = jest.fn();
    renderHook(() => useFileHistory({ selectedFile: FILE_A, selectFile }));
    selectFile.mockClear();

    act(() => {
      globalThis.dispatchEvent(new PopStateEvent('popstate', { state: { someOtherKey: 1 } }));
    });

    expect(selectFile).not.toHaveBeenCalled();
  });

  it('ignores malformed history entries (null state or invalid fields)', () => {
    const selectFile = jest.fn();
    renderHook(() => useFileHistory({ selectedFile: FILE_A, selectFile }));
    selectFile.mockClear();

    const malformed = [
      null,
      { [HISTORY_FILE_KEY]: { nodeId: 1, nodeName: 'x', path: '/x', nodeType: 'file' } },
      { [HISTORY_FILE_KEY]: { nodeId: 'x', nodeName: 'x', path: '/x', nodeType: 'symlink' } },
    ];
    act(() => {
      for (const state of malformed) {
        globalThis.dispatchEvent(new PopStateEvent('popstate', { state }));
      }
    });

    expect(selectFile).not.toHaveBeenCalled();
  });

  it('does not push a duplicate entry when the same file is re-selected', () => {
    const selectFile = jest.fn();
    const { rerender } = renderHook(
      ({ file }: { file: SelectedFile | null }) => useFileHistory({ selectedFile: file, selectFile }),
      { initialProps: { file: FILE_A as SelectedFile | null } },
    );
    const lengthAfterBaseline = globalThis.history.length;

    // A fresh object with the same nodeId — mirrors how `selectFile` rebuilds SelectedFile per click.
    act(() => { rerender({ file: { ...FILE_A } }); });

    expect(globalThis.history.length).toBe(lengthAfterBaseline);
    expect(currentEntry()?.nodeId).toBe('a');
  });
});
