// RegisterForm component tests and RegisterPage server component redirect behavior.
// Requires: @testing-library/react, @testing-library/jest-dom, jest-environment-jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RegisterForm } from '@/app/(auth)/register/register-form';

jest.mock('@/lib/api', () => ({
  authApi: {
    register: jest.fn(),
    setupStatus: jest.fn().mockResolvedValue({ configured: false }),
  },
}));

jest.mock('@/lib/auth', () => ({
  getSession: jest.fn().mockResolvedValue(null),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  redirect: jest.fn(),
}));

describe('RegisterForm (first-run setup)', () => {
  const { authApi } = require('@/lib/api');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('shows "Set up your account" heading when configured: false', () => {
    render(<RegisterForm isFirstRun={true} />);
    expect(screen.getByText(/set up your account/i)).toBeInTheDocument();
  });

  test('shows password validation error for weak password without losing other input', async () => {
    render(<RegisterForm isFirstRun={true} />);
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Admin' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'weak' } });
    fireEvent.submit(screen.getByRole('form'));

    await waitFor(() => {
      // Use getByRole('alert') to avoid matching the "Password" label element
      expect(screen.getByRole('alert')).toHaveTextContent(/password must be at least 8 characters/i);
    });

    expect(screen.getByLabelText(/email/i)).toHaveValue('admin@example.com');
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Admin');
  });

  test('redirects to /dashboard on successful first-run submission', async () => {
    const router = { push: jest.fn() };
    jest.spyOn(require('next/navigation'), 'useRouter').mockReturnValue(router);
    authApi.register.mockResolvedValue({ message: 'Account created' });

    render(<RegisterForm isFirstRun={true} />);
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Admin' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'SecurePass1!' } });
    fireEvent.submit(screen.getByRole('form'));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/dashboard');
    });
  });
});

describe('RegisterPage redirect behavior', () => {
  test('redirects to /login when the system is already configured', async () => {
    const { authApi } = require('@/lib/api');
    const { getSession } = require('@/lib/auth');
    const { redirect } = require('next/navigation');
    const { default: RegisterPage } = require('@/app/(auth)/register/page');

    (authApi.setupStatus as jest.Mock).mockResolvedValue({ configured: true });
    (getSession as jest.Mock).mockResolvedValue(null);

    await RegisterPage({ searchParams: Promise.resolve({}) });

    expect(redirect).toHaveBeenCalledWith('/login');
  });
});
