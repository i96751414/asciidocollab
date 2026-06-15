import React from 'react';
import { render, screen } from '@testing-library/react';

const mockGetProjectAccess = jest.fn();
jest.mock('@/lib/get-project-access', () => ({
  getProjectAccess: (id: string, role: string) => mockGetProjectAccess(id, role),
}));

interface SettingsClientProperties {
  project: { id: string; name: string };
  currentUserRole: string;
}

jest.mock('@/app/(dashboard)/dashboard/projects/[id]/settings/settings-client', () => ({
  SettingsClient: ({ project, currentUserRole }: SettingsClientProperties) => (
    <div data-testid="settings-client">
      <span data-testid="project-id">{project.id}</span>
      <span data-testid="role">{currentUserRole}</span>
    </div>
  ),
}));

import ProjectSettingsPage from '@/app/(dashboard)/dashboard/projects/[id]/settings/page';

const ACCESS = {
  project: { id: 'proj-1', name: 'My Project' },
  currentUserRole: 'owner',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetProjectAccess.mockResolvedValue(ACCESS);
});

describe('ProjectSettingsPage', () => {
  test('requires owner access for the resolved project id', async () => {
    render(await ProjectSettingsPage({ params: Promise.resolve({ id: 'proj-1' }) }));
    expect(mockGetProjectAccess).toHaveBeenCalledWith('proj-1', 'owner');
  });

  test('renders the settings client with project and role', async () => {
    render(await ProjectSettingsPage({ params: Promise.resolve({ id: 'proj-1' }) }));
    expect(screen.getByTestId('project-id')).toHaveTextContent('proj-1');
    expect(screen.getByTestId('role')).toHaveTextContent('owner');
  });

  test('propagates a redirect thrown by the access guard', async () => {
    mockGetProjectAccess.mockRejectedValue(new Error('REDIRECT'));
    await expect(
      ProjectSettingsPage({ params: Promise.resolve({ id: 'proj-1' }) }),
    ).rejects.toThrow('REDIRECT');
  });
});
