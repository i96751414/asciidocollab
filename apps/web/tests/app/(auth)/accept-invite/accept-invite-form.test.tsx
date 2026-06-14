// AcceptInviteForm component tests.
// Requires: @testing-library/react, @testing-library/jest-dom, jest-environment-jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AcceptInviteForm } from '@/app/(auth)/accept-invite/accept-invite-form';
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
    setupStatus: jest.fn(),
  },
  adminApi: {
    getAcceptInvitePreview: jest.fn(),
    acceptInvite: jest.fn(),
  },
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const { authApi, adminApi, ApiError } = require('@/lib/api');

function mockValidPreview() {
  adminApi.getAcceptInvitePreview.mockResolvedValue({ email: 'invitee@example.com' });
  authApi.setupStatus.mockResolvedValue({ passwordPolicy: defaultPolicy });
}

function fillValidForm() {
  fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Invitee' } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: VALID_PASSWORD } });
  fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: VALID_PASSWORD } });
}

function submitForm() {
  const field = screen.getByLabelText(/display name/i);
  const form = field.closest('form');
  if (!form) throw new Error('form not found');
  fireEvent.submit(form);
}

describe('AcceptInviteForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('shows the invalid state immediately when no token is provided', () => {
    render(<AcceptInviteForm token="" />);
    expect(screen.getByText(/invalid invitation/i)).toBeInTheDocument();
    expect(adminApi.getAcceptInvitePreview).not.toHaveBeenCalled();
  });

  test('shows the loading state while the preview resolves', () => {
    adminApi.getAcceptInvitePreview.mockReturnValue(new Promise(() => {}));
    authApi.setupStatus.mockReturnValue(new Promise(() => {}));
    render(<AcceptInviteForm token="tok" />);
    expect(screen.getByText(/checking invitation/i)).toBeInTheDocument();
  });

  test('shows the invalid state when the preview request fails', async () => {
    adminApi.getAcceptInvitePreview.mockRejectedValue(new Error('nope'));
    authApi.setupStatus.mockResolvedValue({ passwordPolicy: defaultPolicy });
    render(<AcceptInviteForm token="tok" />);
    await waitFor(() => expect(screen.getByText(/invalid invitation/i)).toBeInTheDocument());
  });

  test('renders the form with the invitee email once the preview resolves', async () => {
    mockValidPreview();
    render(<AcceptInviteForm token="tok" />);
    await waitFor(() => expect(screen.getByText(/complete your registration/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/email/i)).toHaveValue('invitee@example.com');
  });

  test('shows a display-name error on submit when it is empty', async () => {
    mockValidPreview();
    render(<AcceptInviteForm token="tok" />);
    await waitFor(() => screen.getByText(/complete your registration/i));

    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: VALID_PASSWORD } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: VALID_PASSWORD } });
    submitForm();

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.some((a) => /display name is required/i.test(a.textContent ?? ''))).toBe(true);
    });
    expect(adminApi.acceptInvite).not.toHaveBeenCalled();
  });

  test('shows a display-name error after blurring the empty field', async () => {
    mockValidPreview();
    render(<AcceptInviteForm token="tok" />);
    await waitFor(() => screen.getByText(/complete your registration/i));

    fireEvent.blur(screen.getByLabelText(/display name/i));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/display name is required/i);
    });
  });

  test('shows a password error on blur when the password is weak', async () => {
    mockValidPreview();
    render(<AcceptInviteForm token="tok" />);
    await waitFor(() => screen.getByText(/complete your registration/i));

    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'weak' } });
    fireEvent.blur(screen.getByLabelText(/^password$/i));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/at least 12 characters/i);
    });
  });

  test('shows a mismatch error and hides it once corrected', async () => {
    mockValidPreview();
    render(<AcceptInviteForm token="tok" />);
    await waitFor(() => screen.getByText(/complete your registration/i));

    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: VALID_PASSWORD } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'different' } });
    fireEvent.blur(screen.getByLabelText(/confirm password/i));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/passwords do not match/i));

    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: VALID_PASSWORD } });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  test('disables the submit button until the form is valid', async () => {
    mockValidPreview();
    render(<AcceptInviteForm token="tok" />);
    await waitFor(() => screen.getByText(/complete your registration/i));

    const button = screen.getByRole('button', { name: /create account/i });
    expect(button).toBeDisabled();
    fillValidForm();
    expect(button).toBeEnabled();
  });

  test('redirects to /dashboard on a successful submission', async () => {
    const router = { push: jest.fn() };
    jest.spyOn(require('next/navigation'), 'useRouter').mockReturnValue(router);
    mockValidPreview();
    adminApi.acceptInvite.mockResolvedValue(undefined);

    render(<AcceptInviteForm token="tok" />);
    await waitFor(() => screen.getByText(/complete your registration/i));
    fillValidForm();
    submitForm();

    await waitFor(() => {
      expect(adminApi.acceptInvite).toHaveBeenCalledWith('tok', 'Invitee', VALID_PASSWORD);
      expect(router.push).toHaveBeenCalledWith('/dashboard');
    });
  });

  test('shows the API error message when acceptInvite throws an ApiError', async () => {
    mockValidPreview();
    adminApi.acceptInvite.mockRejectedValue(new ApiError(409, 'CONFLICT', 'Token already used'));

    render(<AcceptInviteForm token="tok" />);
    await waitFor(() => screen.getByText(/complete your registration/i));
    fillValidForm();
    submitForm();

    await waitFor(() => {
      expect(screen.getByText(/token already used/i)).toBeInTheDocument();
    });
  });

  test('shows a generic error when acceptInvite throws a non-ApiError', async () => {
    mockValidPreview();
    adminApi.acceptInvite.mockRejectedValue(new Error('network down'));

    render(<AcceptInviteForm token="tok" />);
    await waitFor(() => screen.getByText(/complete your registration/i));
    fillValidForm();
    submitForm();

    await waitFor(() => {
      expect(screen.getByText(/registration failed\. please try again/i)).toBeInTheDocument();
    });
  });
});
