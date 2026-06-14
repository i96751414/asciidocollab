// VerifyEmailRequiredPage tests.
// Requires: @testing-library/react, @testing-library/jest-dom, jest-environment-jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('@/lib/api', () => ({
  adminApi: {
    resendVerification: jest.fn(),
  },
}));

const { adminApi } = require('@/lib/api');
const { default: VerifyEmailRequiredPage } = require('@/app/(auth)/verify-email-required/page');

describe('VerifyEmailRequiredPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders the verify-your-email card with a resend button', () => {
    render(<VerifyEmailRequiredPage />);
    expect(screen.getByRole('heading', { name: /verify your email/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resend verification email/i })).toBeInTheDocument();
  });

  test('shows a success message after a successful resend', async () => {
    adminApi.resendVerification.mockResolvedValue(undefined);
    render(<VerifyEmailRequiredPage />);
    fireEvent.click(screen.getByRole('button', { name: /resend verification email/i }));
    await waitFor(() => expect(screen.getByText(/verification email sent/i)).toBeInTheDocument());
  });

  test('shows a failure message when resend rejects', async () => {
    adminApi.resendVerification.mockRejectedValue(new Error('boom'));
    render(<VerifyEmailRequiredPage />);
    fireEvent.click(screen.getByRole('button', { name: /resend verification email/i }));
    await waitFor(() => expect(screen.getByText(/failed to resend/i)).toBeInTheDocument());
  });
});
