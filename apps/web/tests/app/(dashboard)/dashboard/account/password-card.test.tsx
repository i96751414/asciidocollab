import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PasswordCard } from '@/app/(dashboard)/dashboard/account/password-card';

const mockChangePassword = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/api', () => ({
  authApi: {
    changePassword: (...arguments_: unknown[]) => mockChangePassword(...arguments_),
  },
  ApiError: class ApiError extends Error {},
}));

const policy = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireDigits: true,
  requireSymbols: true,
};

const VALID_PASSWORD = 'NewPassw0rd!!';

function fillForm({ current = 'OldPassw0rd!!', next = VALID_PASSWORD, confirm = VALID_PASSWORD } = {}) {
  fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: current } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: next } });
  fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: confirm } });
}

describe('PasswordCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChangePassword.mockResolvedValue(undefined);
  });

  test('disables the save button until the form is valid', () => {
    render(<PasswordCard passwordPolicy={policy} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fillForm();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  test('shows a policy validation error for a too-weak new password', async () => {
    render(<PasswordCard passwordPolicy={policy} />);
    const newPassword = screen.getByLabelText('New password');
    fireEvent.change(newPassword, { target: { value: 'short' } });
    fireEvent.blur(newPassword);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/at least 12 characters/i);
    });
  });

  test('shows a mismatch error when confirm differs from the new password', async () => {
    render(<PasswordCard passwordPolicy={policy} />);
    fillForm({ confirm: 'Different0!!!' });
    fireEvent.blur(screen.getByLabelText(/confirm new password/i));
    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
  });

  test('hides the confirm error while the new password itself is invalid', () => {
    render(<PasswordCard passwordPolicy={policy} />);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'weak' } });
    fireEvent.blur(screen.getByLabelText('New password'));
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'x' } });
    fireEvent.blur(screen.getByLabelText(/confirm new password/i));
    expect(screen.queryByText(/passwords do not match/i)).not.toBeInTheDocument();
  });

  test('submits and shows the success message, then clears the inputs', async () => {
    render(<PasswordCard passwordPolicy={policy} />);
    fillForm();
    fireEvent.submit(screen.getByRole('form', { name: /change password/i }));
    await waitFor(() => {
      expect(mockChangePassword).toHaveBeenCalledWith('OldPassw0rd!!', VALID_PASSWORD);
    });
    expect(await screen.findByRole('status')).toHaveTextContent(/password updated/i);
    expect(screen.getByLabelText('New password')).toHaveValue('');
  });

  test('marks all fields touched on an invalid submit without calling the API', async () => {
    render(<PasswordCard passwordPolicy={policy} />);
    fireEvent.submit(screen.getByRole('form', { name: /change password/i }));
    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    });
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  test('shows the ApiError message when the change fails', async () => {
    const { ApiError } = require('@/lib/api');
    mockChangePassword.mockRejectedValueOnce(new ApiError('Current password incorrect'));
    render(<PasswordCard passwordPolicy={policy} />);
    fillForm();
    fireEvent.submit(screen.getByRole('form', { name: /change password/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/current password incorrect/i);
    });
  });

  test('shows a generic message when the change fails with a non-ApiError', async () => {
    mockChangePassword.mockRejectedValueOnce(new Error('network'));
    render(<PasswordCard passwordPolicy={policy} />);
    fillForm();
    fireEvent.submit(screen.getByRole('form', { name: /change password/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/password change failed/i);
    });
  });

  test('clears the success message after the timeout elapses', async () => {
    jest.useFakeTimers();
    try {
      render(<PasswordCard passwordPolicy={policy} />);
      fillForm();
      await act(async () => {
        fireEvent.submit(screen.getByRole('form', { name: /change password/i }));
      });
      expect(screen.getByRole('status')).toHaveTextContent(/password updated/i);
      act(() => {
        jest.advanceTimersByTime(3000);
      });
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });
});
