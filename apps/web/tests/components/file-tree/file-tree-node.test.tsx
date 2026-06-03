import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileTreeNode } from '@/components/file-tree/file-tree-node';

jest.mock('@/components/file-tree/drag-drop-zone', () => ({
  DragDropZone: ({ children, targetFolderId }: { children: React.ReactNode; targetFolderId: string }) => (
    <div data-testid={`drop-zone-${targetFolderId}`}>{children}</div>
  ),
}));

jest.mock('@/components/file-tree/file-tree-actions', () => ({
  FileTreeActions: ({ nodeType, onUpdate }: { nodeType: string; onUpdate?: () => void }) => (
    <button data-testid="file-tree-actions" onClick={onUpdate}>{nodeType} actions</button>
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
        isOwner={false}
        selectedNodeId={null}
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
        isOwner={false}
        selectedNodeId={null}
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

  it('calls onSelect on click with nodeId, nodeName, nodePath, nodeType', () => {
    const onSelect = jest.fn();
    render(
      <FileTreeNode
        node={fileNode}
        depth={0}
        projectId="proj-1"
        isOwner={false}
        selectedNodeId={null}
        onSelect={onSelect}
        onContextMenu={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByText('document.adoc'));
    expect(onSelect).toHaveBeenCalledWith(fileNode.id, fileNode.name, fileNode.path, 'file');
  });

  it('calls onSelect with nodeType=folder when a folder node is clicked', () => {
    const onSelect = jest.fn();
    render(
      <FileTreeNode
        node={folderNode}
        depth={0}
        projectId="proj-1"
        isOwner={false}
        selectedNodeId={null}
        onSelect={onSelect}
        onContextMenu={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByText('src'));
    expect(onSelect).toHaveBeenCalledWith(folderNode.id, folderNode.name, folderNode.path, 'folder');
  });

  it('calls onContextMenu on right-click', () => {
    const onContextMenu = jest.fn();
    render(
      <FileTreeNode
        node={fileNode}
        depth={0}
        projectId="proj-1"
        isOwner={false}
        selectedNodeId={null}
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
        isOwner={false}
        selectedNodeId={null}
        onSelect={jest.fn()}
        onContextMenu={jest.fn()}
      />,
    );
    expect(screen.getByTestId(`drop-zone-${folderNode.id}`)).toBeInTheDocument();
  });

  // T006 (a): selectedNodeId matches node.id → bg-accent highlight class applied
  it('applies bg-accent class when selectedNodeId matches node id', () => {
    render(
      <FileTreeNode
        node={fileNode}
        depth={0}
        projectId="proj-1"
        isOwner={false}
        selectedNodeId={fileNode.id}
        onSelect={jest.fn()}
        onContextMenu={jest.fn()}
      />,
    );
    const nodeElement = screen.getByText('document.adoc').closest('div');
    expect(nodeElement).toHaveClass('bg-accent');
  });

  // T006 (b): isOwner=false → no action button rendered
  it('does not render action button when isOwner=false', () => {
    render(
      <FileTreeNode
        node={fileNode}
        depth={0}
        projectId="proj-1"
        isOwner={false}
        selectedNodeId={null}
        onSelect={jest.fn()}
        onContextMenu={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('file-tree-actions')).not.toBeInTheDocument();
  });

  // T006 (b continued): isOwner=true → action button rendered
  it('renders action button when isOwner=true', () => {
    render(
      <FileTreeNode
        node={fileNode}
        depth={0}
        projectId="proj-1"
        isOwner={true}
        selectedNodeId={null}
        onSelect={jest.fn()}
        onContextMenu={jest.fn()}
      />,
    );
    expect(screen.getByTestId('file-tree-actions')).toBeInTheDocument();
  });

  // BUG: FileTreeNode hardcodes onUpdate={() => {}} so mutations never propagate up
  // Fix: FileTreeNode must accept and forward an onUpdate prop to FileTreeActions
  it('forwards onUpdate prop to FileTreeActions — calling it invokes the prop', () => {
    const onUpdate = jest.fn();
    render(
      <FileTreeNode
        node={fileNode}
        depth={0}
        projectId="proj-1"
        isOwner={true}
        selectedNodeId={null}
        onSelect={jest.fn()}
        onContextMenu={jest.fn()}
        onUpdate={onUpdate}
      />,
    );
    fireEvent.click(screen.getByTestId('file-tree-actions'));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
});
