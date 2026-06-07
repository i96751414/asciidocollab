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
});
