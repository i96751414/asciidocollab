// AcceptInvitePage server-component tests.
// Requires: @testing-library/react, @testing-library/jest-dom, jest-environment-jsdom
import React from 'react';

jest.mock('@/app/(auth)/accept-invite/accept-invite-form', () => ({
  AcceptInviteForm: ({ token }: { token: string }) => <div data-testid="form">token:{token}</div>,
}));

const { default: AcceptInvitePage } = require('@/app/(auth)/accept-invite/page');

describe('AcceptInvitePage', () => {
  test('passes the token from searchParams to the form', async () => {
    const element = await AcceptInvitePage({ searchParams: Promise.resolve({ token: 'abc' }) });
    expect(element.props.token).toBe('abc');
  });

  test('falls back to an empty token when none is present', async () => {
    const element = await AcceptInvitePage({ searchParams: Promise.resolve({}) });
    expect(element.props.token).toBe('');
  });
});
