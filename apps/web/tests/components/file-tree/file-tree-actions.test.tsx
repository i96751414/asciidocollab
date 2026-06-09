import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileTreeActions } from '@/components/file-tree/file-tree-actions';

// Mock Radix dropdown so items render inline for testing
jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect, className, disabled }: { children: React.ReactNode; onSelect?: () => void; className?: string; disabled?: boolean }) => (
    <button onClick={onSelect} className={className} disabled={disabled}>{children}</button>
  ),
  DropdownMenuSeparator: () => <hr />,
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

function openRenameAndConfirm() {
  fireEvent.click(screen.getByText(/Rename/i));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'renamed.adoc' } });
  fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
}

describe('FileTreeActions', () => {
  const projectId = 'proj-1';
  const fileNodeId = 'node-1';
  const parentId = 'parent-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('folder node with canCreate shows New File, New Folder, Rename, Delete (no Move)', () => {
    render(
      <FileTreeActions
        projectId={projectId}
        fileNodeId={fileNodeId}
        parentId={parentId}
        nodeType="folder"
        nodeName="src"
        hasChildren={false}
        canCreate
        onUpdate={jest.fn()}
        onError={jest.fn()}
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
        onError={jest.fn()}
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
        onError={jest.fn()}
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
        onError={jest.fn()}
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
        onError={jest.fn()}
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
        onError={jest.fn()}
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
        onError={jest.fn()}
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
        canCreate
        onUpdate={jest.fn()}
        onError={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByText(/New File/i));

    expect(screen.getByTestId('dialog-content')).toBeInTheDocument();
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('new-document.adoc');

    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() => expect(createFileNode).toHaveBeenCalledWith(projectId, fileNodeId, 'new-document.adoc'));
  });

  // T007: invalid-name operation calls onError prop (not renders inline span)
  it('T007: failed rename calls onError prop with error message and does not render inline error span', async () => {
    const { renameFileNode } = jest.requireMock('@/lib/api/file-tree');
    renameFileNode.mockRejectedValueOnce(new Error('Name is invalid.'));
    const onError = jest.fn();

    render(
      <FileTreeActions
        projectId={projectId}
        fileNodeId={fileNodeId}
        parentId={parentId}
        nodeType="file"
        nodeName="test.adoc"
        hasChildren={false}
        onUpdate={jest.fn()}
        onError={onError}
      />,
    );

    fireEvent.click(screen.getByText(/Rename/i));
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Name is invalid.'));
    expect(screen.queryByText('Name is invalid.')).not.toBeInTheDocument();
  });

  it('shows navigation items when their callbacks are provided', () => {
    render(
      <FileTreeActions
        projectId={projectId}
        fileNodeId={fileNodeId}
        parentId={parentId}
        nodeType="folder"
        nodeName="root"
        hasChildren={false}
        isRoot
        onFind={jest.fn()}
        onCollapseAll={jest.fn()}
        onExpandAll={jest.fn()}
        onRevealInTree={jest.fn()}
        hasSelection
      />,
    );
    expect(screen.getByText(/Find File…/i)).toBeInTheDocument();
    expect(screen.getByText(/Collapse All/i)).toBeInTheDocument();
    expect(screen.getByText(/Expand All/i)).toBeInTheDocument();
    expect(screen.getByText(/Reveal in Tree/i)).toBeInTheDocument();
  });

  it('calls each navigation callback when its item is clicked', () => {
    const onFind = jest.fn();
    const onCollapseAll = jest.fn();
    const onExpandAll = jest.fn();
    const onRevealInTree = jest.fn();
    render(
      <FileTreeActions
        projectId={projectId}
        fileNodeId={fileNodeId}
        parentId={parentId}
        nodeType="folder"
        nodeName="root"
        hasChildren={false}
        isRoot
        onFind={onFind}
        onCollapseAll={onCollapseAll}
        onExpandAll={onExpandAll}
        onRevealInTree={onRevealInTree}
        hasSelection
      />,
    );
    fireEvent.click(screen.getByText(/Find File…/i));
    fireEvent.click(screen.getByText(/Collapse All/i));
    fireEvent.click(screen.getByText(/Expand All/i));
    fireEvent.click(screen.getByText(/Reveal in Tree/i));
    expect(onFind).toHaveBeenCalledTimes(1);
    expect(onCollapseAll).toHaveBeenCalledTimes(1);
    expect(onExpandAll).toHaveBeenCalledTimes(1);
    expect(onRevealInTree).toHaveBeenCalledTimes(1);
  });

  it('"Reveal in Tree" is disabled when hasSelection is false', () => {
    render(
      <FileTreeActions
        projectId={projectId}
        fileNodeId={fileNodeId}
        parentId={parentId}
        nodeType="folder"
        nodeName="root"
        hasChildren={false}
        isRoot
        onRevealInTree={jest.fn()}
        hasSelection={false}
      />,
    );
    expect(screen.getByText(/Reveal in Tree/i).closest('button')).toBeDisabled();
  });

  it('"Reveal in Tree" is enabled when hasSelection is true', () => {
    render(
      <FileTreeActions
        projectId={projectId}
        fileNodeId={fileNodeId}
        parentId={parentId}
        nodeType="folder"
        nodeName="root"
        hasChildren={false}
        isRoot
        onRevealInTree={jest.fn()}
        hasSelection
      />,
    );
    expect(screen.getByText(/Reveal in Tree/i).closest('button')).not.toBeDisabled();
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
        canCreate
        onUpdate={jest.fn()}
        onError={jest.fn()}
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

// ── T055: Download action ────────────────────────────────────────────────────

describe('FileTreeActions — Download', () => {
  const projectId = 'proj-1';
  const fileNodeId = 'node-file-1';
  const parentId = 'parent-1';

  it('renders "Download" option for FILE nodes', () => {
    render(
      <FileTreeActions
        projectId={projectId}
        fileNodeId={fileNodeId}
        parentId={parentId}
        nodeType="file"
        nodeName="readme.adoc"
        hasChildren={false}
      />,
    );
    expect(screen.getByText(/download/i)).toBeInTheDocument();
  });

  it('does NOT render "Download" option for FOLDER nodes', () => {
    render(
      <FileTreeActions
        projectId={projectId}
        fileNodeId={fileNodeId}
        parentId={parentId}
        nodeType="folder"
        nodeName="src"
        hasChildren={false}
      />,
    );
    expect(screen.queryByText(/download/i)).not.toBeInTheDocument();
  });

  it('Download <a> element has correct href pointing to file download endpoint', () => {
    render(
      <FileTreeActions
        projectId={projectId}
        fileNodeId={fileNodeId}
        parentId={parentId}
        nodeType="file"
        nodeName="readme.adoc"
        hasChildren={false}
      />,
    );
    const downloadLink = screen.getByRole('link', { name: /download/i });
    expect(downloadLink).toHaveAttribute('href', expect.stringContaining(`/projects/${projectId}/files/${fileNodeId}/download`));
  });

  it('Download <a> element has the download attribute set (native browser download)', () => {
    render(
      <FileTreeActions
        projectId={projectId}
        fileNodeId={fileNodeId}
        parentId={parentId}
        nodeType="file"
        nodeName="readme.adoc"
        hasChildren={false}
      />,
    );
    const downloadLink = screen.getByRole('link', { name: /download/i });
    expect(downloadLink).toHaveAttribute('download');
  });
});

// ── Issue 3: Download ZIP in Files root menu ─────────────────────────────────

describe('FileTreeActions — Download ZIP (root)', () => {
  const projectId = 'proj-1';
  const fileNodeId = 'root-id';
  const parentId = '';

  it('renders "Download ZIP" option for the root (isRoot=true) node', () => {
    render(
      <FileTreeActions
        projectId={projectId}
        fileNodeId={fileNodeId}
        parentId={parentId}
        nodeType="folder"
        nodeName="root"
        hasChildren={false}
        isRoot
      />,
    );
    expect(screen.getByText(/download zip/i)).toBeInTheDocument();
  });

  it('Download ZIP <a> has correct href pointing to the project download endpoint', () => {
    render(
      <FileTreeActions
        projectId={projectId}
        fileNodeId={fileNodeId}
        parentId={parentId}
        nodeType="folder"
        nodeName="root"
        hasChildren={false}
        isRoot
      />,
    );
    const link = screen.getByRole('link', { name: /download zip/i });
    expect(link).toHaveAttribute('href', expect.stringContaining(`/projects/${projectId}/download`));
    expect(link).toHaveAttribute('download');
  });

  it('non-root folders do NOT show "Download ZIP"', () => {
    render(
      <FileTreeActions
        projectId={projectId}
        fileNodeId={fileNodeId}
        parentId={parentId}
        nodeType="folder"
        nodeName="src"
        hasChildren={false}
      />,
    );
    expect(screen.queryByText(/download zip/i)).not.toBeInTheDocument();
  });

  describe('handleAction error and optional-callback branches', () => {
    const baseProperties = {
      projectId,
      fileNodeId,
      parentId,
      nodeType: 'file' as const,
      nodeName: 'test.adoc',
      hasChildren: false,
    };

    it('reports a friendly message on a 409 conflict', async () => {
      const { renameFileNode, FileTreeApiError } = jest.requireMock('@/lib/api/file-tree');
      renameFileNode.mockRejectedValueOnce(new FileTreeApiError(409, 'CONFLICT', 'exists'));
      const onError = jest.fn();
      render(<FileTreeActions {...baseProperties} onError={onError} onUpdate={jest.fn()} />);
      openRenameAndConfirm();
      await waitFor(() =>
        expect(onError).toHaveBeenCalledWith('A file or folder with that name already exists.'),
      );
    });

    it('reports a generic message when the failure is not an Error', async () => {
      const { renameFileNode } = jest.requireMock('@/lib/api/file-tree');
      renameFileNode.mockRejectedValueOnce('boom');
      const onError = jest.fn();
      render(<FileTreeActions {...baseProperties} onError={onError} onUpdate={jest.fn()} />);
      openRenameAndConfirm();
      await waitFor(() => expect(onError).toHaveBeenCalledWith('An error occurred.'));
    });

    it('tolerates missing onError and onUpdate callbacks on success', async () => {
      const { renameFileNode } = jest.requireMock('@/lib/api/file-tree');
      renameFileNode.mockResolvedValueOnce(undefined);
      render(<FileTreeActions {...baseProperties} />);
      expect(() => openRenameAndConfirm()).not.toThrow();
      await waitFor(() => expect(renameFileNode).toHaveBeenCalled());
    });

    it('confirms the dialog when Enter is pressed in the input', async () => {
      const { renameFileNode } = jest.requireMock('@/lib/api/file-tree');
      render(<FileTreeActions {...baseProperties} onUpdate={jest.fn()} onError={jest.fn()} />);
      fireEvent.click(screen.getByText(/Rename/i));
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'via-enter.adoc' } });
      fireEvent.keyDown(input, { key: 'a' }); // non-Enter: no submit
      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() =>
        expect(renameFileNode).toHaveBeenCalledWith(projectId, fileNodeId, 'via-enter.adoc'),
      );
    });

    it('keeps the delete dialog open when deletion fails', async () => {
      const { deleteFileNode } = jest.requireMock('@/lib/api/file-tree');
      deleteFileNode.mockRejectedValueOnce(new Error('delete failed'));
      render(<FileTreeActions {...baseProperties} onUpdate={jest.fn()} onError={jest.fn()} />);
      fireEvent.click(screen.getByText(/Delete/i));
      fireEvent.click(screen.getByTestId('confirm-button'));
      await waitFor(() => expect(deleteFileNode).toHaveBeenCalled());
      expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
    });
  });
});
