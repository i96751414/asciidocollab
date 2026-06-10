import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResizeHandle } from '@/components/ui/resize-handle';

describe('ResizeHandle', () => {
  it('renders an accessible separator and forwards pointer/keyboard events', () => {
    const onPointerDown = jest.fn();
    const onKeyDown = jest.fn();
    render(<ResizeHandle ariaLabel="Resize file tree" onPointerDown={onPointerDown} onKeyDown={onKeyDown} />);

    const handle = screen.getByRole('separator', { name: 'Resize file tree' });
    expect(handle).toHaveAttribute('aria-orientation', 'vertical');
    fireEvent.pointerDown(handle);
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onPointerDown).toHaveBeenCalled();
    expect(onKeyDown).toHaveBeenCalled();
  });

  it('highlights the line while resizing', () => {
    const { rerender } = render(
      <ResizeHandle ariaLabel="Resize" onPointerDown={jest.fn()} isResizing={false} />,
    );
    const idleLine = screen.getByRole('separator').querySelector('span');
    expect(idleLine?.className).toContain('bg-border');

    rerender(<ResizeHandle ariaLabel="Resize" onPointerDown={jest.fn()} isResizing />);
    const activeLine = screen.getByRole('separator').querySelector('span');
    expect(activeLine?.className).toContain('bg-primary');
  });
});
