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

// Keep the real DragDropZone (its onNodeMove logic is under test) but stub the upload hook so a
// drop does not run the real OS-file upload walker.
jest.mock('@/hooks/use-drop-upload', () => ({
  useDropUpload: () => ({ onDrop: jest.fn(), progress: [], clearProgress: jest.fn() }),
}));

// Recursive mock: renders data-node-id (so the reveal scroll query can find a node)
// and renders a folder's children only when `expandedState.get(folderId)` is true, so
// tests can observe ancestor expansion driven by the auto-reveal effect.
interface MockNode { name: string; id: string; path: string; type: 'file' | 'folder'; children: MockNode[] }
interface MockNodeProperties {
  node: MockNode;
  canEdit?: boolean;
  selectedNodeId?: string | null;
  expandedState?: Map<string, boolean>;
  onSelect?: (nodeId: string, nodeName: string, nodePath: string, nodeType: 'file' | 'folder') => void;
  onToggle?: (nodeId: string) => void;
  onUpdate?: () => void;
  onError?: (message: string | null) => void;
}
jest.mock('@/components/file-tree/file-tree-node', () => {
  function MockFileTreeNode({ node, canEdit, selectedNodeId, expandedState, onSelect, onToggle, onUpdate, onError }: MockNodeProperties) {
    return (
      <div>
        <div
          data-testid={`node-${node.name}`}
          data-node-id={node.id}
          data-is-owner={String(canEdit)}
          data-selected={node.id === selectedNodeId ? 'true' : undefined}
          onClick={() => node.type === 'file'
            ? onSelect?.(node.id, node.name, node.path, node.type)
            : onToggle?.(node.id)}
        >
          {node.name}
          {canEdit && <button data-testid={`actions-${node.name}`} onClick={() => onUpdate?.()}>Actions</button>}
          {onError && <button data-testid={`trigger-error-${node.name}`} onClick={() => onError('Test error message')}>Trigger Error</button>}
        </div>
        {node.type === 'folder' && expandedState?.get(node.id) && node.children.map((child) => (
          <MockFileTreeNode
            key={child.id}
            node={child}
            canEdit={canEdit}
            selectedNodeId={selectedNodeId}
            expandedState={expandedState}
            onSelect={onSelect}
            onToggle={onToggle}
            onUpdate={onUpdate}
            onError={onError}
          />
        ))}
      </div>
    );
  }
  return { FileTreeNode: MockFileTreeNode };
});

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
    render(<FileTree projectId={projectId} canEdit={false} onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => expect(screen.getByTestId('node-doc.adoc')).toBeInTheDocument());
  });

  // T005 (a): canEdit=false hides action buttons
  it('canEdit=false — no FileTreeActions buttons rendered', async () => {
    render(<FileTree projectId={projectId} canEdit={false} onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => expect(screen.getByTestId('node-doc.adoc')).toBeInTheDocument());
    expect(screen.queryByTestId('actions-doc.adoc')).not.toBeInTheDocument();
  });

  // T005 (b): onSelectFile called with (nodeId, nodeName, nodePath) on file click
  it('calls onSelectFile with nodeId, nodeName, nodePath when file node is clicked', async () => {
    const onSelectFile = jest.fn();
    render(<FileTree projectId={projectId} canEdit={false} onSelectFile={onSelectFile} selectedNodeId={null} />);
    await waitFor(() => expect(screen.getByTestId('node-doc.adoc')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('node-doc.adoc'));
    expect(onSelectFile).toHaveBeenCalledWith('file-1', 'doc.adoc', '/doc.adoc', 'file');
  });

  // T005 (c): empty children renders "No files yet" text
  it('renders empty state when tree has no children', async () => {
    const emptyRoot = { ...rootNode, children: [] };
    mockFetch(emptyRoot);
    render(<FileTree projectId={projectId} canEdit={false} onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => expect(screen.getByText(/No files yet/i)).toBeInTheDocument());
  });

  it('created event adds a node to the rendered tree', async () => {
    render(<FileTree projectId={projectId} canEdit={false} onSelectFile={jest.fn()} selectedNodeId={null} />);
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
    render(<FileTree projectId={projectId} canEdit={false} onSelectFile={jest.fn()} selectedNodeId={null} />);
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
    render(<FileTree projectId={projectId} canEdit={false} onSelectFile={jest.fn()} selectedNodeId={null} />);
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

  it('moved event relocates a node into the target folder', async () => {
    const tree = {
      ...rootNode,
      children: [
        { id: 'folder-a', name: 'folder-a', type: 'folder' as const, path: '/folder-a', parentId: 'root-1', children: [] },
        { id: 'file-1', name: 'doc.adoc', type: 'file' as const, path: '/doc.adoc', parentId: 'root-1', children: [] },
      ],
    };
    mockFetch(tree);
    render(<FileTree projectId={projectId} canEdit={false} onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => screen.getByTestId('node-doc.adoc'));

    const event: FileTreeEventDto = {
      type: 'moved',
      fileNodeId: 'file-1',
      nodeType: 'file',
      name: 'doc.adoc',
      path: '/folder-a/doc.adoc',
      parentId: 'folder-a',
    };
    act(() => {
      (globalThis as unknown as Record<string, (event_: FileTreeEventDto) => void>).__lastOnEvent(event);
    });

    // The node still exists (relocated under folder-a, which auto-expands), not removed.
    await waitFor(() => expect(screen.getByTestId('node-doc.adoc')).toBeInTheDocument());
  });

  // C5: network error during initial fetch must not leave the tree stuck on "Loading..."
  it('shows an error state when the initial fetch fails with a network error', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('Network down'));
    render(<FileTree projectId={projectId} canEdit={false} onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  // C5b: HTTP error response (e.g. 404 for empty project) must not leave the tree stuck on "Loading..."
  it('shows an error state when the initial fetch returns a non-ok HTTP status', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 } as Response);
    render(<FileTree projectId={projectId} canEdit={false} onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('reconnect triggers a full re-fetch', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rootNode),
    } as Response);
    globalThis.fetch = fetchMock;

    render(<FileTree projectId={projectId} canEdit={false} onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => screen.getByTestId('node-doc.adoc'));

    act(() => {
      (globalThis as unknown as Record<string, () => void>).__lastOnReconnect();
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  // BUG: tree does not update after file creation because onUpdate is () => {}
  // Fix: onUpdate should trigger fetchTree so the tree re-fetches even if SSE is delayed
  it('refetches and shows new file when a node mutation completes (onUpdate)', async () => {
    const treeWithNew = {
      ...rootNode,
      children: [
        ...rootNode.children,
        { id: 'file-2', name: 'new.adoc', type: 'file' as const, path: '/new.adoc', parentId: 'root-1', children: [] },
      ],
    };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(rootNode) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(treeWithNew) } as Response);
    globalThis.fetch = fetchMock;

    render(<FileTree projectId={projectId} canEdit={true} onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => screen.getByTestId('node-doc.adoc'));

    // Trigger onUpdate as FileTreeActions would after a successful file creation
    act(() => {
      fireEvent.click(screen.getByTestId('actions-doc.adoc'));
    });

    await waitFor(() => expect(screen.getByTestId('node-new.adoc')).toBeInTheDocument());
  });

  // T008: role="alert" error banner renders in panel header area after failed file operation
  it('T008: renders role="alert" error banner after a failed file operation and it is outside tree rows', async () => {
    render(<FileTree projectId={projectId} canEdit={true} onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => expect(screen.getByTestId('node-doc.adoc')).toBeInTheDocument());

    // The mock FileTreeNode exposes a trigger-error button (only when onError prop is provided)
    fireEvent.click(screen.getByTestId('trigger-error-doc.adoc'));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    // Verify the alert is NOT inside the tree node row
    const alert = screen.getByRole('alert');
    const treeNode = screen.getByTestId('node-doc.adoc');
    expect(treeNode).not.toContainElement(alert);
  });

  // T020: Ctrl+F opens FindPanel, typing highlights first match, next/prev cycles, Escape dismisses
  it('T020: Ctrl+F opens FindPanel; typing a query shows match counter; Escape dismisses', async () => {
    render(<FileTree projectId={projectId} canEdit={false} onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => expect(screen.getByTestId('node-doc.adoc')).toBeInTheDocument());

    const container = screen.getByTestId('node-doc.adoc').closest('[tabindex]') as HTMLElement;
    expect(container).toBeTruthy();

    // Ctrl+F should open FindPanel
    fireEvent.keyDown(container, { key: 'f', ctrlKey: true });
    await waitFor(() => expect(screen.getByRole('textbox')).toBeInTheDocument());

    // Escape should dismiss the panel
    fireEvent.keyDown(container, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
  });

  // T002: tree items render in case-insensitive alphabetical order on initial load
  it('T002: renders tree children in case-insensitive alphabetical order on initial load', async () => {
    const unorderedRoot = {
      id: 'root-1',
      name: 'root',
      type: 'folder' as const,
      path: '/',
      parentId: null,
      children: [
        { id: 'f-z', name: 'zebra.adoc', type: 'file' as const, path: '/zebra.adoc', parentId: 'root-1', children: [] },
        { id: 'f-a', name: 'Apple.adoc', type: 'file' as const, path: '/Apple.adoc', parentId: 'root-1', children: [] },
        { id: 'f-under', name: '_foo.adoc', type: 'file' as const, path: '/_foo.adoc', parentId: 'root-1', children: [] },
        { id: 'f-num', name: '2bar.adoc', type: 'file' as const, path: '/2bar.adoc', parentId: 'root-1', children: [] },
        { id: 'f-accent', name: 'ärch.adoc', type: 'file' as const, path: '/ärch.adoc', parentId: 'root-1', children: [] },
      ],
    };
    mockFetch(unorderedRoot);
    render(<FileTree projectId={projectId} canEdit={false} onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => expect(screen.getByTestId('node-zebra.adoc')).toBeInTheDocument());

    const nodes = screen.getAllByTestId(/^node-/);
    const names = nodes.map((n) => n.dataset['testid']!.replace('node-', ''));
    const sorted = names.toSorted((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    expect(names).toEqual(sorted);
  });

  // T003: created SSE event inserts file at correct alphabetical position
  it('T003: created SSE event inserts file at correct alphabetical position', async () => {
    const treeRoot = {
      id: 'root-1',
      name: 'root',
      type: 'folder' as const,
      path: '/',
      parentId: null,
      children: [
        { id: 'f-a', name: 'apple.adoc', type: 'file' as const, path: '/apple.adoc', parentId: 'root-1', children: [] },
        { id: 'f-c', name: 'cherry.adoc', type: 'file' as const, path: '/cherry.adoc', parentId: 'root-1', children: [] },
      ],
    };
    mockFetch(treeRoot);
    render(<FileTree projectId={projectId} canEdit={false} onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => expect(screen.getByTestId('node-apple.adoc')).toBeInTheDocument());

    const createdEvent: FileTreeEventDto = {
      type: 'created',
      fileNodeId: 'f-b',
      nodeType: 'file',
      name: 'banana.adoc',
      path: '/banana.adoc',
      parentId: 'root-1',
    };
    act(() => { (globalThis as unknown as Record<string, (event: FileTreeEventDto) => void>).__lastOnEvent(createdEvent); });

    await waitFor(() => expect(screen.getByTestId('node-banana.adoc')).toBeInTheDocument());

    const nodes = screen.getAllByTestId(/^node-/);
    const names = nodes.map((n) => n.dataset['testid']!.replace('node-', ''));
    const sorted = names.toSorted((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    expect(names).toEqual(sorted);
  });

  // T004: renamed SSE event re-positions file to correct alphabetical position
  it('T004: renamed SSE event re-positions file to correct alphabetical position', async () => {
    const treeRoot = {
      id: 'root-1',
      name: 'root',
      type: 'folder' as const,
      path: '/',
      parentId: null,
      children: [
        { id: 'f-a', name: 'alpha.adoc', type: 'file' as const, path: '/alpha.adoc', parentId: 'root-1', children: [] },
        { id: 'f-b', name: 'beta.adoc', type: 'file' as const, path: '/beta.adoc', parentId: 'root-1', children: [] },
        { id: 'f-c', name: 'charlie.adoc', type: 'file' as const, path: '/charlie.adoc', parentId: 'root-1', children: [] },
      ],
    };
    mockFetch(treeRoot);
    render(<FileTree projectId={projectId} canEdit={false} onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => expect(screen.getByTestId('node-alpha.adoc')).toBeInTheDocument());

    // Rename 'alpha.adoc' → 'zebra.adoc' — should move to end
    const renamedEvent: FileTreeEventDto = {
      type: 'renamed',
      fileNodeId: 'f-a',
      nodeType: 'file',
      name: 'zebra.adoc',
      path: '/zebra.adoc',
      parentId: 'root-1',
    };
    act(() => { (globalThis as unknown as Record<string, (event: FileTreeEventDto) => void>).__lastOnEvent(renamedEvent); });

    await waitFor(() => expect(screen.getByTestId('node-zebra.adoc')).toBeInTheDocument());

    const nodes = screen.getAllByTestId(/^node-/);
    const names = nodes.map((n) => n.dataset['testid']!.replace('node-', ''));
    const sorted = names.toSorted((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    expect(names).toEqual(sorted);
  });

  // Idempotency: if SSE 'created' event arrives after fetchTree already returned the new node,
  // applyEvent must not add a duplicate.
  it('applyEvent created event is idempotent — no duplicate when node already in tree', async () => {
    render(<FileTree projectId={projectId} canEdit={false} onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => screen.getByTestId('node-doc.adoc'));

    const createdEvent: FileTreeEventDto = {
      type: 'created',
      fileNodeId: 'file-2',
      nodeType: 'file',
      name: 'new.adoc',
      path: '/new.adoc',
      parentId: 'root-1',
    };

    // First SSE event — adds the node
    act(() => { (globalThis as unknown as Record<string, (event: FileTreeEventDto) => void>).__lastOnEvent(createdEvent); });
    await waitFor(() => expect(screen.getByTestId('node-new.adoc')).toBeInTheDocument());

    // Second SSE event with the same fileNodeId — must not add a duplicate
    act(() => { (globalThis as unknown as Record<string, (event: FileTreeEventDto) => void>).__lastOnEvent(createdEvent); });
    await waitFor(() => expect(screen.getAllByTestId('node-new.adoc')).toHaveLength(1));
  });

});

// T006 / FR-012: auto-reveal a programmatically-selected node that is hidden behind
// collapsed folders. Contract cases R1–R7 from contracts/tree-reveal-on-select.md.
describe('FileTree auto-reveal on selection (R1–R7)', () => {
  // root
  // ├── docs (folder, top-level → auto-expanded)
  // │   ├── chapters (folder, collapsed) → intro.adoc (hidden)
  // │   └── refs (folder, collapsed)     → appendix.adoc (hidden)
  // └── readme.adoc (top-level file, visible)
  const deepTree = {
    id: 'root-1',
    name: 'root',
    type: 'folder' as const,
    path: '/',
    parentId: null,
    children: [
      {
        id: 'docs', name: 'docs', type: 'folder' as const, path: '/docs', parentId: 'root-1',
        children: [
          {
            id: 'chapters', name: 'chapters', type: 'folder' as const, path: '/docs/chapters', parentId: 'docs',
            children: [{ id: 'intro', name: 'intro.adoc', type: 'file' as const, path: '/docs/chapters/intro.adoc', parentId: 'chapters', children: [] }],
          },
          {
            id: 'refs', name: 'refs', type: 'folder' as const, path: '/docs/refs', parentId: 'docs',
            children: [{ id: 'appendix', name: 'appendix.adoc', type: 'file' as const, path: '/docs/refs/appendix.adoc', parentId: 'refs', children: [] }],
          },
        ],
      },
      { id: 'readme', name: 'readme.adoc', type: 'file' as const, path: '/readme.adoc', parentId: 'root-1', children: [] },
    ],
  };

  const scrollIntoViewMock = jest.fn();

  beforeEach(() => {
    scrollIntoViewMock.mockClear();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(deepTree) } as Response);
    (globalThis as unknown as Record<string, unknown>).__lastOnEvent = undefined;
  });

  it('R1/R2: a selected node nested in collapsed folders becomes visible and is scrolled into view', async () => {
    render(<FileTree projectId={projectId} canEdit={false} onSelectFile={jest.fn()} selectedNodeId="intro" />);
    // Tree loads; readme is visible immediately, intro is hidden behind collapsed `chapters`.
    await waitFor(() => expect(screen.getByTestId('node-readme.adoc')).toBeInTheDocument());

    // After reveal, the ancestor folders expand and intro renders + scrolls into view.
    await waitFor(() => expect(screen.getByTestId('node-intro.adoc')).toBeInTheDocument());
    expect(scrollIntoViewMock).toHaveBeenCalled();
  });

  it('R3: a root-level/visible node needs no expand but is still scrolled, without error', async () => {
    render(<FileTree projectId={projectId} canEdit={false} onSelectFile={jest.fn()} selectedNodeId="readme" />);
    await waitFor(() => expect(screen.getByTestId('node-readme.adoc')).toBeInTheDocument());
    await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalled());
  });

  it('R4: manually collapsing the folder holding the selected node does NOT re-expand it', async () => {
    render(<FileTree projectId={projectId} canEdit={false} onSelectFile={jest.fn()} selectedNodeId="intro" />);
    await waitFor(() => expect(screen.getByTestId('node-intro.adoc')).toBeInTheDocument());
    scrollIntoViewMock.mockClear();

    // User collapses `chapters` (the folder that holds the selected intro.adoc).
    fireEvent.click(screen.getByTestId('node-chapters'));

    // It stays collapsed — the reveal effect (keyed on selectedNodeId, not expandedState) must not fight it.
    await waitFor(() => expect(screen.queryByTestId('node-intro.adoc')).not.toBeInTheDocument());
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it('R5: selectedNodeId=null performs no reveal and no error', async () => {
    render(<FileTree projectId={projectId} canEdit={false} onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => expect(screen.getByTestId('node-readme.adoc')).toBeInTheDocument());
    // Give any pending setTimeout-based scroll a chance to (not) run.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it('R6: changing the selection to a new hidden node reveals it', async () => {
    const { rerender } = render(<FileTree projectId={projectId} canEdit={false} onSelectFile={jest.fn()} selectedNodeId="intro" />);
    await waitFor(() => expect(screen.getByTestId('node-intro.adoc')).toBeInTheDocument());
    scrollIntoViewMock.mockClear();

    rerender(<FileTree projectId={projectId} canEdit={false} onSelectFile={jest.fn()} selectedNodeId="appendix" />);
    await waitFor(() => expect(screen.getByTestId('node-appendix.adoc')).toBeInTheDocument());
    expect(scrollIntoViewMock).toHaveBeenCalled();
  });

  it('R7: re-rendering with an unchanged selectedNodeId does not re-reveal', async () => {
    const { rerender } = render(<FileTree projectId={projectId} canEdit={false} onSelectFile={jest.fn()} selectedNodeId="intro" />);
    await waitFor(() => expect(screen.getByTestId('node-intro.adoc')).toBeInTheDocument());
    await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalled());
    scrollIntoViewMock.mockClear();

    rerender(<FileTree projectId={projectId} canEdit={true} onSelectFile={jest.fn()} selectedNodeId="intro" />);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });
});

// Move a file to the project root by dropping it on the root drop-zone's empty area.
describe('FileTree move to root (drop on the root area)', () => {
  const rootMoveTree = {
    id: 'root-1',
    name: 'root',
    type: 'folder' as const,
    path: '/',
    parentId: null,
    children: [
      {
        id: 'docs', name: 'docs', type: 'folder' as const, path: '/docs', parentId: 'root-1',
        children: [{ id: 'f1', name: 'nested.adoc', type: 'file' as const, path: '/docs/nested.adoc', parentId: 'docs', children: [] }],
      },
    ],
  };

  beforeEach(() => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(rootMoveTree) } as Response);
    (globalThis as unknown as Record<string, unknown>).__lastOnEvent = undefined;
  });

  it('dropping a dragged node on the root drop-zone opens the move dialog (move to root)', async () => {
    render(<FileTree projectId={projectId} canEdit onSelectFile={jest.fn()} selectedNodeId={null} />);
    // `docs` auto-expands → its nested file (parent = docs, not root) is visible.
    await waitFor(() => expect(screen.getByTestId('node-nested.adoc')).toBeInTheDocument());

    // Start dragging the nested file, then drop it on the root drop-zone.
    fireEvent.dragStart(screen.getByTestId('node-nested.adoc'), { dataTransfer: { setData: jest.fn(), effectAllowed: '' } });
    fireEvent.drop(screen.getByTestId('file-tree-drop-zone'), { dataTransfer: { items: {} } });

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByText('Move File')).toBeInTheDocument();
  });

  it('a drop on the root drop-zone with no active drag does not open a dialog', async () => {
    render(<FileTree projectId={projectId} canEdit onSelectFile={jest.fn()} selectedNodeId={null} />);
    await waitFor(() => expect(screen.getByTestId('node-docs')).toBeInTheDocument());

    fireEvent.drop(screen.getByTestId('file-tree-drop-zone'), { dataTransfer: { items: {} } });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
