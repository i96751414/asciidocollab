// Dashboard layout Sign Out button tests.
// Requires: @testing-library/react, @testing-library/jest-dom, jest-environment-jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SignOutButton } from '@/app/(dashboard)/sign-out-button';

jest.mock('@/lib/api', () => ({
  authApi: {
    logout: jest.fn().mockResolvedValue({ message: 'Logged out' }),
  },
}));

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe('SignOutButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('calls authApi.logout() and redirects to /login when clicked', async () => {
    const { authApi } = require('@/lib/api');

    render(<SignOutButton />);
    const button = screen.getByRole('button', { name: /sign out/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(authApi.logout).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });

  test('button is keyboard accessible', () => {
    render(<SignOutButton />);
    const button = screen.getByRole('button', { name: /sign out/i });
    expect(button).toBeInTheDocument();
    expect(button.tagName).toBe('BUTTON');
  });
});
