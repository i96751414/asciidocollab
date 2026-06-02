import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileTreeNode } from '@/components/file-tree/file-tree-node';

jest.mock('@/components/file-tree/drag-drop-zone', () => ({
  DragDropZone: ({ children, targetFolderId }: { children: React.ReactNode; targetFolderId: string }) => (
    <div data-testid={`drop-zone-${targetFolderId}`}>{children}</div>
  ),
}));

const fileNode = {
  id: 'file-1',
  name: 'document.adoc',
  type: 'file' as const,
  path: '/document.adoc',
  parentId: 'folder-root',
  children: [],
};

const folderNode = {
  id: 'folder-1',
  name: 'src',
  type: 'folder' as const,
  path: '/src',
  parentId: 'folder-root',
  children: [fileNode],
};

describe('FileTreeNode', () => {
  it('renders file node name', () => {
    render(
      <FileTreeNode
        node={fileNode}
        depth={0}
        projectId="proj-1"
        onSelect={jest.fn()}
        onContextMenu={jest.fn()}
      />,
    );
    expect(screen.getByText('document.adoc')).toBeInTheDocument();
  });

  it('renders folder node as collapsible (click toggles children)', () => {
    render(
      <FileTreeNode
        node={folderNode}
        depth={0}
        projectId="proj-1"
        onSelect={jest.fn()}
        onContextMenu={jest.fn()}
      />,
    );

    // Initially collapsed
    expect(screen.queryByText('document.adoc')).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(screen.getByText('src'));
    expect(screen.getByText('document.adoc')).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(screen.getByText('src'));
    expect(screen.queryByText('document.adoc')).not.toBeInTheDocument();
  });

  it('calls onSelect on click', () => {
    const onSelect = jest.fn();
    render(
      <FileTreeNode
        node={fileNode}
        depth={0}
        projectId="proj-1"
        onSelect={onSelect}
        onContextMenu={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByText('document.adoc'));
    expect(onSelect).toHaveBeenCalledWith(fileNode.id);
  });

  it('calls onContextMenu on right-click', () => {
    const onContextMenu = jest.fn();
    render(
      <FileTreeNode
        node={fileNode}
        depth={0}
        projectId="proj-1"
        onSelect={jest.fn()}
        onContextMenu={onContextMenu}
      />,
    );
    fireEvent.contextMenu(screen.getByText('document.adoc'));
    expect(onContextMenu).toHaveBeenCalledWith(expect.any(Object), fileNode.id);
  });

  it('folder nodes are wrapped in DragDropZone', () => {
    render(
      <FileTreeNode
        node={folderNode}
        depth={0}
        projectId="proj-1"
        onSelect={jest.fn()}
        onContextMenu={jest.fn()}
      />,
    );
    expect(screen.getByTestId(`drop-zone-${folderNode.id}`)).toBeInTheDocument();
  });
});
