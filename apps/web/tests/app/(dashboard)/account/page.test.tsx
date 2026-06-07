// AccountPage server component redirect behavior.
// Verifies that an unauthenticated user is redirected even when authApi.setupStatus() throws.

import { render } from '@testing-library/react';

jest.mock('@/lib/auth', () => ({
  getProfile: jest.fn(),
}));

jest.mock('@/lib/api', () => ({
  authApi: {
    setupStatus: jest.fn(),
  },
}));

// Real Next.js redirect() throws a NEXT_REDIRECT error — mirror that so code after the
// guard doesn't accidentally run against null values.
jest.mock('next/navigation', () => ({
  redirect: jest.fn().mockImplementation((url: string) => {
    const error = new Error(`NEXT_REDIRECT:${url}`);
    Object.defineProperty(error, 'digest', { value: `NEXT_REDIRECT:${url}` });
    throw error;
  }),
}));

let capturedAvatarKey: string | null | undefined;
jest.mock('@/app/(dashboard)/dashboard/account/display-name-card', () => ({
  DisplayNameCard: ({ avatarKey }: { avatarKey?: string | null }) => {
    capturedAvatarKey = avatarKey;
    return null;
  },
}));

jest.mock('@/app/(dashboard)/dashboard/account/password-card', () => ({
  PasswordCard: () => null,
}));

jest.mock('@/app/(dashboard)/dashboard/account/email-card', () => ({
  EmailCard: () => null,
}));

const defaultPolicy = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireDigits: true,
  requireSymbols: true,
};

describe('AccountPage redirect behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('redirects to /login?reason=expired when getProfile returns null', async () => {
    const { getProfile } = require('@/lib/auth');
    const { authApi } = require('@/lib/api');
    const { redirect } = require('next/navigation');
    const { default: AccountPage } = require('@/app/(dashboard)/dashboard/account/page');

    (getProfile as jest.Mock).mockResolvedValue(null);
    (authApi.setupStatus as jest.Mock).mockResolvedValue({
      configured: true,
      passwordPolicy: defaultPolicy,
    });

    await expect(AccountPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT:/login?reason=expired');
    expect(redirect).toHaveBeenCalledWith('/login?reason=expired');
  });

  test('redirects to login when profile is null even if setupStatus would also reject', async () => {
    const { getProfile } = require('@/lib/auth');
    const { authApi } = require('@/lib/api');
    const { redirect } = require('next/navigation');
    const { default: AccountPage } = require('@/app/(dashboard)/dashboard/account/page');

    (getProfile as jest.Mock).mockResolvedValue(null);
    (authApi.setupStatus as jest.Mock).mockRejectedValue(new Error('API unavailable'));

    await expect(AccountPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT:/login?reason=expired');
    expect(redirect).toHaveBeenCalledWith('/login?reason=expired');
  });

  test('does not redirect when getProfile returns a valid profile', async () => {
    const { getProfile } = require('@/lib/auth');
    const { authApi } = require('@/lib/api');
    const { redirect } = require('next/navigation');
    const { default: AccountPage } = require('@/app/(dashboard)/dashboard/account/page');

    (getProfile as jest.Mock).mockResolvedValue({
      userId: 'user-1',
      displayName: 'Alice',
      email: 'alice@example.com',
    });
    (authApi.setupStatus as jest.Mock).mockResolvedValue({
      configured: true,
      passwordPolicy: defaultPolicy,
    });

    await AccountPage({ searchParams: Promise.resolve({}) });

    expect(redirect).not.toHaveBeenCalled();
  });

  test('passes avatarKey from profile to DisplayNameCard', async () => {
    capturedAvatarKey = undefined;
    const { getProfile } = require('@/lib/auth');
    const { authApi } = require('@/lib/api');
    const { default: AccountPage } = require('@/app/(dashboard)/dashboard/account/page');

    (getProfile as jest.Mock).mockResolvedValue({
      userId: 'user-1',
      displayName: 'Alice',
      email: 'alice@example.com',
      avatarKey: 'bottts-neutral:5',
    });
    (authApi.setupStatus as jest.Mock).mockResolvedValue({
      configured: true,
      passwordPolicy: defaultPolicy,
    });

    const jsx = await AccountPage({ searchParams: Promise.resolve({}) });
    render(jsx);

    expect(capturedAvatarKey).toBe('bottts-neutral:5');
  });
});
