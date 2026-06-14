import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileTree } from '@/components/file-tree/file-tree';

// Minimal tree structure for DnD tests
const PROJECT_ID = 'proj-dnd';
const ROOT_ID    = 'root-1';
const FOLDER_A   = 'folder-a';
const FOLDER_B   = 'folder-b';
const FILE_1     = 'file-1';

jest.mock('@/hooks/use-file-tree-events', () => ({
  useFileTreeEvents: jest.fn(),
}));
jest.mock('@/hooks/use-key-bindings', () => ({
  useKeyBindings: jest.fn(() => new Map()),
}));
jest.mock('@/hooks/use-file-tree-key-handler', () => ({
  useFileTreeKeyHandler: jest.fn(),
}));

// Mock fetch for tree loading
const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

const mockTree = {
  id: ROOT_ID,
  name: 'Project',
  type: 'folder',
  path: '/',
  parentId: null,
  children: [
    {
      id: FOLDER_A,
      name: 'folder-a',
      type: 'folder',
      path: '/folder-a',
      parentId: ROOT_ID,
      children: [
        {
          id: FILE_1,
          name: 'document.adoc',
          type: 'file',
          path: '/folder-a/document.adoc',
          parentId: FOLDER_A,
          children: [],
        },
      ],
    },
    {
      id: FOLDER_B,
      name: 'folder-b',
      type: 'folder',
      path: '/folder-b',
      parentId: ROOT_ID,
      children: [],
    },
  ],
};

function buildServer() {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockTree),
  });
}

describe('FileTree — Drag and Drop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    buildServer();
    // jsdom does not implement scrollIntoView; the folder-reveal path calls it.
    Element.prototype.scrollIntoView = jest.fn();
  });

  test('dragging a file node updates drag state (data-dragging attribute or visual state)', async () => {
    render(
      <FileTree
        projectId={PROJECT_ID}
        canEdit
        onSelectFile={jest.fn()}
        selectedNodeId={null}
      />,
    );

    await waitFor(() => expect(screen.queryByText('document.adoc')).toBeInTheDocument());

    const fileNode = screen.getByText('document.adoc');
    fireEvent.dragStart(fileNode, { dataTransfer: { setData: jest.fn(), effectAllowed: '' } });

    // After dragStart, the tree should track the dragged node
    expect(screen.getByTestId('file-tree')).toHaveAttribute('data-drag-active', 'true');
  });

  test('dropping a file on a valid folder shows the move confirmation dialog', async () => {
    render(
      <FileTree
        projectId={PROJECT_ID}
        canEdit
        onSelectFile={jest.fn()}
        selectedNodeId={null}
      />,
    );

    await waitFor(() => expect(screen.queryByText('document.adoc')).toBeInTheDocument());

    const fileNode = screen.getByText('document.adoc');
    const targetFolder = screen.getByText('folder-b');

    fireEvent.dragStart(fileNode, { dataTransfer: { setData: jest.fn(), effectAllowed: '' } });
    fireEvent.dragEnter(targetFolder, { dataTransfer: { dropEffect: '' } });
    fireEvent.dragOver(targetFolder, { dataTransfer: { dropEffect: '' } });
    fireEvent.drop(targetFolder, { dataTransfer: { getData: jest.fn().mockReturnValue(FILE_1) } });

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  test('dropping a file on its own parent folder is a no-op (no dialog)', async () => {
    render(
      <FileTree
        projectId={PROJECT_ID}
        canEdit
        onSelectFile={jest.fn()}
        selectedNodeId={null}
      />,
    );

    await waitFor(() => expect(screen.queryByText('document.adoc')).toBeInTheDocument());

    const fileNode = screen.getByText('document.adoc');
    // folder-a is the parent of document.adoc
    const sameParentFolder = screen.getByText('folder-a');

    fireEvent.dragStart(fileNode, { dataTransfer: { setData: jest.fn() } });
    fireEvent.drop(sameParentFolder, { dataTransfer: { getData: jest.fn().mockReturnValue(FILE_1) } });

    // No dialog should appear
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('cancelling the move confirmation dialog leaves tree unchanged', async () => {
    render(
      <FileTree
        projectId={PROJECT_ID}
        canEdit
        onSelectFile={jest.fn()}
        selectedNodeId={null}
      />,
    );

    await waitFor(() => expect(screen.queryByText('document.adoc')).toBeInTheDocument());

    const fileNode = screen.getByText('document.adoc');
    const targetFolder = screen.getByText('folder-b');

    fireEvent.dragStart(fileNode, { dataTransfer: { setData: jest.fn() } });
    fireEvent.drop(targetFolder, { dataTransfer: { getData: jest.fn().mockReturnValue(FILE_1) } });

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    // Dialog dismissed, document still in original location
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('document.adoc')).toBeInTheDocument();
  });

  test('openPathRequest resolves a relative path and selects the matching file', async () => {
    const onSelectFile = jest.fn();
    const { rerender } = render(
      <FileTree projectId={PROJECT_ID} canEdit onSelectFile={onSelectFile} selectedNodeId={null} openPathRequest={null} />,
    );
    await waitFor(() => expect(screen.queryByText('document.adoc')).toBeInTheDocument());

    rerender(
      <FileTree
        projectId={PROJECT_ID} canEdit onSelectFile={onSelectFile} selectedNodeId={null}
        openPathRequest={{ path: 'folder-a/document.adoc', nonce: 1 }}
      />,
    );

    await waitFor(() =>
      expect(onSelectFile).toHaveBeenCalledWith(FILE_1, 'document.adoc', '/folder-a/document.adoc', 'file'),
    );
  });

  test('openPathRequest for a folder path reveals it without selecting a file', async () => {
    const onSelectFile = jest.fn();
    const { rerender } = render(
      <FileTree projectId={PROJECT_ID} canEdit onSelectFile={onSelectFile} selectedNodeId={null} openPathRequest={null} />,
    );
    await waitFor(() => expect(screen.queryByText('folder-a')).toBeInTheDocument());

    rerender(
      <FileTree
        projectId={PROJECT_ID} canEdit onSelectFile={onSelectFile} selectedNodeId={null}
        openPathRequest={{ path: 'folder-a', nonce: 7 }}
      />,
    );
    // Folders are revealed, never selected as a file.
    await waitFor(() => expect(screen.getByText('folder-a')).toBeInTheDocument());
    expect(onSelectFile).not.toHaveBeenCalled();
  });

  test('dropping a folder onto itself is a no-op (no dialog)', async () => {
    render(<FileTree projectId={PROJECT_ID} canEdit onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => expect(screen.queryByText('folder-a')).toBeInTheDocument());

    const folderA = screen.getByText('folder-a');
    fireEvent.dragStart(folderA, { dataTransfer: { setData: jest.fn(), effectAllowed: '' } });
    fireEvent.drop(folderA, { dataTransfer: { getData: jest.fn().mockReturnValue(FOLDER_A) } });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('dropping a node whose id is unknown is a no-op (source not found guard)', async () => {
    render(<FileTree projectId={PROJECT_ID} canEdit onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => expect(screen.queryByText('folder-b')).toBeInTheDocument());

    const targetFolder = screen.getByText('folder-b');
    // No dragStart fired (so the tracked ref is null); the payload references a non-existent node.
    fireEvent.drop(targetFolder, { dataTransfer: { getData: jest.fn().mockReturnValue('ghost-id') } });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('a move that collides with an existing destination name flags a conflict', async () => {
    const conflictServer = {
      id: ROOT_ID, name: 'Project', type: 'folder', path: '/', parentId: null,
      children: [
        {
          id: FOLDER_A, name: 'folder-a', type: 'folder', path: '/folder-a', parentId: ROOT_ID,
          children: [{ id: FILE_1, name: 'shared.adoc', type: 'file', path: '/folder-a/shared.adoc', parentId: FOLDER_A, children: [] }],
        },
        {
          id: FOLDER_B, name: 'folder-b', type: 'folder', path: '/folder-b', parentId: ROOT_ID,
          children: [{ id: 'file-2', name: 'shared.adoc', type: 'file', path: '/folder-b/shared.adoc', parentId: FOLDER_B, children: [] }],
        },
      ],
    };
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(conflictServer) });

    render(<FileTree projectId={PROJECT_ID} canEdit onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => expect(screen.queryByText('folder-b')).toBeInTheDocument());

    const fileNode = screen.getAllByText('shared.adoc')[0];
    const targetFolder = screen.getByText('folder-b');
    fireEvent.dragStart(fileNode, { dataTransfer: { setData: jest.fn(), effectAllowed: '' } });
    fireEvent.drop(targetFolder, { dataTransfer: { getData: jest.fn().mockReturnValue(FILE_1) } });

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByText(/already exists in the destination/i)).toBeInTheDocument();
  });

  test('dragStart originating off any node row does not activate a drag', async () => {
    render(<FileTree projectId={PROJECT_ID} canEdit onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => expect(screen.queryByText('document.adoc')).toBeInTheDocument());

    // The container itself has no data-node-id ancestor row → the guard bails before setting state.
    fireEvent.dragStart(screen.getByTestId('file-tree'), { dataTransfer: { setData: jest.fn(), effectAllowed: '' } });
    expect(screen.getByTestId('file-tree')).not.toHaveAttribute('data-drag-active');
  });

  test('a re-fired openPathRequest with the same nonce is ignored', async () => {
    const onSelectFile = jest.fn();
    const { rerender } = render(
      <FileTree projectId={PROJECT_ID} canEdit onSelectFile={onSelectFile} selectedNodeId={null} openPathRequest={{ path: 'folder-a/document.adoc', nonce: 3 }} />,
    );
    await waitFor(() => expect(onSelectFile).toHaveBeenCalledTimes(1));

    // Re-render with the identical nonce: the resolve effect must not fire again.
    rerender(
      <FileTree projectId={PROJECT_ID} canEdit onSelectFile={onSelectFile} selectedNodeId={null} openPathRequest={{ path: 'folder-a/document.adoc', nonce: 3 }} />,
    );
    expect(onSelectFile).toHaveBeenCalledTimes(1);
  });

  test('right-clicking a node row is handled without error (onContextMenu wiring)', async () => {
    render(<FileTree projectId={PROJECT_ID} canEdit onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => expect(screen.queryByText('document.adoc')).toBeInTheDocument());

    // The tree passes a no-op onContextMenu to each node; firing it must not throw.
    expect(() => fireEvent.contextMenu(screen.getByText('document.adoc'))).not.toThrow();
  });

  test('re-rendering with an unchanged selectedNodeId does not re-run the reveal', async () => {
    const { rerender } = render(
      <FileTree projectId={PROJECT_ID} canEdit onSelectFile={jest.fn()} selectedNodeId={FILE_1} />,
    );
    await waitFor(() => expect(screen.queryByText('document.adoc')).toBeInTheDocument());
    const scrollIntoView = Element.prototype.scrollIntoView as jest.Mock;
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    scrollIntoView.mockClear();

    // Same selection, only canEdit toggled → the reveal short-circuits on the last-revealed ref.
    rerender(<FileTree projectId={PROJECT_ID} canEdit={false} onSelectFile={jest.fn()} selectedNodeId={FILE_1} />);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  test('renders a collapse button and invokes onCollapse when provided', async () => {
    const onCollapse = jest.fn();
    render(<FileTree projectId={PROJECT_ID} canEdit onSelectFile={jest.fn()} selectedNodeId={null} onCollapse={onCollapse} />);
    await waitFor(() => expect(screen.queryByText('document.adoc')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/collapse sidebar/i));
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });

  test('openPathRequest for an unknown path selects nothing', async () => {
    const onSelectFile = jest.fn();
    const { rerender } = render(
      <FileTree projectId={PROJECT_ID} canEdit onSelectFile={onSelectFile} selectedNodeId={null} openPathRequest={null} />,
    );
    await waitFor(() => expect(screen.queryByText('document.adoc')).toBeInTheDocument());

    rerender(
      <FileTree
        projectId={PROJECT_ID} canEdit onSelectFile={onSelectFile} selectedNodeId={null}
        openPathRequest={{ path: 'does/not/exist.adoc', nonce: 1 }}
      />,
    );
    await waitFor(() => expect(screen.getByText('document.adoc')).toBeInTheDocument());
    expect(onSelectFile).not.toHaveBeenCalled();
  });
});
