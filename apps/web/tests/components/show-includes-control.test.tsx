import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShowIncludesControl } from '@/components/show-includes-control';

// [] — ShowIncludesControl toggle
// These tests FAIL until implements the component at
// apps/web/src/components/show-includes-control.tsx.

describe('ShowIncludesControl', () => {
  it('renders a button with aria-pressed="true" when value is true', () => {
    render(<ShowIncludesControl value={true} onChange={jest.fn()} />);
    expect(screen.getByTestId('show-includes-toggle')).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders a button with aria-pressed="false" when value is false', () => {
    render(<ShowIncludesControl value={false} onChange={jest.fn()} />);
    expect(screen.getByTestId('show-includes-toggle')).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange(false) when clicked while value is true', () => {
    const onChange = jest.fn();
    render(<ShowIncludesControl value={true} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('show-includes-toggle'));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('calls onChange(true) when clicked while value is false', () => {
    const onChange = jest.fn();
    render(<ShowIncludesControl value={false} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('show-includes-toggle'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('has data-testid="show-includes-toggle"', () => {
    render(<ShowIncludesControl value={false} onChange={jest.fn()} />);
    expect(screen.getByTestId('show-includes-toggle')).toBeInTheDocument();
  });
});
