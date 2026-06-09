// RegisterForm component tests and RegisterPage server component redirect behavior.
// Requires: @testing-library/react, @testing-library/jest-dom, jest-environment-jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RegisterForm } from '@/app/(auth)/register/register-form';
import type { PasswordPolicyDto } from '@asciidocollab/shared';

const defaultPolicy: PasswordPolicyDto = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireDigits: true,
  requireSymbols: true,
};

const VALID_PASSWORD = 'SecurePass1!';

jest.mock('@/lib/api', () => ({
  ApiError: jest.requireActual('@/lib/api').ApiError,
  authApi: {
    register: jest.fn(),
    setupStatus: jest.fn().mockResolvedValue({
      configured: false,
      passwordPolicy: {
        minLength: 12,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
    }),
  },
  adminApi: {
    getOpenRegistrationStatus: jest.fn().mockResolvedValue({ openRegistration: false }),
  },
}));

jest.mock('@/lib/auth', () => ({
  getSession: jest.fn().mockResolvedValue(null),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  redirect: jest.fn(),
}));

function fillValidForm() {
  fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Admin' } });
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'admin@example.com' } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: VALID_PASSWORD } });
  fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: VALID_PASSWORD } });
}

describe('RegisterForm (first-run setup)', () => {
  const { authApi } = require('@/lib/api');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('shows "Set up your account" heading when configured: false', () => {
    render(<RegisterForm isFirstRun={true} passwordPolicy={defaultPolicy} />);
    expect(screen.getByText(/set up your account/i)).toBeInTheDocument();
  });

  test('shows password error on blur when password is invalid', async () => {
    render(<RegisterForm isFirstRun={true} passwordPolicy={defaultPolicy} />);

    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'weak' } });
    fireEvent.blur(screen.getByLabelText(/^password$/i));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/password must be at least 12 characters/i);
    });
  });

  test('shows mismatch error on blur when passwords differ', async () => {
    render(<RegisterForm isFirstRun={true} passwordPolicy={defaultPolicy} />);

    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: VALID_PASSWORD } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'different' } });
    fireEvent.blur(screen.getByLabelText(/confirm password/i));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/passwords do not match/i);
    });
  });

  test('mismatch error clears when confirm password is corrected', async () => {
    render(<RegisterForm isFirstRun={true} passwordPolicy={defaultPolicy} />);

    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: VALID_PASSWORD } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'different' } });
    fireEvent.blur(screen.getByLabelText(/confirm password/i));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: VALID_PASSWORD } });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  test('error clears when the field becomes valid after blur', async () => {
    render(<RegisterForm isFirstRun={true} passwordPolicy={defaultPolicy} />);

    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'weak' } });
    fireEvent.blur(screen.getByLabelText(/^password$/i));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: VALID_PASSWORD } });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  test('shows validation errors on submit when password is weak', async () => {
    render(<RegisterForm isFirstRun={true} passwordPolicy={defaultPolicy} />);
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Admin' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'weak' } });
    fireEvent.submit(screen.getByRole('form'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/password must be at least 12 characters/i);
    });

    expect(screen.getByLabelText(/email/i)).toHaveValue('admin@example.com');
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Admin');
  });

  test('respects a custom minLength from the policy', async () => {
    const relaxedPolicy: PasswordPolicyDto = {
      minLength: 8,
      requireUppercase: false,
      requireLowercase: false,
      requireDigits: false,
      requireSymbols: false,
    };
    render(<RegisterForm isFirstRun={true} passwordPolicy={relaxedPolicy} />);
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'short' } });
    fireEvent.blur(screen.getByLabelText(/^password$/i));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/password must be at least 8 characters/i);
    });
  });

  test('Create account button is disabled until the form is valid', () => {
    render(<RegisterForm isFirstRun={true} passwordPolicy={defaultPolicy} />);
    const button = screen.getByRole('button', { name: /create account/i });

    expect(button).toBeDisabled();

    fillValidForm();

    expect(button).toBeEnabled();
  });

  test('Create account button stays disabled when passwords do not match', () => {
    render(<RegisterForm isFirstRun={true} passwordPolicy={defaultPolicy} />);
    const button = screen.getByRole('button', { name: /create account/i });

    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Admin' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: VALID_PASSWORD } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'different' } });

    expect(button).toBeDisabled();
  });

  test('redirects to /dashboard on successful first-run submission', async () => {
    const router = { push: jest.fn() };
    jest.spyOn(require('next/navigation'), 'useRouter').mockReturnValue(router);
    authApi.register.mockResolvedValue({ message: 'Account created' });

    render(<RegisterForm isFirstRun={true} passwordPolicy={defaultPolicy} />);
    fillValidForm();
    fireEvent.submit(screen.getByRole('form'));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/dashboard');
    });
  });

  test('shows the check-email screen when verification is required', async () => {
    authApi.register.mockResolvedValue({ requiresEmailVerification: true });
    render(<RegisterForm isFirstRun={true} passwordPolicy={defaultPolicy} />);
    fillValidForm();
    fireEvent.submit(screen.getByRole('form'));

    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument();
    });
    expect(screen.getByText('admin@example.com')).toBeInTheDocument();
  });

  test('shows "Registration is closed" for a 403 REGISTRATION_CLOSED error', async () => {
    const { ApiError } = require('@/lib/api');
    authApi.register.mockRejectedValue(new ApiError(403, 'REGISTRATION_CLOSED', 'nope'));
    render(<RegisterForm isFirstRun={false} passwordPolicy={defaultPolicy} />);
    fillValidForm();
    fireEvent.submit(screen.getByRole('form'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/registration is closed/i);
    });
  });

  test('shows the server message for a non-closed 403 error', async () => {
    const { ApiError } = require('@/lib/api');
    authApi.register.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Email domain not allowed'));
    render(<RegisterForm isFirstRun={false} passwordPolicy={defaultPolicy} />);
    fillValidForm();
    fireEvent.submit(screen.getByRole('form'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/email domain not allowed/i);
    });
  });

  test('shows the API message for a non-403 ApiError', async () => {
    const { ApiError } = require('@/lib/api');
    authApi.register.mockRejectedValue(new ApiError(409, 'CONFLICT', 'Email already registered'));
    render(<RegisterForm isFirstRun={false} passwordPolicy={defaultPolicy} />);
    fillValidForm();
    fireEvent.submit(screen.getByRole('form'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/email already registered/i);
    });
  });

  test('shows a generic message for a non-ApiError failure', async () => {
    authApi.register.mockRejectedValue(new Error('network down'));
    render(<RegisterForm isFirstRun={false} passwordPolicy={defaultPolicy} />);
    fillValidForm();
    fireEvent.submit(screen.getByRole('form'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/registration failed\. please try again/i);
    });
  });

  test('shows the non-first-run copy when isFirstRun is false', () => {
    render(<RegisterForm isFirstRun={false} passwordPolicy={defaultPolicy} />);
    expect(screen.getByText(/register for access/i)).toBeInTheDocument();
    expect(screen.queryByText(/set up your account/i)).not.toBeInTheDocument();
  });

  test('shows display-name and email validation errors on submit', async () => {
    render(<RegisterForm isFirstRun={true} passwordPolicy={defaultPolicy} />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'not-an-email' } });
    fireEvent.submit(screen.getByRole('form'));

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.some((a) => /display name is required/i.test(a.textContent ?? ''))).toBe(true);
      expect(alerts.some((a) => /valid email address/i.test(a.textContent ?? ''))).toBe(true);
    });
  });
});

describe('RegisterPage redirect behavior', () => {
  test('redirects to /login when the system is already configured', async () => {
    const { authApi } = require('@/lib/api');
    const { getSession } = require('@/lib/auth');
    const { redirect } = require('next/navigation');
    const { default: RegisterPage } = require('@/app/(auth)/register/page');

    (authApi.setupStatus as jest.Mock).mockResolvedValue({ configured: true, passwordPolicy: defaultPolicy });
    (getSession as jest.Mock).mockResolvedValue(null);

    await RegisterPage({ searchParams: Promise.resolve({}) });

    expect(redirect).toHaveBeenCalledWith('/login');
  });
});
