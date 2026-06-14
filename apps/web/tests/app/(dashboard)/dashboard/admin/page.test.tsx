import React from 'react';
import { render, screen } from '@testing-library/react';

const mockRedirect = jest.fn();
jest.mock('next/navigation', () => ({ redirect: (path: string) => mockRedirect(path) }));

const mockRequireAdminOrRedirect = jest.fn();
jest.mock('@/lib/admin-guard', () => ({
  requireAdminOrRedirect: (path: string) => mockRequireAdminOrRedirect(path),
}));

jest.mock('@/app/(dashboard)/dashboard/admin/users/users-client', () => ({
  UsersClient: () => <div data-testid="users-client" />,
}));

jest.mock('@/app/(dashboard)/dashboard/admin/admin-settings-panel', () => ({
  AdminSettingsPanel: () => <div data-testid="settings-panel" />,
}));

import AdminPage from '@/app/(dashboard)/dashboard/admin/page';

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAdminOrRedirect.mockResolvedValue(undefined);
});

describe('AdminPage', () => {
  test('guards the route via requireAdminOrRedirect', async () => {
    render(await AdminPage());
    expect(mockRequireAdminOrRedirect).toHaveBeenCalledWith('/dashboard/admin');
  });

  test('renders the users and settings sections for an admin', async () => {
    render(await AdminPage());
    expect(screen.getByRole('heading', { name: /administrator settings/i })).toBeInTheDocument();
    expect(screen.getByTestId('users-client')).toBeInTheDocument();
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument();
  });

  test('redirects a non-admin away from the page', async () => {
    mockRequireAdminOrRedirect.mockImplementationOnce(() => {
      mockRedirect('/dashboard');
      return Promise.resolve();
    });
    render(await AdminPage());
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
  });
});
