// Dashboard layout Sign Out button tests.
// Requires: @testing-library/react, @testing-library/jest-dom, jest-environment-jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SignOutButton } from '@/app/(dashboard)/sign-out-button';
import DashboardLayout from '@/app/(dashboard)/layout';

jest.mock('@/lib/api', () => ({
  authApi: {
    logout: jest.fn().mockResolvedValue({ message: 'Logged out' }),
  },
}));

const mockPush = jest.fn();
const mockRedirect = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  redirect: (path: string) => mockRedirect(path),
}));

const mockGetProfile = jest.fn();
jest.mock('@/lib/auth', () => ({
  getProfile: () => mockGetProfile(),
}));

jest.mock('@/components/user-menu', () => ({
  UserMenu: ({ profile }: { profile: { displayName: string } }) => (
    <div data-testid="user-menu">{profile.displayName}</div>
  ),
}));

jest.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="theme-provider">{children}</div>
  ),
}));

jest.mock('@/contexts/current-user-context', () => ({
  CurrentUserProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockProfile = {
  userId: 'u1',
  displayName: 'Test User',
  email: 'test@example.com',
  isAdmin: false,
  emailVerified: true,
  avatarKey: null,
  appTheme: 'system',
};

describe('DashboardLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProfile.mockResolvedValue(mockProfile);
  });

  test('sidebar div is not rendered', async () => {
    const { container } = render(await DashboardLayout({ children: <span>content</span> }));
    expect(container.querySelector('.w-64')).not.toBeInTheDocument();
  });

  test('UserMenu is present in the header', async () => {
    render(await DashboardLayout({ children: <span>content</span> }));
    expect(screen.getByTestId('user-menu')).toBeInTheDocument();
  });

  test('ThemeProvider wraps children', async () => {
    render(await DashboardLayout({ children: <span data-testid="child">content</span> }));
    const provider = screen.getByTestId('theme-provider');
    expect(provider).toBeInTheDocument();
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});

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
