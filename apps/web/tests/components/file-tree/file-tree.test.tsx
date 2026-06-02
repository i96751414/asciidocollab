import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
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
  FileTreeNode: ({ node }: { node: { name: string } }) => <div data-testid={`node-${node.name}`}>{node.name}</div>,
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
    render(<FileTree projectId={projectId} />);
    await waitFor(() => expect(screen.getByTestId('node-doc.adoc')).toBeInTheDocument());
  });

  it('created event adds a node to the rendered tree', async () => {
    render(<FileTree projectId={projectId} />);
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
    render(<FileTree projectId={projectId} />);
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
    render(<FileTree projectId={projectId} />);
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

  it('reconnect triggers a full re-fetch', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rootNode),
    } as Response);
    globalThis.fetch = fetchMock;

    render(<FileTree projectId={projectId} />);
    await waitFor(() => screen.getByTestId('node-doc.adoc'));

    act(() => {
      (globalThis as unknown as Record<string, () => void>).__lastOnReconnect();
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
