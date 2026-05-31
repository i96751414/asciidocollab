import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmationDialog } from '@/components/confirmation-dialog';

describe('ConfirmationDialog', () => {
  test('renders title and description when open', () => {
    render(
      <ConfirmationDialog
        open={true}
        onOpenChange={jest.fn()}
        title="Remove member"
        description="Are you sure you want to remove this member?"
        onConfirm={jest.fn()}
      />,
    );
    expect(screen.getByText('Remove member')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to remove this member?')).toBeInTheDocument();
  });

  test('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = jest.fn();
    render(
      <ConfirmationDialog
        open={true}
        onOpenChange={jest.fn()}
        title="Delete"
        description="Permanent."
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test('calls onOpenChange(false) when cancel is clicked', () => {
    const onOpenChange = jest.fn();
    render(
      <ConfirmationDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Delete"
        description="Permanent."
        onConfirm={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test('does not render content when closed', () => {
    render(
      <ConfirmationDialog
        open={false}
        onOpenChange={jest.fn()}
        title="Hidden title"
        description="Hidden."
        onConfirm={jest.fn()}
      />,
    );
    expect(screen.queryByText('Hidden title')).not.toBeInTheDocument();
  });
});
