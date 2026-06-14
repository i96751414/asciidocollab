// VerifyEmailContent component tests.
// Requires: @testing-library/react, @testing-library/jest-dom, jest-environment-jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VerifyEmailContent } from '@/app/(auth)/verify-email/verify-email-content';

jest.mock('@/lib/api', () => ({
  ApiError: jest.requireActual('@/lib/api').ApiError,
  adminApi: {
    verifyEmail: jest.fn(),
    getSessionStatus: jest.fn(),
    resendVerification: jest.fn(),
  },
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const { adminApi, ApiError } = require('@/lib/api');

describe('VerifyEmailContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  test('shows the error state immediately when no token is present', async () => {
    render(<VerifyEmailContent token="" />);
    await waitFor(() => expect(screen.getByText(/verification failed/i)).toBeInTheDocument());
    expect(adminApi.verifyEmail).not.toHaveBeenCalled();
  });

  test('shows the verifying state while the request is in flight', () => {
    adminApi.verifyEmail.mockReturnValue(new Promise(() => {}));
    render(<VerifyEmailContent token="tok" />);
    expect(screen.getByText(/verifying your email/i)).toBeInTheDocument();
  });

  test('shows the redirect state and navigates when the session is verified', async () => {
    jest.useFakeTimers();
    const router = { push: jest.fn() };
    jest.spyOn(require('next/navigation'), 'useRouter').mockReturnValue(router);
    adminApi.verifyEmail.mockResolvedValue(undefined);
    adminApi.getSessionStatus.mockResolvedValue({ authenticated: true, emailVerified: true, isAdmin: false });

    render(<VerifyEmailContent token="tok" />);
    await waitFor(() => expect(screen.getByText(/redirecting to your dashboard/i)).toBeInTheDocument());

    jest.advanceTimersByTime(2000);
    expect(router.push).toHaveBeenCalledWith('/dashboard');
    jest.useRealTimers();
  });

  test('shows the log-in prompt when the session is not upgraded', async () => {
    adminApi.verifyEmail.mockResolvedValue(undefined);
    adminApi.getSessionStatus.mockResolvedValue({ authenticated: false, emailVerified: false, isAdmin: false });

    render(<VerifyEmailContent token="tok" />);
    await waitFor(() => expect(screen.getByText(/please log in to continue/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

  test('falls back to the log-in prompt when getSessionStatus rejects', async () => {
    adminApi.verifyEmail.mockResolvedValue(undefined);
    adminApi.getSessionStatus.mockRejectedValue(new Error('boom'));

    render(<VerifyEmailContent token="tok" />);
    await waitFor(() => expect(screen.getByText(/please log in to continue/i)).toBeInTheDocument());
  });

  test('shows the expired state for an INVALID_TOKEN ApiError', async () => {
    adminApi.verifyEmail.mockRejectedValue(new ApiError(400, 'INVALID_TOKEN', 'expired'));
    render(<VerifyEmailContent token="tok" />);
    await waitFor(() => expect(screen.getByText(/this verification link has expired/i)).toBeInTheDocument());
  });

  test('shows the generic error state for a non-token failure', async () => {
    adminApi.verifyEmail.mockRejectedValue(new Error('network down'));
    render(<VerifyEmailContent token="tok" />);
    await waitFor(() => expect(screen.getByText(/something went wrong\. please try again/i)).toBeInTheDocument());
  });

  test('resends the verification email and shows a success message', async () => {
    adminApi.verifyEmail.mockRejectedValue(new Error('network down'));
    adminApi.resendVerification.mockResolvedValue(undefined);

    render(<VerifyEmailContent token="tok" />);
    await waitFor(() => screen.getByRole('button', { name: /resend verification email/i }));
    fireEvent.click(screen.getByRole('button', { name: /resend verification email/i }));

    await waitFor(() => expect(screen.getByText(/verification email sent/i)).toBeInTheDocument());
  });

  test('shows a failure message when resend rejects', async () => {
    adminApi.verifyEmail.mockRejectedValue(new Error('network down'));
    adminApi.resendVerification.mockRejectedValue(new Error('boom'));

    render(<VerifyEmailContent token="tok" />);
    await waitFor(() => screen.getByRole('button', { name: /resend verification email/i }));
    fireEvent.click(screen.getByRole('button', { name: /resend verification email/i }));

    await waitFor(() => expect(screen.getByText(/failed to resend/i)).toBeInTheDocument());
  });
});
