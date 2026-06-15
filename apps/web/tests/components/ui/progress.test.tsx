import React from 'react';
import { render, screen } from '@testing-library/react';
import { Progress } from '@/components/ui/progress';

describe('Progress', () => {
  test('defaults to 0 when no value is supplied', () => {
    render(<Progress />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  test('reflects the supplied value and merges a custom className', () => {
    render(<Progress value={50} className="custom-bar" />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(bar).toHaveClass('custom-bar');
    expect(bar.firstElementChild).toHaveStyle({ transform: 'translateX(-50%)' });
  });

  test('treats an explicit undefined value as 0', () => {
    render(<Progress value={undefined} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar.firstElementChild).toHaveStyle({ transform: 'translateX(-100%)' });
  });

  test('renders a full bar at 100', () => {
    render(<Progress value={100} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar.firstElementChild).toHaveStyle({ transform: 'translateX(-0%)' });
  });

  test('forwards a ref and spreads extra props', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<Progress ref={ref} value={25} data-testid="prog" />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(screen.getByTestId('prog')).toBe(screen.getByRole('progressbar'));
  });
});
