import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { FileTree } from '@/components/file-tree/file-tree';
import type { FileTreeEventDto } from '@asciidocollab/shared';

// Mock dependencies
jest.mock('@/hooks/use-file-tree-events', () => ({
  useFileTreeEvents: jest.fn((_projectId: string, onEvent: (event: FileTreeEventDto) => void, onReconnect: () => void) => {
    // expose for test use
    (globalThis as unknown as Record<string, unknown>).__lastOnEvent = onEvent;
    (globalThis as unknown as Record<string, unknown>).__lastOnReconnect = onReconnect;
  }),
}));

jest.mock('@/hooks/use-key-bindings', () => ({
  useKeyBindings: jest.fn(() => new Map()),
}));

jest.mock('@/hooks/use-file-tree-key-handler', () => ({
  useFileTreeKeyHandler: jest.fn(),
}));

jest.mock('@/components/file-tree/file-tree-node', () => ({
  FileTreeNode: ({
    node,
    isOwner,
    onSelect,
  }: {
    node: { name: string; id: string; path: string; type: string };
    isOwner?: boolean;
    onSelect?: (nodeId: string, nodeName: string, nodePath: string, nodeType: 'file' | 'folder') => void;
  }) => (
    <div
      data-testid={`node-${node.name}`}
      data-is-owner={String(isOwner)}
      onClick={() => node.type === 'file' && onSelect?.(node.id, node.name, node.path, node.type as 'file' | 'folder')}
    >
      {node.name}
      {isOwner && <button data-testid={`actions-${node.name}`}>Actions</button>}
    </div>
  ),
}));

const projectId = 'proj-1';

const rootNode = {
  id: 'root-1',
  name: 'root',
  type: 'folder' as const,
  path: '/',
  parentId: null,
  children: [
    { id: 'file-1', name: 'doc.adoc', type: 'file' as const, path: '/doc.adoc', parentId: 'root-1', children: [] },
  ],
};

function mockFetch(tree: typeof rootNode) {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(tree),
  } as Response);
}

describe('FileTree', () => {
  beforeEach(() => {
    mockFetch(rootNode);
    (globalThis as unknown as Record<string, unknown>).__lastOnEvent = undefined;
    (globalThis as unknown as Record<string, unknown>).__lastOnReconnect = undefined;
  });

  it('initial tree is fetched and rendered on mount', async () => {
    render(<FileTree projectId={projectId} isOwner={false} onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => expect(screen.getByTestId('node-doc.adoc')).toBeInTheDocument());
  });

  // T005 (a): isOwner=false hides action buttons
  it('isOwner=false — no FileTreeActions buttons rendered', async () => {
    render(<FileTree projectId={projectId} isOwner={false} onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => expect(screen.getByTestId('node-doc.adoc')).toBeInTheDocument());
    expect(screen.queryByTestId('actions-doc.adoc')).not.toBeInTheDocument();
  });

  // T005 (b): onSelectFile called with (nodeId, nodeName, nodePath) on file click
  it('calls onSelectFile with nodeId, nodeName, nodePath when file node is clicked', async () => {
    const onSelectFile = jest.fn();
    render(<FileTree projectId={projectId} isOwner={false} onSelectFile={onSelectFile} selectedNodeId={null} />);
    await waitFor(() => expect(screen.getByTestId('node-doc.adoc')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('node-doc.adoc'));
    expect(onSelectFile).toHaveBeenCalledWith('file-1', 'doc.adoc', '/doc.adoc', 'file');
  });

  // T005 (c): empty children renders "No files yet" text
  it('renders empty state when tree has no children', async () => {
    const emptyRoot = { ...rootNode, children: [] };
    mockFetch(emptyRoot);
    render(<FileTree projectId={projectId} isOwner={false} onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => expect(screen.getByText(/No files yet/i)).toBeInTheDocument());
  });

  it('created event adds a node to the rendered tree', async () => {
    render(<FileTree projectId={projectId} isOwner={false} onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => screen.getByTestId('node-doc.adoc'));

    const event: FileTreeEventDto = {
      type: 'created',
      fileNodeId: 'file-2',
      nodeType: 'file',
      name: 'new.adoc',
      path: '/new.adoc',
      parentId: 'root-1',
    };

    act(() => {
      (globalThis as unknown as Record<string, () => void>).__lastOnEvent(event);
    });

    await waitFor(() => expect(screen.getByTestId('node-new.adoc')).toBeInTheDocument());
  });

  it('deleted event removes a node', async () => {
    render(<FileTree projectId={projectId} isOwner={false} onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => screen.getByTestId('node-doc.adoc'));

    const event: FileTreeEventDto = {
      type: 'deleted',
      fileNodeId: 'file-1',
      nodeType: 'file',
      name: 'doc.adoc',
      path: '/doc.adoc',
      parentId: 'root-1',
    };

    act(() => {
      (globalThis as unknown as Record<string, () => void>).__lastOnEvent(event);
    });

    await waitFor(() => expect(screen.queryByTestId('node-doc.adoc')).not.toBeInTheDocument());
  });

  it('renamed event updates the node name', async () => {
    render(<FileTree projectId={projectId} isOwner={false} onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => screen.getByTestId('node-doc.adoc'));

    const event: FileTreeEventDto = {
      type: 'renamed',
      fileNodeId: 'file-1',
      nodeType: 'file',
      name: 'renamed.adoc',
      path: '/renamed.adoc',
      parentId: 'root-1',
    };

    act(() => {
      (globalThis as unknown as Record<string, () => void>).__lastOnEvent(event);
    });

    await waitFor(() => expect(screen.getByTestId('node-renamed.adoc')).toBeInTheDocument());
  });

  // C5: network error during initial fetch must not leave the tree stuck on "Loading..."
  it('shows an error state when the initial fetch fails with a network error', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('Network down'));
    render(<FileTree projectId={projectId} isOwner={false} onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('reconnect triggers a full re-fetch', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rootNode),
    } as Response);
    globalThis.fetch = fetchMock;

    render(<FileTree projectId={projectId} isOwner={false} onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => screen.getByTestId('node-doc.adoc'));

    act(() => {
      (globalThis as unknown as Record<string, () => void>).__lastOnReconnect();
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
