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

  test('shows a display-name error after blurring the empty field', async () => {
    render(<RegisterForm isFirstRun={true} passwordPolicy={defaultPolicy} />);
    fireEvent.blur(screen.getByLabelText(/display name/i));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/display name is required/i);
    });
  });

  test('shows an email error after blurring an invalid email', async () => {
    render(<RegisterForm isFirstRun={true} passwordPolicy={defaultPolicy} />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'bad' } });
    fireEvent.blur(screen.getByLabelText(/email/i));
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.some((a) => /valid email address/i.test(a.textContent ?? ''))).toBe(true);
    });
  });

  test('shows the pending label while the request is in flight', () => {
    const { authApi } = require('@/lib/api');
    authApi.register.mockImplementation(() => new Promise(() => {}));
    render(<RegisterForm isFirstRun={true} passwordPolicy={defaultPolicy} />);
    fillValidForm();
    fireEvent.submit(screen.getByRole('form'));
    expect(screen.getByRole('button', { name: /creating account/i })).toBeDisabled();
  });
});

describe('RegisterPage redirect behavior', () => {
  const { authApi, adminApi } = require('@/lib/api');
  const { getSession } = require('@/lib/auth');
  const { redirect } = require('next/navigation');
  const { default: RegisterPage } = require('@/app/(auth)/register/page');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('redirects authenticated users to /dashboard', async () => {
    (getSession as jest.Mock).mockResolvedValue({ userId: 'u1' });

    await RegisterPage();

    expect(redirect).toHaveBeenCalledWith('/dashboard');
  });

  test('redirects to /login when configured and open registration is disabled', async () => {
    (authApi.setupStatus as jest.Mock).mockResolvedValue({ configured: true, passwordPolicy: defaultPolicy });
    (getSession as jest.Mock).mockResolvedValue(null);
    (adminApi.getOpenRegistrationStatus as jest.Mock).mockResolvedValue({ openRegistration: false });

    await RegisterPage();

    expect(redirect).toHaveBeenCalledWith('/login');
  });

  test('falls back to closed registration when the status lookup fails', async () => {
    (authApi.setupStatus as jest.Mock).mockResolvedValue({ configured: true, passwordPolicy: defaultPolicy });
    (getSession as jest.Mock).mockResolvedValue(null);
    (adminApi.getOpenRegistrationStatus as jest.Mock).mockRejectedValue(new Error('boom'));

    await RegisterPage();

    expect(redirect).toHaveBeenCalledWith('/login');
  });

  test('renders the non-first-run form when open registration is enabled', async () => {
    (authApi.setupStatus as jest.Mock).mockResolvedValue({ configured: true, passwordPolicy: defaultPolicy });
    (getSession as jest.Mock).mockResolvedValue(null);
    (adminApi.getOpenRegistrationStatus as jest.Mock).mockResolvedValue({ openRegistration: true });

    const element = await RegisterPage();

    expect(redirect).not.toHaveBeenCalled();
    expect(element.props.isFirstRun).toBe(false);
    expect(element.props.passwordPolicy).toBe(defaultPolicy);
  });

  test('renders the first-run form when the system is not yet configured', async () => {
    (authApi.setupStatus as jest.Mock).mockResolvedValue({ configured: false, passwordPolicy: defaultPolicy });
    (getSession as jest.Mock).mockResolvedValue(null);

    const element = await RegisterPage();

    expect(redirect).not.toHaveBeenCalled();
    expect(element.props.isFirstRun).toBe(true);
  });
});
