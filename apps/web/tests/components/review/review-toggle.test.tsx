/* @jest-environment jsdom */
/**
 * Tests for the feature 038 {@link ReviewToggle} toolbar button: it shows the open-item count as a
 * badge (hidden at zero), reflects the open/closed state, and toggles on click.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReviewToggle } from '@/components/review/review-toggle';

test('renders the open count badge when there are open items', () => {
  render(<ReviewToggle openCount={3} isOpen={false} onToggle={() => {}} />);
  expect(screen.getByTestId('review-toggle-count')).toHaveTextContent('3');
});

test('hides the badge when there are no open items', () => {
  render(<ReviewToggle openCount={0} isOpen={false} onToggle={() => {}} />);
  expect(screen.queryByTestId('review-toggle-count')).toBeNull();
});

test('reflects the open state via aria-pressed', () => {
  const { rerender } = render(<ReviewToggle openCount={1} isOpen={false} onToggle={() => {}} />);
  expect(screen.getByTestId('review-toggle')).toHaveAttribute('aria-pressed', 'false');
  rerender(<ReviewToggle openCount={1} isOpen onToggle={() => {}} />);
  expect(screen.getByTestId('review-toggle')).toHaveAttribute('aria-pressed', 'true');
});

test('invokes onToggle on click', () => {
  const onToggle = jest.fn();
  render(<ReviewToggle openCount={0} isOpen={false} onToggle={onToggle} />);
  fireEvent.click(screen.getByTestId('review-toggle'));
  expect(onToggle).toHaveBeenCalledTimes(1);
});
