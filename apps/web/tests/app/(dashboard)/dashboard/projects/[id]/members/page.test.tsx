import React from 'react';
import { render, screen } from '@testing-library/react';

const mockGetProjectAccess = jest.fn();
jest.mock('@/lib/get-project-access', () => ({
  getProjectAccess: (id: string, role: string) => mockGetProjectAccess(id, role),
}));

interface MembersClientProperties {
  projectId: string;
  projectName: string;
  isArchived: boolean;
}

jest.mock('@/app/(dashboard)/dashboard/projects/[id]/members/members-client', () => ({
  MembersClient: ({ projectId, projectName, isArchived }: MembersClientProperties) => (
    <div data-testid="members-client">
      <span data-testid="project-id">{projectId}</span>
      <span data-testid="project-name">{projectName}</span>
      <span data-testid="is-archived">{String(isArchived)}</span>
    </div>
  ),
}));

import ProjectMembersPage from '@/app/(dashboard)/dashboard/projects/[id]/members/page';

const ACCESS = {
  project: { id: 'proj-1', name: 'My Project', archivedAt: null },
  members: [{ userId: 'user-1', role: 'owner' }],
  currentUserId: 'user-1',
  currentUserRole: 'owner',
  isAdmin: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetProjectAccess.mockResolvedValue(ACCESS);
});

describe('ProjectMembersPage', () => {
  test('requires owner access for the resolved project id', async () => {
    render(await ProjectMembersPage({ params: Promise.resolve({ id: 'proj-1' }) }));
    expect(mockGetProjectAccess).toHaveBeenCalledWith('proj-1', 'owner');
  });

  test('passes project details down to the members client', async () => {
    render(await ProjectMembersPage({ params: Promise.resolve({ id: 'proj-1' }) }));
    expect(screen.getByTestId('project-id')).toHaveTextContent('proj-1');
    expect(screen.getByTestId('project-name')).toHaveTextContent('My Project');
    expect(screen.getByTestId('is-archived')).toHaveTextContent('false');
  });

  test('marks the client as archived when the project is archived', async () => {
    mockGetProjectAccess.mockResolvedValue({
      ...ACCESS,
      project: { ...ACCESS.project, archivedAt: '2024-01-01T00:00:00Z' },
    });
    render(await ProjectMembersPage({ params: Promise.resolve({ id: 'proj-1' }) }));
    expect(screen.getByTestId('is-archived')).toHaveTextContent('true');
  });

  test('propagates a redirect thrown by the access guard', async () => {
    mockGetProjectAccess.mockRejectedValue(new Error('REDIRECT'));
    await expect(
      ProjectMembersPage({ params: Promise.resolve({ id: 'proj-1' }) }),
    ).rejects.toThrow('REDIRECT');
  });
});
