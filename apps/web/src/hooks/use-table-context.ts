'use client';
import { useState, useEffect, useRef } from 'react';
import { EditorView } from '@codemirror/view';
import { StateEffect } from '@codemirror/state';
import { tableContextField, type TableContext } from '@/lib/codemirror/asciidoc-table-context';

// Track which EditorView instances already have the update listener installed.
// appendConfig is one-way (no removal API), so we guard against duplicate registration
// when the same view instance is re-passed (e.g. null → same view on re-render).
const viewsWithListener = new WeakSet<EditorView>();

/** Returns the TableContext at the cursor position, or null when the cursor is outside a table. */
export function useTableContext(view: EditorView | null): TableContext | null {
  const [context, setContext] = useState<TableContext | null>(null);
  // Stable ref so the listener closure always calls the current setter,
  // even if the component re-mounts and useState is re-initialized.
  const setContextReference = useRef(setContext);
  setContextReference.current = setContext;

  useEffect(() => {
    if (!view) {
      setContextReference.current(null);
      return;
    }

    try {
      setContextReference.current(view.state.field(tableContextField));
    } catch {
      setContextReference.current(null);
    }

    if (!viewsWithListener.has(view)) {
      viewsWithListener.add(view);
      view.dispatch({
        effects: StateEffect.appendConfig.of(
          EditorView.updateListener.of((upd) => {
            if (upd.selectionSet || upd.docChanged) {
              try {
                setContextReference.current(upd.state.field(tableContextField));
              } catch {
                setContextReference.current(null);
              }
            }
          }),
        ),
      });
    }
  }, [view]);

  return context;
}
