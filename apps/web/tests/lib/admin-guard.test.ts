import { requireAdminOrRedirect } from '@/lib/admin-guard';

const mockGetProfile = jest.fn();
jest.mock('@/lib/auth', () => ({
  getProfile: () => mockGetProfile(),
}));

const mockRedirect = jest.fn();
jest.mock('next/navigation', () => ({
  redirect: (url: string) => { mockRedirect(url); throw new Error(`REDIRECT:${url}`); },
}));

const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

const mockCookies = jest.fn().mockResolvedValue({
  getAll: () => [{ name: 'session', value: 'test-session' }],
});
jest.mock('next/headers', () => ({
  cookies: () => mockCookies(),
}));

describe('requireAdminOrRedirect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
  });

  test('admin user passes through without redirect', async () => {
    mockGetProfile.mockResolvedValue({ isAdmin: true, userId: 'user-1' });
    await requireAdminOrRedirect('/dashboard/admin/settings');
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('non-admin fires POST /admin/access-denied and redirects', async () => {
    mockGetProfile.mockResolvedValue({ isAdmin: false, userId: 'user-1' });
    await expect(requireAdminOrRedirect('/dashboard/admin/settings')).rejects.toThrow('REDIRECT:/dashboard');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/admin/access-denied'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ resource: '/dashboard/admin/settings' }),
      }),
    );
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
  });

  test('null profile (unauthenticated) redirects without logging', async () => {
    mockGetProfile.mockResolvedValue(null);
    await expect(requireAdminOrRedirect('/dashboard/admin/settings')).rejects.toThrow('REDIRECT:/dashboard');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
  });

  test('swallows a failing access-denied log and still redirects (catch branch)', async () => {
    mockGetProfile.mockResolvedValue({ isAdmin: false, userId: 'user-1' });
    mockFetch.mockRejectedValue(new Error('network down'));
    await expect(requireAdminOrRedirect('/dashboard/admin/settings')).rejects.toThrow('REDIRECT:/dashboard');
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
  });

  test('uses NEXT_PUBLIC_API_URL for the access-denied log when it is set', async () => {
    const originalEnvironment = process.env;
    process.env = { ...originalEnvironment, NEXT_PUBLIC_API_URL: 'https://api.test' };
    jest.resetModules();
    try {
      const guard = require('@/lib/admin-guard');
      mockGetProfile.mockResolvedValue({ isAdmin: false, userId: 'user-1' });
      await expect(guard.requireAdminOrRedirect('/dashboard/admin')).rejects.toThrow('REDIRECT:/dashboard');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test/admin/access-denied',
        expect.anything(),
      );
    } finally {
      process.env = originalEnvironment;
      jest.resetModules();
    }
  });

  test('falls back to the default API base URL when NEXT_PUBLIC_API_URL is unset', async () => {
    const originalEnvironment = process.env;
    process.env = { ...originalEnvironment };
    delete process.env.NEXT_PUBLIC_API_URL;
    jest.resetModules();
    try {
      const guard = require('@/lib/admin-guard');
      mockGetProfile.mockResolvedValue({ isAdmin: false, userId: 'user-1' });
      await expect(guard.requireAdminOrRedirect('/dashboard/admin')).rejects.toThrow('REDIRECT:/dashboard');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:4000/admin/access-denied'),
        expect.anything(),
      );
    } finally {
      process.env = originalEnvironment;
      jest.resetModules();
    }
  });
});
