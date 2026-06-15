import React from 'react';
import { render, screen } from '@testing-library/react';

const mockGetProjectAccess = jest.fn();
jest.mock('@/lib/get-project-access', () => ({
  getProjectAccess: (id: string, role: string) => mockGetProjectAccess(id, role),
}));

interface LayoutProperties {
  projectId: string;
  projectName: string;
  projectDescription: string | null;
  mainFileNodeId: string | null;
  canManage: boolean;
  canEdit: boolean;
  userId: string;
}

jest.mock('@/app/(dashboard)/dashboard/projects/[id]/project-editor-layout', () => ({
  ProjectEditorLayout: (properties: LayoutProperties) => (
    <div data-testid="editor-layout">
      <span data-testid="project-id">{properties.projectId}</span>
      <span data-testid="project-name">{properties.projectName}</span>
      <span data-testid="description">{String(properties.projectDescription)}</span>
      <span data-testid="main-file">{String(properties.mainFileNodeId)}</span>
      <span data-testid="can-manage">{String(properties.canManage)}</span>
      <span data-testid="can-edit">{String(properties.canEdit)}</span>
      <span data-testid="user-id">{properties.userId}</span>
    </div>
  ),
}));

import ProjectPage from '@/app/(dashboard)/dashboard/projects/[id]/page';

function baseAccess(role: string, isAdmin = false) {
  return {
    project: {
      id: 'proj-1',
      name: 'My Project',
      description: 'desc',
      mainFileNodeId: 'node-9',
    },
    currentUserId: 'user-1',
    currentUserRole: role,
    isAdmin,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetProjectAccess.mockResolvedValue(baseAccess('owner'));
});

describe('ProjectPage', () => {
  test('requires at least viewer access for the resolved id', async () => {
    render(await ProjectPage({ params: Promise.resolve({ id: 'proj-1' }) }));
    expect(mockGetProjectAccess).toHaveBeenCalledWith('proj-1', 'viewer');
  });

  test('passes core project fields to the editor layout', async () => {
    render(await ProjectPage({ params: Promise.resolve({ id: 'proj-1' }) }));
    expect(screen.getByTestId('project-name')).toHaveTextContent('My Project');
    expect(screen.getByTestId('description')).toHaveTextContent('desc');
    expect(screen.getByTestId('main-file')).toHaveTextContent('node-9');
    expect(screen.getByTestId('user-id')).toHaveTextContent('user-1');
  });

  test('grants manage and edit to an owner', async () => {
    mockGetProjectAccess.mockResolvedValue(baseAccess('owner'));
    render(await ProjectPage({ params: Promise.resolve({ id: 'proj-1' }) }));
    expect(screen.getByTestId('can-manage')).toHaveTextContent('true');
    expect(screen.getByTestId('can-edit')).toHaveTextContent('true');
  });

  test('grants edit but not manage to an editor', async () => {
    mockGetProjectAccess.mockResolvedValue(baseAccess('editor'));
    render(await ProjectPage({ params: Promise.resolve({ id: 'proj-1' }) }));
    expect(screen.getByTestId('can-manage')).toHaveTextContent('false');
    expect(screen.getByTestId('can-edit')).toHaveTextContent('true');
  });

  test('denies manage and edit to a plain viewer', async () => {
    mockGetProjectAccess.mockResolvedValue(baseAccess('viewer'));
    render(await ProjectPage({ params: Promise.resolve({ id: 'proj-1' }) }));
    expect(screen.getByTestId('can-manage')).toHaveTextContent('false');
    expect(screen.getByTestId('can-edit')).toHaveTextContent('false');
  });

  test('grants edit to an admin viewer', async () => {
    mockGetProjectAccess.mockResolvedValue(baseAccess('viewer', true));
    render(await ProjectPage({ params: Promise.resolve({ id: 'proj-1' }) }));
    expect(screen.getByTestId('can-edit')).toHaveTextContent('true');
    expect(screen.getByTestId('can-manage')).toHaveTextContent('false');
  });

  test('coerces missing description and main file to null', async () => {
    mockGetProjectAccess.mockResolvedValue({
      project: { id: 'proj-1', name: 'My Project' },
      currentUserId: 'user-1',
      currentUserRole: 'viewer',
      isAdmin: false,
    });
    render(await ProjectPage({ params: Promise.resolve({ id: 'proj-1' }) }));
    expect(screen.getByTestId('description')).toHaveTextContent('null');
    expect(screen.getByTestId('main-file')).toHaveTextContent('null');
  });
});
