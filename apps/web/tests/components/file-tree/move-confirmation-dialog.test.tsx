import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MoveConfirmationDialog } from '@/components/file-tree/move-confirmation-dialog';

describe('MoveConfirmationDialog — non-conflict variant', () => {
  const defaultProps = {
    open: true,
    onOpenChange: jest.fn(),
    sourcePath: '/folder-a/document.adoc',
    destinationPath: '/folder-b',
    hasConflict: false,
    onConfirm: jest.fn(),
    onConfirmAndRename: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders source and destination paths', () => {
    render(<MoveConfirmationDialog {...defaultProps} />);
    expect(screen.getByText(/folder-a\/document\.adoc/)).toBeInTheDocument();
    expect(screen.getByText(/folder-b/)).toBeInTheDocument();
  });

  test('shows Cancel and Confirm buttons (no rename option)', () => {
    render(<MoveConfirmationDialog {...defaultProps} />);
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /rename/i })).not.toBeInTheDocument();
  });

  test('Confirm button calls onConfirm', () => {
    render(<MoveConfirmationDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  test('Cancel button calls onOpenChange(false)', () => {
    render(<MoveConfirmationDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('MoveConfirmationDialog — conflict variant', () => {
  const conflictProperties = {
    open: true,
    onOpenChange: jest.fn(),
    sourcePath: '/folder-a/document.adoc',
    destinationPath: '/folder-b',
    hasConflict: true,
    onConfirm: jest.fn(),
    onConfirmAndRename: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('shows name conflict warning when hasConflict=true', () => {
    render(<MoveConfirmationDialog {...conflictProperties} />);
    expect(screen.getByText(/already exists|conflict|same name/i)).toBeInTheDocument();
  });

  test('shows "Move & Rename" option in conflict mode', () => {
    render(<MoveConfirmationDialog {...conflictProperties} />);
    expect(screen.getByRole('button', { name: /move.*rename|rename/i })).toBeInTheDocument();
  });

  test('"Move & Rename" calls onConfirmAndRename', () => {
    render(<MoveConfirmationDialog {...conflictProperties} />);
    fireEvent.click(screen.getByRole('button', { name: /move.*rename|rename/i }));
    expect(conflictProperties.onConfirmAndRename).toHaveBeenCalledTimes(1);
  });

  test('Cancel fires no action (only onOpenChange(false))', () => {
    render(<MoveConfirmationDialog {...conflictProperties} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(conflictProperties.onOpenChange).toHaveBeenCalledWith(false);
    expect(conflictProperties.onConfirm).not.toHaveBeenCalled();
    expect(conflictProperties.onConfirmAndRename).not.toHaveBeenCalled();
  });

  test('dialog is not shown when open=false', () => {
    render(<MoveConfirmationDialog {...conflictProperties} open={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
