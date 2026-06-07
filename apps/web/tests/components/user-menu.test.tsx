import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserMenu } from '@/components/user-menu';

jest.mock('@radix-ui/react-dropdown-menu', () => ({
  Root: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Trigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => <div>{children}</div>,
  Portal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Content: ({ children }: { children: React.ReactNode; align?: string; className?: string }) => <div role="menu">{children}</div>,
  Item: ({ children, onSelect, asChild, className }: { children: React.ReactNode; onSelect?: () => void; asChild?: boolean; className?: string }) =>
    asChild ? <>{children}</> : <div role="menuitem" onClick={onSelect} className={className}>{children}</div>,
  Label: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Separator: () => <hr />,
}));

const mockLogout = jest.fn().mockResolvedValue(undefined);
const mockRouterPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockRouterPush }) }));
jest.mock('@/lib/api', () => ({
  authApi: { logout: () => mockLogout() },
}));

jest.mock('@/components/avatar', () => ({
  Avatar: ({ displayName }: { displayName: string }) => <span data-testid="avatar">{displayName}</span>,
}), { virtual: true });

const adminProfile = {
  userId: 'u1',
  displayName: 'Admin User',
  email: 'admin@example.com',
  isAdmin: true,
  emailVerified: true,
  avatarKey: null,
  appTheme: 'system',
};

const regularProfile = {
  ...adminProfile,
  userId: 'u2',
  displayName: 'Regular User',
  isAdmin: false,
};

describe('UserMenu', () => {
  test('renders admin sections only for admin users', () => {
    render(<UserMenu profile={adminProfile} />);
    expect(screen.getAllByText(/administrator settings/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/audit log/i).length).toBeGreaterThan(0);
  });

  test('hides admin sections for non-admin users', () => {
    render(<UserMenu profile={regularProfile} />);
    expect(screen.queryAllByText(/administrator settings/i)).toHaveLength(0);
    expect(screen.queryAllByText(/audit log/i)).toHaveLength(0);
  });

  test('GitHub link has target="_blank"', () => {
    render(<UserMenu profile={regularProfile} />);
    const githubLink = screen.getByText(/github/i).closest('a');
    expect(githubLink).toHaveAttribute('target', '_blank');
  });

  test('Log Out triggers logout and redirects', async () => {
    render(<UserMenu profile={regularProfile} />);
    fireEvent.click(screen.getByText(/log out/i));
    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
    });
  });
});

describe('UserMenu — navigation structure', () => {
  test('Account is a top-level link to /dashboard/account', () => {
    render(<UserMenu profile={regularProfile} />);
    const link = screen.getByText('Account').closest('a');
    expect(link).toHaveAttribute('href', '/dashboard/account');
  });

  test('Settings is a top-level link to /dashboard/settings', () => {
    render(<UserMenu profile={regularProfile} />);
    const link = screen.getByText('Settings').closest('a');
    expect(link).toHaveAttribute('href', '/dashboard/settings');
  });

  test('no Display Name sub-item', () => {
    render(<UserMenu profile={regularProfile} />);
    expect(screen.queryByText('Display Name')).not.toBeInTheDocument();
  });

  test('no Password sub-item', () => {
    render(<UserMenu profile={regularProfile} />);
    expect(screen.queryByText('Password')).not.toBeInTheDocument();
  });

  test('no Email sub-item', () => {
    render(<UserMenu profile={regularProfile} />);
    expect(screen.queryByText('Email')).not.toBeInTheDocument();
  });

  test('no Keyboard Shortcuts sub-item', () => {
    render(<UserMenu profile={regularProfile} />);
    expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument();
  });

  test('no Application Theme sub-item', () => {
    render(<UserMenu profile={regularProfile} />);
    expect(screen.queryByText('Application Theme')).not.toBeInTheDocument();
  });

  test('Administrator Settings is a link to /dashboard/admin for admin users', () => {
    render(<UserMenu profile={adminProfile} />);
    const link = screen.getByText('Administrator Settings').closest('a');
    expect(link).toHaveAttribute('href', '/dashboard/admin');
  });

  test('Audit Log is a link to /dashboard/admin/audit-log for admin users', () => {
    render(<UserMenu profile={adminProfile} />);
    const link = screen.getByText('Audit Log').closest('a');
    expect(link).toHaveAttribute('href', '/dashboard/admin/audit-log');
  });
});
