import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { AuditLogClient } from '@/app/(dashboard)/dashboard/admin/audit-log/audit-log-client';

const mockGetAuditLogs = jest.fn();
const mockGetAuditLogActionTypes = jest.fn();
const mockGetAdminUsers = jest.fn();
const mockGetProject = jest.fn();

jest.mock('@/lib/api', () => ({
  adminApi: {
    getAuditLogs: (...a: unknown[]) => mockGetAuditLogs(...a),
    getAuditLogActionTypes: () => mockGetAuditLogActionTypes(),
    getAdminUsers: () => mockGetAdminUsers(),
  },
  projectsApi: {
    get: (id: string) => mockGetProject(id),
  },
}));

const USER_A = { id: 'uid-alice', displayName: 'Alice', email: 'alice@example.com', isAdmin: false, emailVerified: true, registrationMethod: 'SELF_REGISTERED', createdAt: '' };
const USER_B = { id: 'uid-bob', displayName: 'Bob', email: 'bob@example.com', isAdmin: false, emailVerified: true, registrationMethod: 'SELF_REGISTERED', createdAt: '' };

const ENTRY_A = {
  id: 'e1',
  userId: 'uid-alice',
  actorDisplayName: 'Alice',
  projectId: 'proj-1',
  action: 'FILE_UPLOAD',
  resourceType: 'FILE',
  resourceId: 'file-1',
  timestamp: '2024-01-02T10:00:00Z',
  metadata: {},
};

const ENTRY_B = {
  id: 'e2',
  userId: 'uid-bob',
  actorDisplayName: null,
  projectId: null,
  action: 'USER_LOGIN',
  resourceType: 'USER',
  resourceId: 'uid-bob',
  timestamp: '2024-01-01T08:00:00Z',
  metadata: {},
};

function makePageResult(items = [ENTRY_A, ENTRY_B]) {
  return { items, total: items.length, page: 1, limit: 50 };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuditLogs.mockResolvedValue(makePageResult());
  mockGetAuditLogActionTypes.mockResolvedValue({ actionTypes: ['FILE_UPLOAD', 'USER_LOGIN'] });
  mockGetAdminUsers.mockResolvedValue({ users: [USER_A, USER_B] });
  mockGetProject.mockResolvedValue({ data: { id: 'proj-1', name: 'My Project', description: null, owners: [], tags: [], rootFolderId: null, archivedAt: null, createdAt: '', updatedAt: '' } });
});

describe('AuditLogClient — filter controls', () => {
  test('renders a from-date input', async () => {
    render(<AuditLogClient />);
    await waitFor(() => expect(screen.getByLabelText(/from/i)).toBeInTheDocument());
  });

  test('renders a to-date input', async () => {
    render(<AuditLogClient />);
    await waitFor(() => expect(screen.getByLabelText(/to/i)).toBeInTheDocument());
  });

  test('renders a user dropdown populated with user display names', async () => {
    render(<AuditLogClient />);
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /user/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('option', { name: 'Alice' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Bob' })).toBeInTheDocument();
  });

  test('renders an action-type dropdown populated with action types', async () => {
    render(<AuditLogClient />);
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /action type/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('option', { name: 'FILE_UPLOAD' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'USER_LOGIN' })).toBeInTheDocument();
  });

  test('renders Apply and Reset buttons', async () => {
    render(<AuditLogClient />);
    await waitFor(() => expect(screen.getByRole('button', { name: /apply/i })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
  });

  test('clicking Apply re-fetches with selected action type', async () => {
    render(<AuditLogClient />);
    await waitFor(() => expect(screen.getByRole('combobox', { name: /action type/i })).toBeInTheDocument());
    fireEvent.change(screen.getByRole('combobox', { name: /action type/i }), { target: { value: 'FILE_UPLOAD' } });
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    await waitFor(() => {
      expect(mockGetAuditLogs).toHaveBeenLastCalledWith(expect.objectContaining({ actionType: 'FILE_UPLOAD' }));
    });
  });

  test('clicking Reset clears the action type filter and re-fetches', async () => {
    render(<AuditLogClient />);
    await waitFor(() => expect(screen.getByRole('combobox', { name: /action type/i })).toBeInTheDocument());
    fireEvent.change(screen.getByRole('combobox', { name: /action type/i }), { target: { value: 'FILE_UPLOAD' } });
    fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    await waitFor(() => {
      const lastCall = mockGetAuditLogs.mock.calls.at(-1)?.[0];
      expect(lastCall?.actionType == null || lastCall?.actionType === '').toBeTruthy();
    });
  });
});

describe('AuditLogClient — actor column', () => {
  test('actor cell shows actorDisplayName with userId as title tooltip', async () => {
    render(<AuditLogClient />);
    await waitFor(() => {
      const cell = screen.getByTitle('uid-alice');
      expect(cell).toHaveTextContent('Alice');
    });
  });

  test('actor cell has userId as title tooltip', async () => {
    render(<AuditLogClient />);
    await waitFor(() => {
      const cell = screen.getByTitle('uid-alice');
      expect(cell).toHaveTextContent('Alice');
    });
  });

  test('falls back to userId text when actorDisplayName is null', async () => {
    render(<AuditLogClient />);
    await waitFor(() => {
      const cell = screen.getByTitle('uid-bob');
      expect(cell).toHaveTextContent('uid-bob');
    });
  });
});

describe('AuditLogClient — project column', () => {
  test('renders a Project column header', async () => {
    render(<AuditLogClient />);
    await waitFor(() => expect(screen.getByRole('columnheader', { name: /project/i })).toBeInTheDocument());
  });

  test('shows project name for entries with a projectId', async () => {
    render(<AuditLogClient />);
    await waitFor(() => expect(screen.getByText('My Project')).toBeInTheDocument());
  });

  test('project name cell has projectId as title tooltip', async () => {
    render(<AuditLogClient />);
    await waitFor(() => {
      const cell = screen.getByTitle('proj-1');
      expect(cell).toHaveTextContent('My Project');
    });
  });

  test('shows — for entries with no projectId', async () => {
    render(<AuditLogClient />);
    await waitFor(() => {
      const dataRows = screen.getAllByRole('row').slice(1);
      // ENTRY_B has action USER_LOGIN and null projectId
      const loginRow = dataRows.find((r) => within(r).queryByText('USER_LOGIN'));
      expect(loginRow).toBeDefined();
      const cells = within(loginRow!).getAllByRole('cell');
      expect(cells.at(-1)).toHaveTextContent('—');
    });
  });
});

describe('AuditLogClient — sorting', () => {
  test('Timestamp column header is a button', async () => {
    render(<AuditLogClient />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /timestamp/i })).toBeInTheDocument();
    });
  });

  test('default order is newest-first (desc)', async () => {
    render(<AuditLogClient />);
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(1));
    const rows = screen.getAllByRole('row').slice(1);
    // ENTRY_A (2024-01-02, FILE_UPLOAD) is newer → first in desc order
    expect(within(rows[0]).queryByText('FILE_UPLOAD')).toBeInTheDocument();
  });

  test('clicking Timestamp button switches to oldest-first (asc)', async () => {
    render(<AuditLogClient />);
    const button = await screen.findByRole('button', { name: /timestamp/i });
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(1));
    fireEvent.click(button);
    const rows = screen.getAllByRole('row').slice(1);
    // ENTRY_B (2024-01-01, USER_LOGIN) is older → first in asc order
    expect(within(rows[0]).queryByText('USER_LOGIN')).toBeInTheDocument();
  });
});
