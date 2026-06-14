// EmailConfirmPage server-component tests.
// Requires: @testing-library/react, @testing-library/jest-dom, jest-environment-jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

const { redirect } = require('next/navigation');
const { default: EmailConfirmPage } = require('@/app/(auth)/email-confirm/page');

describe('EmailConfirmPage', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('shows an invalid-link message when no token is present', async () => {
    const element = await EmailConfirmPage({ searchParams: Promise.resolve({}) });
    render(element);
    expect(screen.getByText(/this confirmation link is invalid or has expired/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to account/i })).toBeInTheDocument();
  });

  test('redirects to the account page on a successful confirmation', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true });
    const result = await EmailConfirmPage({ searchParams: Promise.resolve({ token: 'tok' }) });
    expect(redirect).toHaveBeenCalledWith('/dashboard/account?confirmed=email');
    expect(result).toBeUndefined();
  });

  test('shows the server error message when the API responds with an error', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: jest.fn().mockResolvedValue({ error: { message: 'Token already used' } }),
    });
    const element = await EmailConfirmPage({ searchParams: Promise.resolve({ token: 'tok' }) });
    render(element);
    expect(screen.getByText(/token already used/i)).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });

  test('falls back to a default message when the error body has no message', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: jest.fn().mockResolvedValue({}),
    });
    const element = await EmailConfirmPage({ searchParams: Promise.resolve({ token: 'tok' }) });
    render(element);
    expect(screen.getByText(/this confirmation link is invalid or has expired/i)).toBeInTheDocument();
  });

  test('shows a generic message when the JSON body cannot be parsed', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: jest.fn().mockRejectedValue(new Error('bad json')),
    });
    const element = await EmailConfirmPage({ searchParams: Promise.resolve({ token: 'tok' }) });
    render(element);
    expect(screen.getByText(/this confirmation link is invalid or has expired/i)).toBeInTheDocument();
  });

  test('shows a network-error message when fetch throws', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    const element = await EmailConfirmPage({ searchParams: Promise.resolve({ token: 'tok' }) });
    render(element);
    expect(screen.getByText(/something went wrong\. please try again or request a new confirmation link/i)).toBeInTheDocument();
  });
});
