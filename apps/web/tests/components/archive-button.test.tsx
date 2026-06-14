import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ArchiveButton } from '@/components/archive-button';

const mockArchive = jest.fn();
const mockRestore = jest.fn();

jest.mock('@/lib/api', () => ({
  projectsApi: {
    archive: (id: string) => mockArchive(id),
    restore: (id: string) => mockRestore(id),
  },
}));

// Render the confirmation dialog inline so its controls are always queryable.
jest.mock('@/components/confirmation-dialog', () => ({
  ConfirmationDialog: ({
    open,
    title,
    description,
    confirmLabel,
    onConfirm,
    onOpenChange,
    loading,
  }: {
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    onConfirm: () => void;
    onOpenChange: (open: boolean) => void;
    loading?: boolean;
  }) =>
    open ? (
      <div role="dialog">
        <h2>{title}</h2>
        <p>{description}</p>
        <button type="button" onClick={onConfirm} disabled={loading}>
          {confirmLabel}
        </button>
        <button type="button" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
      </div>
    ) : null,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockArchive.mockResolvedValue({ data: { id: 'p1', archivedAt: 'now' } });
  mockRestore.mockResolvedValue({ data: { id: 'p1', archivedAt: null } });
});

describe('ArchiveButton', () => {
  test('renders the archive trigger for an active project', () => {
    render(<ArchiveButton projectId="p1" projectName="Docs" isArchived={false} />);
    expect(screen.getByRole('button', { name: 'Archive Project' })).toBeInTheDocument();
  });

  test('renders the restore trigger for an archived project', () => {
    render(<ArchiveButton projectId="p1" projectName="Docs" isArchived={true} />);
    expect(screen.getByRole('button', { name: 'Restore Project' })).toBeInTheDocument();
  });

  test('opens the confirmation dialog with archive copy', () => {
    render(<ArchiveButton projectId="p1" projectName="Docs" isArchived={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Archive Project' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/will be hidden from the active project list/)).toBeInTheDocument();
  });

  test('opens the confirmation dialog with restore copy', () => {
    render(<ArchiveButton projectId="p1" projectName="Docs" isArchived={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore Project' }));
    expect(screen.getByText(/It will become active again/)).toBeInTheDocument();
  });

  test('archives the project and fires onArchive on confirm', async () => {
    const onArchive = jest.fn();
    render(
      <ArchiveButton projectId="p1" projectName="Docs" isArchived={false} onArchive={onArchive} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Archive Project' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(mockArchive).toHaveBeenCalledWith('p1'));
    expect(onArchive).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('restores the project and fires onRestore on confirm', async () => {
    const onRestore = jest.fn();
    render(
      <ArchiveButton projectId="p1" projectName="Docs" isArchived={true} onRestore={onRestore} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Restore Project' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(mockRestore).toHaveBeenCalledWith('p1'));
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  test('shows the error message when archiving fails with an Error', async () => {
    mockArchive.mockRejectedValueOnce(new Error('Network down'));
    render(<ArchiveButton projectId="p1" projectName="Docs" isArchived={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Archive Project' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(await screen.findByText('Network down')).toBeInTheDocument();
  });

  test('shows a generic message when the rejection is not an Error', async () => {
    mockArchive.mockRejectedValueOnce('boom');
    render(<ArchiveButton projectId="p1" projectName="Docs" isArchived={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Archive Project' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(await screen.findByText('Operation failed')).toBeInTheDocument();
  });

  test('cancel closes the dialog without calling the API', () => {
    render(<ArchiveButton projectId="p1" projectName="Docs" isArchived={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Archive Project' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockArchive).not.toHaveBeenCalled();
  });

  test('archives without an onArchive callback', async () => {
    render(<ArchiveButton projectId="p1" projectName="Docs" isArchived={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Archive Project' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(mockArchive).toHaveBeenCalledWith('p1'));
  });

  test('restores without an onRestore callback', async () => {
    render(<ArchiveButton projectId="p1" projectName="Docs" isArchived={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore Project' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(mockRestore).toHaveBeenCalledWith('p1'));
  });
});
