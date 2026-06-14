import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ArchivedProjectsPage from '@/app/(dashboard)/dashboard/archived/page';

const mockList = jest.fn();
jest.mock('@/lib/api', () => ({
  projectsApi: {
    list: (...arguments_: unknown[]) => mockList(...arguments_),
  },
}));

jest.mock('@/components/project-card', () => ({
  ProjectCard: ({ project }: { project: { id: string; name: string } }) => (
    <div data-testid="project-card">{project.name}</div>
  ),
}));

jest.mock('@/components/empty-state', () => ({
  EmptyState: ({ title }: { title: string }) => <div data-testid="empty-state">{title}</div>,
}));

function project(id: string, name: string) {
  return { id, name };
}

describe('ArchivedProjectsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('requests archived projects from the API', async () => {
    mockList.mockResolvedValue({ data: [] });
    render(<ArchivedProjectsPage />);
    await waitFor(() => {
      expect(mockList).toHaveBeenCalledWith({ page: 1, limit: 50, archived: true });
    });
  });

  test('renders the archived projects and a singular count', async () => {
    mockList.mockResolvedValue({ data: [project('p1', 'Alpha')] });
    render(<ArchivedProjectsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('project-card')).toBeInTheDocument();
    });
    expect(screen.getByText('1 archived project')).toBeInTheDocument();
  });

  test('uses the plural count when more than one archived project exists', async () => {
    mockList.mockResolvedValue({ data: [project('p1', 'Alpha'), project('p2', 'Beta')] });
    render(<ArchivedProjectsPage />);
    await waitFor(() => {
      expect(screen.getByText('2 archived projects')).toBeInTheDocument();
    });
  });

  test('renders the empty state when there are no archived projects', async () => {
    mockList.mockResolvedValue({ data: [] });
    render(<ArchivedProjectsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toHaveTextContent(/no archived projects/i);
    });
  });

  test('renders the error message when the API rejects with an Error', async () => {
    mockList.mockRejectedValue(new Error('Boom'));
    render(<ArchivedProjectsPage />);
    await waitFor(() => {
      expect(screen.getByText('Boom')).toBeInTheDocument();
    });
  });

  test('renders a fallback error message when the API rejects with a non-Error', async () => {
    mockList.mockRejectedValue('nope');
    render(<ArchivedProjectsPage />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load projects/i)).toBeInTheDocument();
    });
  });

  test('renders the loading skeleton before the projects resolve', () => {
    mockList.mockReturnValue(new Promise(() => {}));
    const { container } = render(<ArchivedProjectsPage />);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3);
    expect(screen.getByText('Archived Projects')).toBeInTheDocument();
  });
});
