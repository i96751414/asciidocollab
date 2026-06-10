import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { usePanelResize } from '@/hooks/use-panel-resize';

const pointer = (clientX: number) =>
  ({ clientX, preventDefault: jest.fn() }) as unknown as React.PointerEvent;
const key = (k: string, shiftKey = false) =>
  ({ key: k, shiftKey, preventDefault: jest.fn() }) as unknown as React.KeyboardEvent;

beforeEach(() => localStorage.clear());

describe('usePanelResize', () => {
  it('starts at the initial width', () => {
    const { result } = renderHook(() => usePanelResize({ initialWidth: 200, min: 100, max: 400, side: 'start' }));
    expect(result.current.width).toBe(200);
  });

  it('a start panel grows when the divider is dragged right', () => {
    const { result } = renderHook(() => usePanelResize({ initialWidth: 200, min: 100, max: 400, side: 'start' }));
    act(() => result.current.onPointerDown(pointer(300)));
    act(() => { document.dispatchEvent(new MouseEvent('pointermove', { clientX: 350 })); });
    expect(result.current.width).toBe(250);
    act(() => { document.dispatchEvent(new MouseEvent('pointerup')); });
    expect(result.current.isResizing).toBe(false);
  });

  it('an end panel grows when the divider is dragged left', () => {
    const { result } = renderHook(() => usePanelResize({ initialWidth: 200, min: 100, max: 400, side: 'end' }));
    act(() => result.current.onPointerDown(pointer(500)));
    act(() => { document.dispatchEvent(new MouseEvent('pointermove', { clientX: 460 })); });
    expect(result.current.width).toBe(240);
    act(() => { document.dispatchEvent(new MouseEvent('pointerup')); });
  });

  it('clamps the width to [min, max]', () => {
    const { result } = renderHook(() => usePanelResize({ initialWidth: 200, min: 150, max: 250, side: 'start' }));
    act(() => result.current.onPointerDown(pointer(0)));
    act(() => { document.dispatchEvent(new MouseEvent('pointermove', { clientX: 5000 })); });
    expect(result.current.width).toBe(250);
    act(() => { document.dispatchEvent(new MouseEvent('pointermove', { clientX: -5000 })); });
    expect(result.current.width).toBe(150);
    act(() => { document.dispatchEvent(new MouseEvent('pointerup')); });
  });

  it('arrow keys resize (Shift = larger step), respecting the side', () => {
    const { result } = renderHook(() => usePanelResize({ initialWidth: 200, min: 100, max: 400, side: 'start' }));
    act(() => result.current.onKeyDown(key('ArrowRight')));
    expect(result.current.width).toBe(208);
    act(() => result.current.onKeyDown(key('ArrowLeft', true)));
    expect(result.current.width).toBe(176);
  });

  it('ignores non-arrow keys', () => {
    const { result } = renderHook(() => usePanelResize({ initialWidth: 200, min: 100, max: 400, side: 'start' }));
    act(() => result.current.onKeyDown(key('Enter')));
    expect(result.current.width).toBe(200);
  });

  it('works without a storageKey (no persistence)', () => {
    const { result } = renderHook(() => usePanelResize({ initialWidth: 200, min: 100, max: 400, side: 'start' }));
    act(() => result.current.onPointerDown(pointer(100)));
    act(() => { document.dispatchEvent(new MouseEvent('pointermove', { clientX: 130 })); });
    act(() => { document.dispatchEvent(new MouseEvent('pointerup')); });
    expect(result.current.width).toBe(230);
  });

  it('persists the width and restores it on a later mount', () => {
    const { result, unmount } = renderHook(() =>
      usePanelResize({ initialWidth: 200, min: 100, max: 400, side: 'start', storageKey: 'k' }),
    );
    act(() => result.current.onKeyDown(key('ArrowRight')));
    expect(localStorage.getItem('k')).toBe('208');
    unmount();

    const { result: restored } = renderHook(() =>
      usePanelResize({ initialWidth: 200, min: 100, max: 400, side: 'start', storageKey: 'k' }),
    );
    expect(restored.current.width).toBe(208);
  });
});
