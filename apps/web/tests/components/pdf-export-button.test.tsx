import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PdfExportButton } from '@/components/pdf-export-button';

describe('PdfExportButton', () => {
  test('renders the actionable export trigger when idle', () => {
    render(<PdfExportButton onExport={jest.fn()} isExporting={false} />);
    const button = screen.getByRole('button', { name: /export to pdf/i });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('aria-busy', 'false');
  });

  test('invokes onExport when the idle trigger is clicked', () => {
    const onExport = jest.fn();
    render(<PdfExportButton onExport={onExport} isExporting={false} />);
    fireEvent.click(screen.getByRole('button', { name: /export to pdf/i }));
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  test('while exporting it is busy, disabled, and surfaces the phase progress', () => {
    render(<PdfExportButton onExport={jest.fn()} isExporting phase="converting" />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/generating the pdf/i);
  });

  test('shows a cold-start progress message before the first phase arrives', () => {
    render(<PdfExportButton onExport={jest.fn()} isExporting />);
    expect(screen.getByRole('status')).toHaveTextContent(/\w/);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  test('does not invoke onExport while exporting', () => {
    const onExport = jest.fn();
    render(<PdfExportButton onExport={onExport} isExporting phase="preprocessing" />);
    fireEvent.click(screen.getByRole('button'));
    expect(onExport).not.toHaveBeenCalled();
  });

  test('respects the disabled prop when idle', () => {
    const onExport = jest.fn();
    render(<PdfExportButton onExport={onExport} isExporting={false} disabled />);
    const button = screen.getByRole('button', { name: /export to pdf/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onExport).not.toHaveBeenCalled();
  });
});
