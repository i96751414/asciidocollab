// ForgotPasswordForm component tests.
// Requires: @testing-library/react, @testing-library/jest-dom, jest-environment-jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ForgotPasswordForm } from '@/app/(auth)/forgot-password/forgot-password-form';

jest.mock('@/lib/api', () => ({
  ApiError: jest.requireActual('@/lib/api').ApiError,
  authApi: {
    requestPasswordReset: jest.fn(),
  },
}));

const { authApi, ApiError } = require('@/lib/api');

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders the email field', () => {
    render(<ForgotPasswordForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  test('disables submit until a valid email is entered', () => {
    render(<ForgotPasswordForm />);
    const button = screen.getByRole('button', { name: /send reset link/i });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    expect(button).toBeEnabled();
  });

  test('shows a validation error on blur for an invalid email', async () => {
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'not-an-email' } });
    fireEvent.blur(screen.getByLabelText(/email/i));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/valid email address/i));
  });

  test('does not call the API when submitting an invalid form', async () => {
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'bad' } });
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/valid email address/i));
    expect(authApi.requestPasswordReset).not.toHaveBeenCalled();
  });

  test('shows the check-email confirmation on success', async () => {
    authApi.requestPasswordReset.mockResolvedValue({ message: 'ok' });
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@example.com' } });
    fireEvent.submit(screen.getByRole('form'));

    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument());
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
    expect(authApi.requestPasswordReset).toHaveBeenCalledWith('user@example.com');
  });

  test('shows the API error message on an ApiError', async () => {
    authApi.requestPasswordReset.mockRejectedValue(new ApiError(429, 'RATE_LIMITED', 'Slow down'));
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@example.com' } });
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(screen.getByText(/slow down/i)).toBeInTheDocument());
  });

  test('shows a generic error message on a non-ApiError', async () => {
    authApi.requestPasswordReset.mockRejectedValue(new Error('network down'));
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@example.com' } });
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(screen.getByText(/something went wrong\. please try again/i)).toBeInTheDocument());
  });

  test('shows the pending label while the request is in flight', () => {
    authApi.requestPasswordReset.mockImplementation(() => new Promise(() => {}));
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@example.com' } });
    fireEvent.submit(screen.getByRole('form'));
    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();
  });
});
