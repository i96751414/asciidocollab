// ResetPasswordPage server-component tests.
// Requires: @testing-library/react, @testing-library/jest-dom, jest-environment-jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import type { PasswordPolicyDto } from '@asciidocollab/shared';

const defaultPolicy: PasswordPolicyDto = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireDigits: true,
  requireSymbols: true,
};

jest.mock('@/lib/api', () => ({
  ApiError: jest.requireActual('@/lib/api').ApiError,
  authApi: { setupStatus: jest.fn() },
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

jest.mock('@/app/(auth)/reset-password/reset-password-form', () => ({
  ResetPasswordForm: ({ token, passwordPolicy }: { token: string; passwordPolicy: PasswordPolicyDto }) => (
    <div data-testid="form" data-token={token} data-min={passwordPolicy.minLength} />
  ),
}));

const { authApi } = require('@/lib/api');
const { default: ResetPasswordPage } = require('@/app/(auth)/reset-password/page');

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('shows an invalid-link message when no token is present', async () => {
    const element = await ResetPasswordPage({ searchParams: Promise.resolve({}) });
    render(element);
    expect(screen.getByText(/this reset link is invalid or has expired/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /request a new reset link/i })).toBeInTheDocument();
    expect(authApi.setupStatus).not.toHaveBeenCalled();
  });

  test('renders the form with the token and policy when a token is present', async () => {
    authApi.setupStatus.mockResolvedValue({ passwordPolicy: defaultPolicy });
    const element = await ResetPasswordPage({ searchParams: Promise.resolve({ token: 'tok' }) });
    render(element);
    const form = screen.getByTestId('form');
    expect(form).toHaveAttribute('data-token', 'tok');
    expect(form).toHaveAttribute('data-min', '12');
  });
});
