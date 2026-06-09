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
});
