import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import DashboardPage from '@/app/(dashboard)/dashboard/page';

const mockList = jest.fn();
jest.mock('@/lib/api', () => ({
  projectsApi: {
    list: (...arguments_: unknown[]) => mockList(...arguments_),
  },
}));

let searchValue: string | null = null;
// A single stable instance mirrors Next's real useSearchParams (a referentially stable
// ReadonlyURLSearchParams), so the notice effect runs once instead of on every render.
const stableSearchParameters = { get: () => searchValue };
jest.mock('next/navigation', () => ({
  useSearchParams: () => stableSearchParameters,
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

describe('DashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchValue = null;
  });

  test('renders the projects returned by the API', async () => {
    mockList.mockResolvedValue({ data: [project('p1', 'Alpha'), project('p2', 'Beta')] });
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getAllByTestId('project-card')).toHaveLength(2);
    });
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(mockList).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  test('renders the empty state when there are no projects', async () => {
    mockList.mockResolvedValue({ data: [] });
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
  });

  test('renders the error message when the API rejects with an Error', async () => {
    mockList.mockRejectedValue(new Error('Server is down'));
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Server is down')).toBeInTheDocument();
    });
  });

  test('renders a fallback error message when the API rejects with a non-Error', async () => {
    mockList.mockRejectedValue('oops');
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load projects/i)).toBeInTheDocument();
    });
  });

  test('shows the deleted notice when the deleted=1 query param is present', async () => {
    searchValue = '1';
    mockList.mockResolvedValue({ data: [] });
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText(/project deleted successfully/i)).toBeInTheDocument();
    });
  });

  test('hides the deleted notice after the timeout elapses', async () => {
    jest.useFakeTimers();
    try {
      searchValue = '1';
      mockList.mockResolvedValue({ data: [] });
      render(<DashboardPage />);
      // Flush the resolved list promise so the component leaves its loading state and
      // settles on a single pending dismiss timer (the notice effect re-runs per render).
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByText(/project deleted successfully/i)).toBeInTheDocument();
      act(() => {
        jest.runOnlyPendingTimers();
      });
      expect(screen.queryByText(/project deleted successfully/i)).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  test('renders the loading skeleton before the projects resolve', () => {
    mockList.mockReturnValue(new Promise(() => {}));
    const { container } = render(<DashboardPage />);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3);
  });
});
