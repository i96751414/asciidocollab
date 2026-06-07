import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileTreeNode } from '@/components/file-tree/file-tree-node';

jest.mock('@/components/file-tree/drag-drop-zone', () => ({
  DragDropZone: ({ children, targetFolderId }: { children: React.ReactNode; targetFolderId: string }) => (
    <div data-testid={`drop-zone-${targetFolderId}`}>{children}</div>
  ),
}));

jest.mock('@/components/file-tree/file-tree-actions', () => ({
  FileTreeActions: ({ nodeType, onUpdate, onError }: { nodeType: string; onUpdate?: () => void; onError?: (m: string | null) => void }) => (
    <button
      data-testid="file-tree-actions"
      data-has-on-error={String(typeof onError === 'function')}
      onClick={onUpdate}
    >
      {nodeType} actions
    </button>
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
  it('renders with data-node-id attribute matching node id', () => {
    render(
      <FileTreeNode
        node={fileNode}
        depth={0}
        projectId="proj-1"
        canEdit={false}
        selectedNodeId={null}
        onSelect={jest.fn()}
        onContextMenu={jest.fn()}
      />,
    );
    expect(screen.getByTestId('tree-node-document.adoc')).toHaveAttribute('data-node-id', fileNode.id);
  });

  it('renders file node name', () => {
    render(
      <FileTreeNode
        node={fileNode}
        depth={0}
        projectId="proj-1"
        canEdit={false}
        selectedNodeId={null}
        onSelect={jest.fn()}
        onContextMenu={jest.fn()}
      />,
    );
    expect(screen.getByText('document.adoc')).toBeInTheDocument();
  });

  it('renders folder node as collapsible via controlled isExpanded/onToggle props', () => {
    const onToggle = jest.fn();

    const { rerender } = render(
      <FileTreeNode
        node={folderNode}
        depth={0}
        projectId="proj-1"
        canEdit={false}
        selectedNodeId={null}
        onSelect={jest.fn()}
        onContextMenu={jest.fn()}
        isExpanded={false}
        onToggle={onToggle}
      />,
    );

    // Initially collapsed (isExpanded=false)
    expect(screen.queryByText('document.adoc')).not.toBeInTheDocument();

    // Click fires onToggle, not internal state
    fireEvent.click(screen.getByText('src'));
    expect(onToggle).toHaveBeenCalledWith(folderNode.id);

    // Parent re-renders with isExpanded=true
    rerender(
      <FileTreeNode
        node={folderNode}
        depth={0}
        projectId="proj-1"
        canEdit={false}
        selectedNodeId={null}
        onSelect={jest.fn()}
        onContextMenu={jest.fn()}
        isExpanded={true}
        onToggle={onToggle}
      />,
    );
    expect(screen.getByText('document.adoc')).toBeInTheDocument();
  });

  it('calls onSelect on click with nodeId, nodeName, nodePath, nodeType', () => {
    const onSelect = jest.fn();
    render(
      <FileTreeNode
        node={fileNode}
        depth={0}
        projectId="proj-1"
        canEdit={false}
        selectedNodeId={null}
        onSelect={onSelect}
        onContextMenu={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByText('document.adoc'));
    expect(onSelect).toHaveBeenCalledWith(fileNode.id, fileNode.name, fileNode.path, 'file');
  });

  it('does NOT call onSelect when a folder node is clicked — only toggles expand', () => {
    const onSelect = jest.fn();
    const onToggle = jest.fn();
    render(
      <FileTreeNode
        node={folderNode}
        depth={0}
        projectId="proj-1"
        canEdit={false}
        selectedNodeId={null}
        onSelect={onSelect}
        onContextMenu={jest.fn()}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByText('src'));
    expect(onToggle).toHaveBeenCalledWith(folderNode.id);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('calls onContextMenu on right-click', () => {
    const onContextMenu = jest.fn();
    render(
      <FileTreeNode
        node={fileNode}
        depth={0}
        projectId="proj-1"
        canEdit={false}
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
        canEdit={false}
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
        canEdit={false}
        selectedNodeId={fileNode.id}
        onSelect={jest.fn()}
        onContextMenu={jest.fn()}
      />,
    );
    const nodeElement = screen.getByText('document.adoc').closest('div');
    expect(nodeElement).toHaveClass('bg-accent');
  });

  // T006 (b): canEdit=false → no action button rendered
  it('does not render action button when canEdit=false', () => {
    render(
      <FileTreeNode
        node={fileNode}
        depth={0}
        projectId="proj-1"
        canEdit={false}
        selectedNodeId={null}
        onSelect={jest.fn()}
        onContextMenu={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('file-tree-actions')).not.toBeInTheDocument();
  });

  // T006 (b continued): canEdit=true → action button rendered
  it('renders action button when canEdit=true', () => {
    render(
      <FileTreeNode
        node={fileNode}
        depth={0}
        projectId="proj-1"
        canEdit={true}
        selectedNodeId={null}
        onSelect={jest.fn()}
        onContextMenu={jest.fn()}
      />,
    );
    expect(screen.getByTestId('file-tree-actions')).toBeInTheDocument();
  });

  // T009: onError prop is threaded through FileTreeNode to FileTreeActions
  it('T009: passes onError prop through to FileTreeActions', () => {
    const onError = jest.fn();
    render(
      <FileTreeNode
        node={fileNode}
        depth={0}
        projectId="proj-1"
        canEdit={true}
        selectedNodeId={null}
        onSelect={jest.fn()}
        onContextMenu={jest.fn()}
        onError={onError}
      />,
    );
    // FileTreeActions mock renders a button; clicking it calls onUpdate (not onError directly)
    // We need the mock to also surface onError — update the mock to pass onError as data
    const actionsButton = screen.getByTestId('file-tree-actions');
    expect(actionsButton).toHaveAttribute('data-has-on-error', 'true');
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
        canEdit={true}
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
