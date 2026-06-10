'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

interface UsePanelResizeOptions {
  /** Width used before any persisted value is loaded. */
  initialWidth: number;
  /** Smallest allowed width in pixels. */
  min: number;
  /** Largest allowed width in pixels. */
  max: number;
  // Which side the resizable panel sits on. A start panel such as the left file tree grows when
  // the divider is dragged right, while an end panel such as the right outline grows when dragged left.
  side: 'start' | 'end';
  /** When set, the width is persisted to localStorage under this key and restored on mount. */
  storageKey?: string;
}

interface UsePanelResizeResult {
  // Current panel width in pixels — apply via an inline style width.
  width: number;
  // True while a drag is in progress (use to highlight the handle).
  isResizing: boolean;
  // Attach to the divider's onPointerDown to start a drag.
  onPointerDown: (event: React.PointerEvent) => void;
  // Attach to the divider's onKeyDown for keyboard resizing (arrow keys; Shift for a larger step).
  onKeyDown: (event: React.KeyboardEvent) => void;
}

/**
 * Drag-to-resize state for a side panel. Pointer events are tracked on `document` so the drag
 * keeps working when the cursor leaves the thin handle, and the body cursor/selection are locked
 * for the duration so the resize feels solid and never selects text.
 */
export function usePanelResize({ initialWidth, min, max, side, storageKey }: UsePanelResizeOptions): UsePanelResizeResult {
  const [width, setWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);

  // Hydrate the persisted width after mount (keeps SSR markup deterministic).
  useEffect(() => {
    if (!storageKey) return;
    const stored = Number(localStorage.getItem(storageKey));
    if (Number.isFinite(stored) && stored > 0) setWidth(clamp(stored, min, max));
  }, [storageKey, min, max]);

  const widthReference = useRef(width);
  widthReference.current = width;

  const persist = useCallback((value: number) => {
    if (storageKey) localStorage.setItem(storageKey, String(value));
  }, [storageKey]);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = widthReference.current;
    setIsResizing(true);

    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const delta = side === 'end' ? -dx : dx;
      setWidth(clamp(startWidth + delta, min, max));
    };
    const onUp = () => {
      setIsResizing(false);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
      persist(widthReference.current);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [side, min, max, persist]);

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = (event.shiftKey ? 32 : 8) * (event.key === 'ArrowRight' ? 1 : -1);
    const delta = side === 'end' ? -step : step;
    const next = clamp(widthReference.current + delta, min, max);
    setWidth(next);
    persist(next);
  }, [side, min, max, persist]);

  return { width, isResizing, onPointerDown, onKeyDown };
}
