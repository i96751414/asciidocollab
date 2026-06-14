// VerifyEmailPage server-component tests.
// Requires: @testing-library/react, @testing-library/jest-dom, jest-environment-jsdom
import React from 'react';

jest.mock('@/app/(auth)/verify-email/verify-email-content', () => ({
  VerifyEmailContent: ({ token }: { token: string }) => <div data-testid="content">token:{token}</div>,
}));

const { default: VerifyEmailPage } = require('@/app/(auth)/verify-email/page');

describe('VerifyEmailPage', () => {
  test('passes the token from searchParams to the client component', async () => {
    const element = await VerifyEmailPage({ searchParams: Promise.resolve({ token: 'abc' }) });
    expect(element.props.token).toBe('abc');
  });

  test('falls back to an empty token when none is present', async () => {
    const element = await VerifyEmailPage({ searchParams: Promise.resolve({}) });
    expect(element.props.token).toBe('');
  });
});
