import { render, screen, waitFor } from '@testing-library/react';

const mockRedirect = jest.fn();
jest.mock('next/navigation', () => ({
  redirect: (path: string) => mockRedirect(path),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/dashboard/admin/audit-log',
}));

const mockRequireAdminOrRedirect = jest.fn();
jest.mock('@/lib/admin-guard', () => ({
  requireAdminOrRedirect: (path: string) => mockRequireAdminOrRedirect(path),
}));

const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

const mockPageResult = {
  items: [
    {
      id: 'log-1111',
      userId: 'u1',
      actorDisplayName: 'Admin User',
      projectId: null,
      action: 'UNAUTHORIZED_PAGE_ACCESS',
      resourceType: 'PAGE',
      resourceId: '/dashboard/admin',
      timestamp: '2024-01-15T10:30:00Z',
      metadata: {},
    },
  ],
  total: 1,
  page: 1,
  limit: 50,
};

jest.mock('@/lib/api', () => ({
  adminApi: {
    getAuditLogs: jest.fn().mockResolvedValue(mockPageResult),
    getAuditLogActionTypes: jest.fn().mockResolvedValue({ actionTypes: ['UNAUTHORIZED_PAGE_ACCESS'] }),
  },
}));

import AuditLogPage from '@/app/(dashboard)/dashboard/admin/audit-log/page';

describe('Audit Log Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdminOrRedirect.mockResolvedValue(undefined);
    const { adminApi } = require('@/lib/api');
    adminApi.getAuditLogs.mockResolvedValue(mockPageResult);
    adminApi.getAuditLogActionTypes.mockResolvedValue({ actionTypes: ['UNAUTHORIZED_PAGE_ACCESS'] });
  });

  test('calls requireAdminOrRedirect', async () => {
    render(await AuditLogPage({ searchParams: Promise.resolve({}) }));
    expect(mockRequireAdminOrRedirect).toHaveBeenCalledWith('/dashboard/admin/audit-log');
  });

  test('renders entries with correct columns', async () => {
    render(await AuditLogPage({ searchParams: Promise.resolve({}) }));
    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
      expect(screen.getByText('UNAUTHORIZED_PAGE_ACCESS')).toBeInTheDocument();
      expect(screen.getByText('PAGE')).toBeInTheDocument();
      expect(screen.getByText('/dashboard/admin')).toBeInTheDocument();
    });
  });

  test('shows empty state when no results', async () => {
    const { adminApi } = require('@/lib/api');
    adminApi.getAuditLogs.mockResolvedValueOnce({ items: [], total: 0, page: 1, limit: 50 });
    render(await AuditLogPage({ searchParams: Promise.resolve({}) }));
    await waitFor(() => {
      expect(screen.getByText(/no audit log entries/i)).toBeInTheDocument();
    });
  });

  test('non-admin triggers redirect to /dashboard', async () => {
    mockRequireAdminOrRedirect.mockImplementationOnce(() => {
      mockRedirect('/dashboard');
      return Promise.resolve();
    });
    render(await AuditLogPage({ searchParams: Promise.resolve({}) }));
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
  });
});
