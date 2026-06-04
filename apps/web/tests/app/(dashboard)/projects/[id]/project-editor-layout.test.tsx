import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ProjectEditorLayout } from '@/app/(dashboard)/dashboard/projects/[id]/project-editor-layout';
import type { FileTreeEventDto } from '@asciidocollab/shared';

// Mock file-tree-node so rendered nodes are simple divs
jest.mock('@/components/file-tree/file-tree-node', () => ({
  FileTreeNode: ({ node }: { node: { name: string; id: string } }) => (
    <div data-testid={`node-${node.name}`}>{node.name}</div>
  ),
}));

jest.mock('@/components/file-tree/drag-drop-zone', () => ({
  DragDropZone: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/hooks/use-key-bindings', () => ({
  useKeyBindings: jest.fn(() => new Map()),
}));

jest.mock('@/hooks/use-file-tree-key-handler', () => ({
  useFileTreeKeyHandler: jest.fn(),
}));

const mockUseFileTreeEvents = jest.fn();
jest.mock('@/hooks/use-file-tree-events', () => ({
  useFileTreeEvents: (...arguments_: unknown[]) => mockUseFileTreeEvents(...arguments_),
}));

jest.mock('@/hooks/use-file-selection', () => ({
  useFileSelection: jest.fn(() => ({
    selectedFile: null,
    contentState: { content: null, isLoading: false, error: null, isBinary: false },
    selectFile: jest.fn(),
    clearSelection: jest.fn(),
  })),
}));

const emptyRoot = {
  id: 'root-1',
  name: 'root',
  type: 'folder' as const,
  path: '/',
  parentId: null,
  children: [],
};

function mockFetch(tree = emptyRoot) {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(tree),
  } as Response);
}

const defaultProps = {
  projectId: 'p1',
  projectName: 'My Project',
  projectDescription: null,
  isOwner: true,
};

describe('ProjectEditorLayout', () => {
  beforeEach(() => {
    mockFetch();
    mockUseFileTreeEvents.mockReset();
  });

  // T002: shell renders with required data-testids
  it('renders without crashing and has required data-testids', async () => {
    render(<ProjectEditorLayout {...defaultProps} />);
    await waitFor(() => expect(screen.getByTestId('file-tree-panel')).toBeInTheDocument());
    expect(screen.getByTestId('content-panel')).toBeInTheDocument();
    // preview-panel is only rendered when an AsciiDoc file is selected
    expect(screen.queryByTestId('preview-panel')).not.toBeInTheDocument();
  });

  it('preview panel appears when an AsciiDoc file is selected', async () => {
    const { useFileSelection } = jest.requireMock('@/hooks/use-file-selection');
    useFileSelection.mockReturnValue({
      selectedFile: { nodeId: 'f1', nodeName: 'doc.adoc', nodePath: '/doc.adoc', nodeType: 'file' },
      contentState: { content: '= Hello', isLoading: false, error: null, isBinary: false },
      selectFile: jest.fn(),
      clearSelection: jest.fn(),
    });

    render(<ProjectEditorLayout {...defaultProps} />);
    await waitFor(() => expect(screen.getByTestId('preview-panel')).toBeInTheDocument());
  });

  // T010: sidebar panel toggle
  it('sidebar is visible initially and can be collapsed', async () => {
    render(<ProjectEditorLayout {...defaultProps} />);
    await waitFor(() => expect(screen.getByTestId('file-tree-panel')).toBeInTheDocument());

    const panel = screen.getByTestId('file-tree-panel');
    expect(panel).not.toHaveClass('hidden');

    const toggleButton = screen.getByRole('button', { name: /collapse sidebar/i });
    fireEvent.click(toggleButton);

    expect(screen.getByTestId('file-tree-panel')).toHaveClass('hidden');
  });

  // T012 (a): isOwner=true shows Settings and Members links
  it('shows Settings and Members links for owner', async () => {
    render(<ProjectEditorLayout {...defaultProps} isOwner={true} />);
    await waitFor(() => expect(screen.getByTestId('file-tree-panel')).toBeInTheDocument());
    const settingsLink = screen.getByRole('link', { name: /settings/i });
    const membersLink = screen.getByRole('link', { name: /members/i });
    expect(settingsLink).toHaveAttribute('href', '/dashboard/projects/p1/settings');
    expect(membersLink).toHaveAttribute('href', '/dashboard/projects/p1/members');
  });

  // T012 (b): isOwner=false hides Settings and Members links
  it('does not show Settings or Members links for non-owner', async () => {
    render(<ProjectEditorLayout {...defaultProps} isOwner={false} />);
    await waitFor(() => expect(screen.getByTestId('file-tree-panel')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: /settings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /members/i })).not.toBeInTheDocument();
  });

  // T012 (c): Back to projects link always present
  it('shows Back to projects link for all roles', async () => {
    render(<ProjectEditorLayout {...defaultProps} />);
    await waitFor(() => expect(screen.getByTestId('file-tree-panel')).toBeInTheDocument());
    const backLink = screen.getByRole('link', { name: /back to projects/i });
    expect(backLink).toHaveAttribute('href', '/dashboard');
  });

  // T022: collapse/expand buttons use Lucide icons, not raw unicode ‹/›
  it('T022: sidebar collapse/expand buttons render SVG icons, not raw unicode ‹ or › characters', async () => {
    render(<ProjectEditorLayout {...defaultProps} />);
    await waitFor(() => expect(screen.getByTestId('file-tree-panel')).toBeInTheDocument());

    const collapseButton = screen.getByRole('button', { name: /collapse sidebar/i });
    // Should not contain raw unicode characters
    expect(collapseButton.textContent?.trim()).not.toBe('‹');
    expect(collapseButton.textContent?.trim()).not.toBe('›');
    // Should contain an SVG (Lucide icon)
    expect(collapseButton.querySelector('svg')).toBeInTheDocument();

    // Click to collapse, then check expand button also uses SVG
    fireEvent.click(collapseButton);
    const expandButton = screen.getByRole('button', { name: /expand sidebar/i });
    expect(expandButton.textContent?.trim()).not.toBe('›');
    expect(expandButton.querySelector('svg')).toBeInTheDocument();
  });

  // T022b: all header navigation links have text-sm and text-muted-foreground
  it('T022b: all header navigation links use text-sm and text-muted-foreground class tokens', async () => {
    render(<ProjectEditorLayout {...defaultProps} isOwner={true} />);
    await waitFor(() => expect(screen.getByTestId('file-tree-panel')).toBeInTheDocument());

    const backLink = screen.getByRole('link', { name: /back to projects/i });
    const settingsLink = screen.getByRole('link', { name: /settings/i });
    const membersLink = screen.getByRole('link', { name: /members/i });

    for (const link of [backLink, settingsLink, membersLink]) {
      expect(link).toHaveClass('text-sm');
      expect(link).toHaveClass('text-muted-foreground');
    }
  });

  // T022c: content panel has p-4 class; preview empty-state has text-sm and text-muted-foreground
  it('T022c: content panel has p-4 class', async () => {
    render(<ProjectEditorLayout {...defaultProps} />);
    await waitFor(() => expect(screen.getByTestId('content-panel')).toBeInTheDocument());

    const contentPanel = screen.getByTestId('content-panel');
    expect(contentPanel).toHaveClass('p-4');
  });

  // T025: SSE wiring — useFileTreeEvents called with correct projectId and events propagate
  it('calls useFileTreeEvents with correct projectId and tree updates on SSE event', async () => {
    const treeWithFile = {
      ...emptyRoot,
      children: [
        { id: 'file-1', name: 'doc.adoc', type: 'file' as const, path: '/doc.adoc', parentId: 'root-1', children: [] },
      ],
    };
    mockFetch(treeWithFile);

    render(<ProjectEditorLayout {...defaultProps} projectId="p1" />);
    await waitFor(() => expect(screen.getByTestId('node-doc.adoc')).toBeInTheDocument());

    expect(mockUseFileTreeEvents).toHaveBeenCalledWith('p1', expect.any(Function), expect.any(Function));

    const onEvent: (event: FileTreeEventDto) => void = mockUseFileTreeEvents.mock.calls[0][1];
    const createdEvent: FileTreeEventDto = {
      type: 'created',
      fileNodeId: 'file-2',
      nodeType: 'file',
      name: 'new-file.adoc',
      path: '/new-file.adoc',
      parentId: 'root-1',
    };

    act(() => { onEvent(createdEvent); });

    await waitFor(() => expect(screen.getByTestId('node-new-file.adoc')).toBeInTheDocument());
  });
});
