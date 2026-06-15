import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DashboardError from '@/app/(dashboard)/error';

describe('DashboardError', () => {
  test('renders the heading and the error message', () => {
    render(<DashboardError error={new Error('Database exploded')} reset={jest.fn()} />);
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument();
    expect(screen.getByText('Database exploded')).toBeInTheDocument();
  });

  test('falls back to a generic message when the error has no message', () => {
    const error = new Error('placeholder');
    error.message = '';
    render(<DashboardError error={error} reset={jest.fn()} />);
    expect(screen.getByText(/an unexpected error occurred/i)).toBeInTheDocument();
  });

  test('invokes reset when the Try again button is clicked', () => {
    const reset = jest.fn();
    render(<DashboardError error={new Error('boom')} reset={reset} />);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  test('accepts an error carrying a Next.js digest', () => {
    const error = Object.assign(new Error('Tagged'), { digest: 'abc123' });
    render(<DashboardError error={error} reset={jest.fn()} />);
    expect(screen.getByText('Tagged')).toBeInTheDocument();
  });
});
