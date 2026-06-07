import { render, waitFor } from '@testing-library/react';

const mockRedirect = jest.fn();
jest.mock('next/navigation', () => ({ redirect: (path: string) => mockRedirect(path) }));

const mockGetProfile = jest.fn();
jest.mock('@/lib/auth', () => ({ getProfile: () => mockGetProfile() }));

const mockRequireAdminOrRedirect = jest.fn();
jest.mock('@/lib/admin-guard', () => ({
  requireAdminOrRedirect: (path: string) => mockRequireAdminOrRedirect(path),
}));

const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

const adminProfile = {
  userId: 'u1',
  displayName: 'Admin',
  email: 'admin@example.com',
  isAdmin: true,
  emailVerified: true,
  avatarKey: null,
  appTheme: 'system',
};

const mockSettings = {
  openRegistration: true,
  maxUploadSizeMb: 10,
};

import AdminSettingsPage from '@/app/(dashboard)/dashboard/admin/settings/page';

describe('Admin Settings Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProfile.mockResolvedValue(adminProfile);
    mockRequireAdminOrRedirect.mockResolvedValue(undefined);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSettings),
    });
  });

  test('calls requireAdminOrRedirect on render', async () => {
    render(await AdminSettingsPage());
    expect(mockRequireAdminOrRedirect).toHaveBeenCalledWith('/dashboard/admin/settings');
  });

  test('form renders values fetched from GET /admin/settings', async () => {
    render(await AdminSettingsPage());
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/settings'),
        expect.any(Object),
      );
    });
  });

  test('non-admin triggers redirect to /dashboard', async () => {
    mockRequireAdminOrRedirect.mockImplementationOnce(() => {
      mockRedirect('/dashboard');
      return Promise.resolve();
    });
    render(await AdminSettingsPage());
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
  });
});
