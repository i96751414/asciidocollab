// ResetPasswordForm component tests.
// Requires: @testing-library/react, @testing-library/jest-dom, jest-environment-jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ResetPasswordForm } from '@/app/(auth)/reset-password/reset-password-form';
import type { PasswordPolicyDto } from '@asciidocollab/shared';

const defaultPolicy: PasswordPolicyDto = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireDigits: true,
  requireSymbols: true,
};

const VALID_PASSWORD = 'SecurePass1!';

jest.mock('@/lib/api', () => ({
  ApiError: jest.requireActual('@/lib/api').ApiError,
  authApi: {
    resetPassword: jest.fn(),
  },
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const { authApi, ApiError } = require('@/lib/api');

function fillValidForm() {
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: VALID_PASSWORD } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: VALID_PASSWORD } });
}

describe('ResetPasswordForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders both password fields', () => {
    render(<ResetPasswordForm token="tok" passwordPolicy={defaultPolicy} />);
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm new password')).toBeInTheDocument();
  });

  test('shows a password error on blur for a weak password', async () => {
    render(<ResetPasswordForm token="tok" passwordPolicy={defaultPolicy} />);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'weak' } });
    fireEvent.blur(screen.getByLabelText('New password'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/at least 12 characters/i));
  });

  test('shows a mismatch error and clears it when corrected', async () => {
    render(<ResetPasswordForm token="tok" passwordPolicy={defaultPolicy} />);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: VALID_PASSWORD } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'different' } });
    fireEvent.blur(screen.getByLabelText('Confirm new password'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/passwords do not match/i));

    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: VALID_PASSWORD } });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  test('disables submit until the form is valid', () => {
    render(<ResetPasswordForm token="tok" passwordPolicy={defaultPolicy} />);
    const button = screen.getByRole('button', { name: /reset password/i });
    expect(button).toBeDisabled();
    fillValidForm();
    expect(button).toBeEnabled();
  });

  test('does not call the API when submitting an invalid form', async () => {
    render(<ResetPasswordForm token="tok" passwordPolicy={defaultPolicy} />);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'weak' } });
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(authApi.resetPassword).not.toHaveBeenCalled();
  });

  test('redirects to /login on a successful reset', async () => {
    const router = { push: jest.fn() };
    jest.spyOn(require('next/navigation'), 'useRouter').mockReturnValue(router);
    authApi.resetPassword.mockResolvedValue({ message: 'ok' });

    render(<ResetPasswordForm token="tok" passwordPolicy={defaultPolicy} />);
    fillValidForm();
    fireEvent.submit(screen.getByRole('form'));

    await waitFor(() => {
      expect(authApi.resetPassword).toHaveBeenCalledWith('tok', VALID_PASSWORD);
      expect(router.push).toHaveBeenCalledWith('/login');
    });
  });

  test('shows the API error message on an ApiError', async () => {
    authApi.resetPassword.mockRejectedValue(new ApiError(400, 'INVALID_TOKEN', 'Token expired'));
    render(<ResetPasswordForm token="tok" passwordPolicy={defaultPolicy} />);
    fillValidForm();
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(screen.getByText(/token expired/i)).toBeInTheDocument());
  });

  test('shows a generic error message on a non-ApiError', async () => {
    authApi.resetPassword.mockRejectedValue(new Error('network down'));
    render(<ResetPasswordForm token="tok" passwordPolicy={defaultPolicy} />);
    fillValidForm();
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(screen.getByText(/password reset failed\. please request a new link/i)).toBeInTheDocument());
  });

  test('shows the pending label while the request is in flight', () => {
    authApi.resetPassword.mockImplementation(() => new Promise(() => {}));
    render(<ResetPasswordForm token="tok" passwordPolicy={defaultPolicy} />);
    fillValidForm();
    fireEvent.submit(screen.getByRole('form'));
    expect(screen.getByRole('button', { name: /resetting/i })).toBeDisabled();
  });
});
