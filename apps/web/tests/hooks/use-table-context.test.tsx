import { renderHook, act } from '@testing-library/react';

type UpdateListener = (update: unknown) => void;

function isAppendConfig(value: unknown): value is { _isAppendConfig: true; _fn?: UpdateListener } {
  return typeof value === 'object' && value !== null && '_isAppendConfig' in value;
}

// Minimal EditorView stub that tracks how many updateListeners have been appended
// and captures the registered listener so tests can invoke it directly.
function makeMockView() {
  let appendedListeners = 0;
  let capturedListener: UpdateListener | null = null;

  const view = {
    state: {
      field: jest.fn().mockReturnValue(null),
    },
    dispatch: jest.fn((transaction: { effects?: unknown }) => {
      if (isAppendConfig(transaction.effects)) {
        appendedListeners++;
        if (transaction.effects._fn) {
          capturedListener = transaction.effects._fn;
        }
      }
    }),
    focus: jest.fn(),
    getAppendedListenerCount: () => appendedListeners,
    getCapturedListener: () => capturedListener,
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

function extractFunction(extension: unknown): unknown {
  if (typeof extension === 'object' && extension !== null && '_fn' in extension) {
    return Reflect.get(extension, '_fn');
  }
  return undefined;
}

jest.mock('@codemirror/state', () => ({
  StateEffect: {
    appendConfig: {
      // Preserve the captured listener fn so tests can invoke it directly.
      of: (extension: unknown) => ({ _isAppendConfig: true, _fn: extractFunction(extension) }),
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

describe('useTableContext context value', () => {
  test('returns null when no view is provided', () => {
    const { result } = renderHook(() => useTableContext(null));

    expect(result.current).toBeNull();
  });

  test('reads the table context field from the view state on mount', () => {
    const tableContext = { rows: 2, columns: 3 };
    const view = makeMockView();
    view.state.field.mockReturnValue(tableContext);

    const { result } = renderHook(() => useTableContext(view as unknown as EditorView));

    expect(result.current).toBe(tableContext);
  });

  test('falls back to null when reading the field throws on mount', () => {
    const view = makeMockView();
    view.state.field.mockImplementation(() => {
      throw new Error('field not present');
    });

    const { result } = renderHook(() => useTableContext(view as unknown as EditorView));

    expect(result.current).toBeNull();
  });

  test('resets to null when the view becomes null after having a value', () => {
    const tableContext = { rows: 1, columns: 1 };
    const view = makeMockView();
    view.state.field.mockReturnValue(tableContext);
    let currentView: EditorView | null = view as unknown as EditorView;

    const { result, rerender } = renderHook(() => useTableContext(currentView));

    expect(result.current).toBe(tableContext);

    act(() => { currentView = null; });
    rerender();

    expect(result.current).toBeNull();
  });
});

function makeUpdate(overrides: {
  selectionSet?: boolean;
  docChanged?: boolean;
  field: jest.Mock;
}) {
  return {
    selectionSet: overrides.selectionSet ?? false,
    docChanged: overrides.docChanged ?? false,
    state: { field: overrides.field },
  };
}

describe('useTableContext update listener', () => {
  test('updates the context when the selection changes', () => {
    const view = makeMockView();
    const { result } = renderHook(() => useTableContext(view as unknown as EditorView));

    const updatedContext = { rows: 5, columns: 5 };
    const fieldOnUpdate = jest.fn().mockReturnValue(updatedContext);

    act(() => {
      const listener = view.getCapturedListener();
      listener?.(makeUpdate({ selectionSet: true, field: fieldOnUpdate }));
    });

    expect(result.current).toBe(updatedContext);
  });

  test('updates the context when the document changes', () => {
    const view = makeMockView();
    const { result } = renderHook(() => useTableContext(view as unknown as EditorView));

    const updatedContext = { rows: 9, columns: 1 };
    const fieldOnUpdate = jest.fn().mockReturnValue(updatedContext);

    act(() => {
      const listener = view.getCapturedListener();
      listener?.(makeUpdate({ docChanged: true, field: fieldOnUpdate }));
    });

    expect(result.current).toBe(updatedContext);
  });

  test('falls back to null when reading the field throws during an update', () => {
    const view = makeMockView();
    view.state.field.mockReturnValue({ rows: 2, columns: 2 });
    const { result } = renderHook(() => useTableContext(view as unknown as EditorView));

    const fieldOnUpdate = jest.fn().mockImplementation(() => {
      throw new Error('field not present');
    });

    act(() => {
      const listener = view.getCapturedListener();
      listener?.(makeUpdate({ selectionSet: true, field: fieldOnUpdate }));
    });

    expect(result.current).toBeNull();
  });

  test('ignores updates that are neither selection nor document changes', () => {
    const initialContext = { rows: 3, columns: 3 };
    const view = makeMockView();
    view.state.field.mockReturnValue(initialContext);
    const { result } = renderHook(() => useTableContext(view as unknown as EditorView));

    expect(result.current).toBe(initialContext);

    const fieldOnUpdate = jest.fn().mockReturnValue({ rows: 0, columns: 0 });

    act(() => {
      const listener = view.getCapturedListener();
      listener?.(makeUpdate({ field: fieldOnUpdate }));
    });

    // The listener short-circuits, so the context is unchanged and the field is not read.
    expect(result.current).toBe(initialContext);
    expect(fieldOnUpdate).not.toHaveBeenCalled();
  });
});
