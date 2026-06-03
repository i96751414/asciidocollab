'use client';
import { useEffect, useMemo, RefObject } from 'react';

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta']);

function canonicalCombo(event: KeyboardEvent): string {
  if (MODIFIER_KEYS.has(event.key)) return '';
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.shiftKey) parts.push('Shift');
  if (event.altKey) parts.push('Alt');
  if (event.metaKey) parts.push('Meta');
  // Normalize key: uppercase single letters, keep others as-is
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  parts.push(key);
  return parts.join('+');
}

/** Callback handlers invoked by file tree keyboard shortcut actions. */
export interface FileTreeKeyCallbacks {
  /** Called when the rename shortcut is triggered. */
  onRename: () => void;
  /** Called when the delete shortcut is triggered. */
  onDelete: () => void;
  /** Called when the new-file shortcut is triggered. */
  onNewFile: () => void;
  /** Called when the new-folder shortcut is triggered. */
  onNewFolder: () => void;
}

/** Attaches a scoped keydown listener to a container for file tree keyboard shortcuts. */
export function useFileTreeKeyHandler(
  containerReference: RefObject<HTMLElement | null>,
  selectedNodeId: string | null,
  bindings: Map<string, string>,
  callbacks: FileTreeKeyCallbacks,
): void {
  const invertedBindings = useMemo(() => {
    const inverted = new Map<string, string>();
    for (const [action, keyCombo] of bindings) {
      inverted.set(keyCombo, action);
    }
    return inverted;
  }, [bindings]);

  useEffect(() => {
    const element = containerReference.current;
    if (!element) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedNodeId) return;

      const combo = canonicalCombo(event);
      if (!combo) return;

      const action = invertedBindings.get(combo);
      if (!action) return;

      event.preventDefault();
      event.stopPropagation();

      switch (action) {
      case 'file-tree:rename': {
      callbacks.onRename();
      break;
      }
      case 'file-tree:delete': {
      callbacks.onDelete();
      break;
      }
      case 'file-tree:new-file': {
      callbacks.onNewFile();
      break;
      }
      case 'file-tree:new-folder': { {
      callbacks.onNewFolder();
      // No default
      }
      break;
      }
      }
    };

    element.addEventListener('keydown', handleKeyDown);
    return () => element.removeEventListener('keydown', handleKeyDown);
  }, [containerReference, selectedNodeId, invertedBindings, callbacks]);
}
