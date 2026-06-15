import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EmailCard } from '@/app/(dashboard)/dashboard/account/email-card';

const mockRequestEmailChange = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/api', () => ({
  authApi: {
    requestEmailChange: (...arguments_: unknown[]) => mockRequestEmailChange(...arguments_),
  },
  ApiError: class ApiError extends Error {},
}));

function renderCard(email = 'old@example.com') {
  return render(<EmailCard email={email} />);
}

describe('EmailCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestEmailChange.mockResolvedValue(undefined);
  });

  test('shows the current email and a disabled save button initially', () => {
    renderCard();
    expect(screen.getByText('old@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test('shows a validation error after blurring an invalid email', async () => {
    renderCard();
    const input = screen.getByLabelText(/new email address/i);
    fireEvent.change(input, { target: { value: 'not-an-email' } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/valid email address/i);
    });
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  test('does not show an error before the field is touched', () => {
    renderCard();
    const input = screen.getByLabelText(/new email address/i);
    fireEvent.change(input, { target: { value: 'bad' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('keeps the button disabled when the new email matches the current one', () => {
    renderCard('same@example.com');
    fireEvent.change(screen.getByLabelText(/new email address/i), {
      target: { value: 'same@example.com' },
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test('submits a valid change and shows the confirmation message', async () => {
    renderCard();
    fireEvent.change(screen.getByLabelText(/new email address/i), {
      target: { value: 'new@example.com' },
    });
    fireEvent.submit(screen.getByRole('form', { name: /change email/i }));
    await waitFor(() => {
      expect(mockRequestEmailChange).toHaveBeenCalledWith('new@example.com');
    });
    expect(await screen.findByText('new@example.com')).toBeInTheDocument();
    expect(screen.getByText(/check your email/i)).toBeInTheDocument();
  });

  test('does not call the API when submitting an invalid/unchanged form', async () => {
    renderCard();
    // Form is submitted while empty (invalid) — guard should short-circuit.
    fireEvent.submit(screen.getByRole('form', { name: /change email/i }));
    await waitFor(() => {
      expect(mockRequestEmailChange).not.toHaveBeenCalled();
    });
  });

  test('shows the ApiError message when the request fails', async () => {
    const { ApiError } = require('@/lib/api');
    mockRequestEmailChange.mockRejectedValueOnce(new ApiError('Email already in use'));
    renderCard();
    fireEvent.change(screen.getByLabelText(/new email address/i), {
      target: { value: 'new@example.com' },
    });
    fireEvent.submit(screen.getByRole('form', { name: /change email/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/email already in use/i);
    });
  });

  test('shows a generic message when the request fails with a non-ApiError', async () => {
    mockRequestEmailChange.mockRejectedValueOnce(new Error('boom'));
    renderCard();
    fireEvent.change(screen.getByLabelText(/new email address/i), {
      target: { value: 'new@example.com' },
    });
    fireEvent.submit(screen.getByRole('form', { name: /change email/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to request email change/i);
    });
  });
});
