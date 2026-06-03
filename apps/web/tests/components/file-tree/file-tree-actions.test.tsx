import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileTreeActions } from '@/components/file-tree/file-tree-actions';

// Mock Radix dropdown so items render inline for testing
jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect, className }: { children: React.ReactNode; onSelect?: () => void; className?: string }) => (
    <button onClick={onSelect} className={className}>{children}</button>
  ),
  DropdownMenuPortal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock Radix dialog to render inline with controlled open state
jest.mock('@radix-ui/react-dialog', () => ({
  Root: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? <div data-testid="dialog-root">{children}</div> : <div data-testid="dialog-root-closed">{children}</div>,
  Portal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Overlay: () => null,
  Content: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-content">{children}</div>,
  Title: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  Description: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Close: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <button>{children}</button>,
}));

// Mock ConfirmationDialog
jest.mock('@/components/confirmation-dialog', () => ({
  ConfirmationDialog: ({
    open,
    title,
    description,
    onConfirm,
    onOpenChange,
  }: {
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    onOpenChange: (v: boolean) => void;
  }) => open ? (
    <div data-testid="confirmation-dialog">
      <p data-testid="confirm-title">{title}</p>
      <p data-testid="confirm-description">{description}</p>
      <button data-testid="confirm-button" onClick={onConfirm}>Confirm</button>
      <button data-testid="cancel-button" onClick={() => onOpenChange(false)}>Cancel</button>
    </div>
  ) : null,
}));

jest.mock('@/lib/api/file-tree', () => ({
  createFolder: jest.fn().mockResolvedValue({ fileNodeId: 'new-folder', path: '/new-folder' }),
  createFileNode: jest.fn().mockResolvedValue({ fileNodeId: 'new-file', path: '/new-file.adoc' }),
  renameFileNode: jest.fn().mockResolvedValue(undefined),
  moveFileNode: jest.fn().mockResolvedValue(undefined),
  deleteFileNode: jest.fn().mockResolvedValue(undefined),
  FileTreeApiError: class FileTreeApiError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  },
}));

describe('FileTreeActions', () => {
  const projectId = 'proj-1';
  const fileNodeId = 'node-1';
  const parentId = 'parent-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('folder node shows New File, New Folder, Rename, Delete (no Move)', () => {
    render(
      <FileTreeActions
        projectId={projectId}
        fileNodeId={fileNodeId}
        parentId={parentId}
        nodeType="folder"
        nodeName="src"
        hasChildren={false}
        onUpdate={jest.fn()}
      />,
    );

    expect(screen.getByText(/New File/i)).toBeInTheDocument();
    expect(screen.getByText(/New Folder/i)).toBeInTheDocument();
    expect(screen.getByText(/Rename/i)).toBeInTheDocument();
    expect(screen.getByText(/Delete/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Move$/i)).not.toBeInTheDocument();
  });

  it('file node shows Rename and Delete but not New File or New Folder', () => {
    render(
      <FileTreeActions
        projectId={projectId}
        fileNodeId={fileNodeId}
        parentId={parentId}
        nodeType="file"
        nodeName="test.adoc"
        hasChildren={false}
        onUpdate={jest.fn()}
      />,
    );

    expect(screen.queryByText(/New File/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/New Folder/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Rename/i)).toBeInTheDocument();
    expect(screen.getByText(/Delete/i)).toBeInTheDocument();
  });

  // T019: Rename uses Dialog, NOT window.prompt
  it('clicking Rename opens a Dialog with pre-filled input, and does NOT call window.prompt', () => {
    const promptSpy = jest.spyOn(globalThis, 'prompt').mockReturnValue(null);

    render(
      <FileTreeActions
        projectId={projectId}
        fileNodeId={fileNodeId}
        parentId={parentId}
        nodeType="file"
        nodeName="test.adoc"
        hasChildren={false}
        onUpdate={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByText(/Rename/i));

    expect(promptSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('dialog-content')).toBeInTheDocument();
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('test.adoc');

    promptSpy.mockRestore();
  });

  // C4: input dialog must stay open when API returns an error so user keeps their input
  // The mock Dialog.Root renders data-testid="dialog-root" when open=true,
  // and data-testid="dialog-root-closed" when open=false.
  it('Rename Dialog stays open (dialog-root visible) when renameFileNode returns an error', async () => {
    const { renameFileNode } = jest.requireMock('@/lib/api/file-tree');
    renameFileNode.mockRejectedValueOnce(new Error('Server error'));

    render(
      <FileTreeActions
        projectId={projectId}
        fileNodeId={fileNodeId}
        parentId={parentId}
        nodeType="file"
        nodeName="test.adoc"
        hasChildren={false}
        onUpdate={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByText(/Rename/i));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'taken.adoc' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => expect(renameFileNode).toHaveBeenCalled());
    // open=true → dialog-root; open=false → dialog-root-closed. Must stay open.
    expect(screen.getByTestId('dialog-root')).toBeInTheDocument();
    expect(screen.queryByTestId('dialog-root-closed')).not.toBeInTheDocument();
  });

  it('Rename Dialog: typing new name and confirming calls renameFileNode', async () => {
    const { renameFileNode } = jest.requireMock('@/lib/api/file-tree');
    render(
      <FileTreeActions
        projectId={projectId}
        fileNodeId={fileNodeId}
        parentId={parentId}
        nodeType="file"
        nodeName="test.adoc"
        hasChildren={false}
        onUpdate={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByText(/Rename/i));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'renamed.adoc' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => expect(renameFileNode).toHaveBeenCalledWith(projectId, fileNodeId, 'renamed.adoc'));
  });

  // T020 (a): Delete file/empty folder — ConfirmationDialog appears; confirming calls deleteFileNode
  it('clicking Delete opens ConfirmationDialog for file/empty-folder', async () => {
    const onUpdate = jest.fn();
    const { deleteFileNode } = jest.requireMock('@/lib/api/file-tree');
    render(
      <FileTreeActions
        projectId={projectId}
        fileNodeId={fileNodeId}
        parentId={parentId}
        nodeType="file"
        nodeName="test.adoc"
        hasChildren={false}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.click(screen.getByText(/Delete/i));

    expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-title')).toHaveTextContent('Delete test.adoc?');

    fireEvent.click(screen.getByTestId('confirm-button'));
    await waitFor(() => expect(deleteFileNode).toHaveBeenCalledWith(projectId, fileNodeId));
    // C1: dialog must close after successful delete
    await waitFor(() => expect(screen.queryByTestId('confirmation-dialog')).not.toBeInTheDocument());
  });

  // T020 (b): Delete non-empty folder — ConfirmationDialog with "also delete all files inside" warning
  it('Delete non-empty folder shows warning in ConfirmationDialog', () => {
    render(
      <FileTreeActions
        projectId={projectId}
        fileNodeId={fileNodeId}
        parentId={parentId}
        nodeType="folder"
        nodeName="src"
        hasChildren={true}
        onUpdate={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByText(/Delete/i));

    expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-description')).toHaveTextContent(/This will also delete all files inside/i);
  });

  // T021: Create file — Dialog with input defaulted to "new-document.adoc"
  it('clicking New File opens Dialog with default filename input', async () => {
    const { createFileNode } = jest.requireMock('@/lib/api/file-tree');
    render(
      <FileTreeActions
        projectId={projectId}
        fileNodeId={fileNodeId}
        parentId={parentId}
        nodeType="folder"
        nodeName="src"
        hasChildren={false}
        onUpdate={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByText(/New File/i));

    expect(screen.getByTestId('dialog-content')).toBeInTheDocument();
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('new-document.adoc');

    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() => expect(createFileNode).toHaveBeenCalledWith(projectId, fileNodeId, 'new-document.adoc'));
  });

  it('clicking New Folder opens Dialog with default folder name input', async () => {
    const { createFolder } = jest.requireMock('@/lib/api/file-tree');
    render(
      <FileTreeActions
        projectId={projectId}
        fileNodeId={fileNodeId}
        parentId={parentId}
        nodeType="folder"
        nodeName="src"
        hasChildren={false}
        onUpdate={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByText(/New Folder/i));

    expect(screen.getByTestId('dialog-content')).toBeInTheDocument();
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('New Folder');

    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() => expect(createFolder).toHaveBeenCalledWith(projectId, fileNodeId, 'New Folder'));
  });
});
