// ForgotPasswordPage tests.
// Requires: @testing-library/react, @testing-library/jest-dom, jest-environment-jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('@/lib/api', () => ({
  ApiError: jest.requireActual('@/lib/api').ApiError,
  authApi: { requestPasswordReset: jest.fn() },
}));

const { default: ForgotPasswordPage } = require('@/app/(auth)/forgot-password/page');

describe('ForgotPasswordPage', () => {
  test('renders the forgot-password form', () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByRole('form', { name: /forgot password/i })).toBeInTheDocument();
  });
});
