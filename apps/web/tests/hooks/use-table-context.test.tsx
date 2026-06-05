import { renderHook, act } from '@testing-library/react';

// Minimal EditorView stub that tracks how many updateListeners have been appended
function makeMockView() {
  let appendedListeners = 0;

  const view = {
    state: {
      field: jest.fn().mockReturnValue(null),
    },
    dispatch: jest.fn((transaction: { effects?: unknown }) => {
      if (transaction.effects && (transaction.effects as { _isAppendConfig?: boolean })._isAppendConfig) {
        appendedListeners++;
      }
    }),
    focus: jest.fn(),
    getAppendedListenerCount: () => appendedListeners,
  };

  return view;
}

jest.mock('@codemirror/view', () => ({
  EditorView: {
    updateListener: {
      of: (function_: unknown) => ({ _isUpdateListenerExt: true, _fn: function_ }),
    },
  },
}));

jest.mock('@codemirror/state', () => ({
  StateEffect: {
    appendConfig: {
      of: (_extension: unknown) => ({ _isAppendConfig: true }),
    },
    define: () => ({ of: (v: unknown) => v }),
  },
}));

jest.mock('@/lib/codemirror/asciidoc-table-context', () => ({
  tableContextField: {},
}));

import { useTableContext } from '@/hooks/use-table-context';
import type { EditorView } from '@codemirror/view';

describe('useTableContext listener registration', () => {
  test('registers exactly one listener even when the same view is re-passed after a null gap', () => {
    // This simulates the React lifecycle where a parent re-renders causing
    // useTableContext to receive null (editor temporarily unmounted) then the
    // same EditorView instance again. Without a guard, appendConfig fires twice.
    const view = makeMockView();
    let currentView: EditorView | null = view as unknown as EditorView;

    const { rerender } = renderHook(() => useTableContext(currentView));

    expect(view.getAppendedListenerCount()).toBe(1);

    // Pass null (simulates editor unmount / ref temporarily null)
    act(() => { currentView = null; });
    rerender();

    // Pass the SAME view instance again
    act(() => { currentView = view as unknown as EditorView; });
    rerender();

    // Without a guard, the same view would get a second appendConfig dispatch
    expect(view.getAppendedListenerCount()).toBe(1);
  });

  test('registers a listener for each distinct view instance', () => {
    const viewA = makeMockView();
    const viewB = makeMockView();
    let currentView: EditorView | null = viewA as unknown as EditorView;

    const { rerender } = renderHook(() => useTableContext(currentView));

    expect(viewA.getAppendedListenerCount()).toBe(1);
    expect(viewB.getAppendedListenerCount()).toBe(0);

    act(() => { currentView = viewB as unknown as EditorView; });
    rerender();

    expect(viewA.getAppendedListenerCount()).toBe(1);
    expect(viewB.getAppendedListenerCount()).toBe(1);
  });
});
