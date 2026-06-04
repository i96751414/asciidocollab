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

/**
 * Maps action identifiers to their handler functions.
 * Pass `undefined` for actions that are currently inactive — the hook only fires a handler
 * when it is defined, so callers control availability without coupling the hook to domain state.
 */
export type FileTreeKeyCallbacks = Record<string, (() => void) | undefined>;

/** Attaches a scoped keydown listener to a container for file tree keyboard shortcuts. */
export function useFileTreeKeyHandler(
  containerReference: RefObject<HTMLElement | null>,
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
      const combo = canonicalCombo(event);
      if (!combo) return;
      const action = invertedBindings.get(combo);
      if (!action) return;
      const callback = callbacks[action];
      if (!callback) return;
      event.preventDefault();
      event.stopPropagation();
      callback();
    };

    element.addEventListener('keydown', handleKeyDown);
    return () => element.removeEventListener('keydown', handleKeyDown);
  }, [containerReference, invertedBindings, callbacks]);
}
