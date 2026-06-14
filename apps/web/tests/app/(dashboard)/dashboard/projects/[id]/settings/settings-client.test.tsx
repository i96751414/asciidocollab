import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsClient } from '@/app/(dashboard)/dashboard/projects/[id]/settings/settings-client';

const mockRouter = {
  refresh: jest.fn(),
  back: jest.fn(),
  push: jest.fn(),
};
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));

const mockUpdate = jest.fn();
jest.mock('@/lib/api', () => ({
  projectsApi: {
    update: (id: string, body: unknown) => mockUpdate(id, body),
  },
}));

interface ArchiveButtonProperties {
  onArchive?: () => void;
  onRestore?: () => void;
}

interface DeleteButtonProperties {
  onDeleted: () => void;
}

jest.mock('@/components/archive-button', () => ({
  ArchiveButton: ({ onArchive, onRestore }: ArchiveButtonProperties) => (
    <div data-testid="archive-button">
      <button type="button" onClick={onArchive}>fire-archive</button>
      <button type="button" onClick={onRestore}>fire-restore</button>
    </div>
  ),
}));

jest.mock('@/components/delete-project-button', () => ({
  DeleteProjectButton: ({ onDeleted }: DeleteButtonProperties) => (
    <div data-testid="delete-button">
      <button type="button" onClick={onDeleted}>fire-delete</button>
    </div>
  ),
}));

const PROJECT = {
  id: 'proj-1',
  name: 'My Project',
  description: 'A description',
  owners: [],
  tags: ['docs', 'api'],
  rootFolderId: null,
  mainFileNodeId: null,
  archivedAt: null,
  createdAt: '',
  updatedAt: '',
};

function renderClient(overrides: Partial<React.ComponentProps<typeof SettingsClient>> = {}) {
  const properties = {
    project: PROJECT,
    currentUserRole: 'owner',
    ...overrides,
  };
  return render(<SettingsClient {...properties} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.mockResolvedValue(undefined);
});

describe('SettingsClient — form rendering', () => {
  test('pre-fills the name, description, and tags', () => {
    renderClient();
    expect(screen.getByLabelText(/project name/i)).toHaveValue('My Project');
    expect(screen.getByLabelText(/description/i)).toHaveValue('A description');
    expect(screen.getByLabelText(/tags/i)).toHaveValue('docs, api');
  });

  test('renders empty fields when description and tags are absent', () => {
    renderClient({ project: { ...PROJECT, description: null, tags: [] } });
    expect(screen.getByLabelText(/description/i)).toHaveValue('');
    expect(screen.getByLabelText(/tags/i)).toHaveValue('');
  });
});

describe('SettingsClient — saving', () => {
  test('updates the project and shows a success banner', async () => {
    renderClient();
    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => {
      expect(screen.getByText(/project settings updated successfully/i)).toBeInTheDocument();
    });
    expect(mockUpdate).toHaveBeenCalledWith('proj-1', expect.objectContaining({ name: 'Renamed' }));
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  test('clears the description when emptied so it is sent as undefined', async () => {
    renderClient();
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockUpdate.mock.calls[0][1].description).toBeUndefined();
  });

  test('rewrites the tags from the comma-separated input', async () => {
    renderClient();
    fireEvent.change(screen.getByLabelText(/tags/i), { target: { value: 'one, two ,, three' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockUpdate.mock.calls[0][1].tags).toEqual(['one', 'two', 'three']);
  });

  test('shows the API error message when the update fails', async () => {
    mockUpdate.mockRejectedValue(new Error('server exploded'));
    renderClient();
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(screen.getByText(/server exploded/i)).toBeInTheDocument());
  });

  test('shows a generic error when the rejection is not an Error', async () => {
    mockUpdate.mockRejectedValue('boom string');
    renderClient();
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(screen.getByText(/failed to update project/i)).toBeInTheDocument());
  });

  test('shows a validation error for an empty name without calling the API', async () => {
    renderClient();
    const nameInput = screen.getByLabelText(/project name/i);
    nameInput.removeAttribute('required');
    fireEvent.change(nameInput, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => {
      const banner = document.querySelector('.text-destructive');
      expect(banner).toBeInTheDocument();
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('cancel navigates back', () => {
    renderClient();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockRouter.back).toHaveBeenCalled();
  });
});

describe('SettingsClient — archived state', () => {
  test('shows the read-only banner and hides the save controls', () => {
    renderClient({ project: { ...PROJECT, archivedAt: '2024-01-01T00:00:00Z' } });
    expect(screen.getByText(/settings are read-only/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/project name/i)).toBeDisabled();
  });
});

describe('SettingsClient — danger zone gating', () => {
  test('shows archive and delete controls for owners', () => {
    renderClient({ currentUserRole: 'owner' });
    expect(screen.getByText(/danger zone/i)).toBeInTheDocument();
    expect(screen.getByTestId('archive-button')).toBeInTheDocument();
    expect(screen.getByTestId('delete-button')).toBeInTheDocument();
  });

  test('hides the danger zone for non-owners', () => {
    renderClient({ currentUserRole: 'editor' });
    expect(screen.queryByText(/danger zone/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('archive-button')).not.toBeInTheDocument();
  });

  test('archiving navigates to the dashboard', () => {
    renderClient();
    fireEvent.click(screen.getByRole('button', { name: /fire-archive/i }));
    expect(mockRouter.push).toHaveBeenCalledWith('/dashboard');
  });

  test('restoring refreshes the page', () => {
    renderClient();
    fireEvent.click(screen.getByRole('button', { name: /fire-restore/i }));
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  test('deleting navigates to the dashboard with the deleted flag', () => {
    renderClient();
    fireEvent.click(screen.getByRole('button', { name: /fire-delete/i }));
    expect(mockRouter.push).toHaveBeenCalledWith('/dashboard?deleted=1');
  });
});
