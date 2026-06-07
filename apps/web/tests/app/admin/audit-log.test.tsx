import React from 'react';
import { render, screen } from '@testing-library/react';

const mockRedirect = jest.fn();
jest.mock('next/navigation', () => ({
  redirect: (path: string) => mockRedirect(path),
}));

const mockRequireAdminOrRedirect = jest.fn();
jest.mock('@/lib/admin-guard', () => ({
  requireAdminOrRedirect: (path: string) => mockRequireAdminOrRedirect(path),
}));

jest.mock('@/app/(dashboard)/dashboard/admin/audit-log/audit-log-client', () => ({
  AuditLogClient: () => <div data-testid="audit-log-client" />,
}));

import AuditLogPage from '@/app/(dashboard)/dashboard/admin/audit-log/page';

describe('Audit Log Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdminOrRedirect.mockResolvedValue(undefined);
  });

  test('calls requireAdminOrRedirect with the audit-log path', async () => {
    render(await AuditLogPage());
    expect(mockRequireAdminOrRedirect).toHaveBeenCalledWith('/dashboard/admin/audit-log');
  });

  test('renders the AuditLogClient', async () => {
    render(await AuditLogPage());
    expect(screen.getByTestId('audit-log-client')).toBeInTheDocument();
  });

  test('renders the page heading', async () => {
    render(await AuditLogPage());
    expect(screen.getByRole('heading', { name: /audit log/i })).toBeInTheDocument();
  });

  test('non-admin triggers redirect via requireAdminOrRedirect', async () => {
    mockRequireAdminOrRedirect.mockImplementationOnce(() => {
      mockRedirect('/dashboard');
      return Promise.resolve();
    });
    render(await AuditLogPage());
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
  });
});
