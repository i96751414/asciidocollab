import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PreviewModeToggle } from '@/components/preview-mode-toggle';

describe('PreviewModeToggle', () => {
  test('renders both the HTML and PDF mode buttons', () => {
    render(<PreviewModeToggle mode="html" onModeChange={jest.fn()} />);
    expect(screen.getByTestId('preview-mode-html')).toHaveTextContent('HTML');
    expect(screen.getByTestId('preview-mode-pdf')).toHaveTextContent('PDF');
  });

  test('marks the HTML button as pressed when the mode is html', () => {
    render(<PreviewModeToggle mode="html" onModeChange={jest.fn()} />);
    expect(screen.getByTestId('preview-mode-html')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('preview-mode-pdf')).toHaveAttribute('aria-pressed', 'false');
  });

  test('marks the PDF button as pressed when the mode is pdf', () => {
    render(<PreviewModeToggle mode="pdf" onModeChange={jest.fn()} />);
    expect(screen.getByTestId('preview-mode-pdf')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('preview-mode-html')).toHaveAttribute('aria-pressed', 'false');
  });

  test('applies the active styling to whichever mode is selected', () => {
    const { rerender } = render(<PreviewModeToggle mode="html" onModeChange={jest.fn()} />);
    expect(screen.getByTestId('preview-mode-html')).toHaveClass('bg-muted');
    expect(screen.getByTestId('preview-mode-pdf')).toHaveClass('text-muted-foreground');

    rerender(<PreviewModeToggle mode="pdf" onModeChange={jest.fn()} />);
    expect(screen.getByTestId('preview-mode-pdf')).toHaveClass('bg-muted');
    expect(screen.getByTestId('preview-mode-html')).toHaveClass('text-muted-foreground');
  });

  test('invokes onModeChange with html when the HTML button is clicked', () => {
    const onModeChange = jest.fn();
    render(<PreviewModeToggle mode="pdf" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByTestId('preview-mode-html'));
    expect(onModeChange).toHaveBeenCalledTimes(1);
    expect(onModeChange).toHaveBeenCalledWith('html');
  });

  test('invokes onModeChange with pdf when the PDF button is clicked', () => {
    const onModeChange = jest.fn();
    render(<PreviewModeToggle mode="html" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByTestId('preview-mode-pdf'));
    expect(onModeChange).toHaveBeenCalledTimes(1);
    expect(onModeChange).toHaveBeenCalledWith('pdf');
  });

  test('exposes the two buttons through the labelled mode group', () => {
    render(<PreviewModeToggle mode="html" onModeChange={jest.fn()} />);
    const group = screen.getByRole('group', { name: /preview mode/i });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
