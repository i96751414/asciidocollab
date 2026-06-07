import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ProjectEditorLayout } from '@/app/(dashboard)/dashboard/projects/[id]/project-editor-layout';
import type { FileTreeEventDto } from '@asciidocollab/shared';

// Mock the AsciiDocEditor so tests don't depend on CodeMirror/Lezer.
// jest.fn() wrapper lets tests inspect the props passed to the editor (e.g., onChange).
jest.mock('@/components/editor/asciidoc-editor', () => ({
  AsciiDocEditor: jest.fn(({ content, canEdit, projectId, fileNodeId }: { content: string; canEdit: boolean; projectId?: string; fileNodeId?: string; onChange?: (v: string) => void }) => (
    <div
      data-testid="asciidoc-editor"
      data-can-edit={String(canEdit)}
      data-project-id={projectId ?? ''}
      data-file-node-id={fileNodeId ?? ''}
    >{content}</div>
  )),
}));

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

jest.mock('@/hooks/use-editor-preferences', () => ({
  useEditorPreferences: jest.fn(() => ({
    fontSize: 14,
    theme: 'default',
    scrollSyncEnabled: false,
    setFontSize: jest.fn(),
    setTheme: jest.fn(),
    setScrollSyncEnabled: jest.fn(),
  })),
}));

// jest.fn() wrapper lets tests inspect content/scrollToLine props passed to the preview.
jest.mock('@/components/asciidoc-preview', () => ({
  AsciiDocPreview: jest.fn(({ onCollapse }: { content?: string; onCollapse?: () => void }) => (
    <div data-testid="asciidoc-preview">
      {onCollapse && <button aria-label="collapse preview" onClick={onCollapse} />}
    </div>
  )),
  isAsciiDocFile: (name: string) => name.endsWith('.adoc'),
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
  canEdit: true,
};

describe('ProjectEditorLayout', () => {
  beforeEach(() => {
    mockFetch();
    sessionStorage.clear();
    mockUseFileTreeEvents.mockReset();
    jest.requireMock('@/hooks/use-file-selection').useFileSelection.mockReturnValue({
      selectedFile: null,
      contentState: { content: null, isLoading: false, error: null, isBinary: false },
      selectFile: jest.fn(),
      clearSelection: jest.fn(),
    });
    jest.requireMock('@/components/editor/asciidoc-editor').AsciiDocEditor.mockClear();
    jest.requireMock('@/components/asciidoc-preview').AsciiDocPreview.mockClear();
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

  // Issue C2: switching files must mount a fresh editor (new DOM element) so internal
  // state (including any stale closures over fileNodeId) is completely reset.
  it('creates a new AsciiDocEditor DOM element when switching to a different file', async () => {
    const { useFileSelection } = jest.requireMock('@/hooks/use-file-selection');
    useFileSelection.mockReturnValue({
      selectedFile: { nodeId: 'file-1', nodeName: 'first.adoc', path: '/first.adoc', nodeType: 'file' },
      contentState: { content: 'First file', isLoading: false, error: null, isBinary: false },
      selectFile: jest.fn(),
      clearSelection: jest.fn(),
    });

    const { rerender } = render(<ProjectEditorLayout {...defaultProps} projectId="proj-1" />);
    await waitFor(() => expect(screen.getByTestId('asciidoc-editor')).toBeInTheDocument());
    const firstEditorElement = screen.getByTestId('asciidoc-editor');

    // Simulate switching to a different file
    useFileSelection.mockReturnValue({
      selectedFile: { nodeId: 'file-2', nodeName: 'second.adoc', path: '/second.adoc', nodeType: 'file' },
      contentState: { content: 'Second file', isLoading: false, error: null, isBinary: false },
      selectFile: jest.fn(),
      clearSelection: jest.fn(),
    });
    rerender(<ProjectEditorLayout {...defaultProps} projectId="proj-1" />);

    await waitFor(() => expect(screen.getByTestId('asciidoc-editor')).toHaveAttribute('data-file-node-id', 'file-2'));
    const secondEditorElement = screen.getByTestId('asciidoc-editor');
    // Verify it is a NEW DOM element (not the same reference reused),
    // which proves the editor remounted and reset its internal state.
    expect(secondEditorElement).not.toBe(firstEditorElement);
  });

  // Issue C8: when content prop changes for the same file (e.g. external-change reload),
  // AsciiDocEditor must display the new content. With key=fileNodeId this only applies
  // when content updates for the same file without a file switch. We verify the rendered
  // content always matches the current contentState.
  it('AsciiDocEditor displays updated content when contentState changes for the same file', async () => {
    const { useFileSelection } = jest.requireMock('@/hooks/use-file-selection');
    useFileSelection.mockReturnValue({
      selectedFile: { nodeId: 'file-x', nodeName: 'doc.adoc', path: '/doc.adoc', nodeType: 'file' },
      contentState: { content: 'original content', isLoading: false, error: null, isBinary: false },
      selectFile: jest.fn(),
      clearSelection: jest.fn(),
    });

    const { rerender } = render(<ProjectEditorLayout {...defaultProps} projectId="p1" />);
    await waitFor(() => expect(screen.getByTestId('asciidoc-editor')).toBeInTheDocument());
    expect(screen.getByTestId('asciidoc-editor')).toHaveTextContent('original content');

    // Simulate external change: same file, new content
    useFileSelection.mockReturnValue({
      selectedFile: { nodeId: 'file-x', nodeName: 'doc.adoc', path: '/doc.adoc', nodeType: 'file' },
      contentState: { content: 'updated content', isLoading: false, error: null, isBinary: false },
      selectFile: jest.fn(),
      clearSelection: jest.fn(),
    });
    rerender(<ProjectEditorLayout {...defaultProps} projectId="p1" />);

    await waitFor(() => expect(screen.getByTestId('asciidoc-editor')).toHaveTextContent('updated content'));
  });

  // Issue 4: liveContent must NOT be reset by external contentState.content changes while the user is editing
  it('keeps user-typed content in the preview after an external contentState.content update', async () => {
    const { useFileSelection } = jest.requireMock('@/hooks/use-file-selection');
    useFileSelection.mockReturnValue({
      selectedFile: { nodeId: 'f1', nodeName: 'doc.adoc', nodePath: '/doc.adoc', nodeType: 'file' },
      contentState: { content: 'saved content', isLoading: false, error: null, isBinary: false },
      selectFile: jest.fn(),
      clearSelection: jest.fn(),
    });

    const { rerender } = render(<ProjectEditorLayout {...defaultProps} />);

    // Open the preview panel
    const expandButton = await screen.findByRole('button', { name: /expand preview/i });
    fireEvent.click(expandButton);
    await waitFor(() => expect(screen.getByTestId('asciidoc-preview')).toBeInTheDocument());

    // Trigger onChange (simulates user typing)
    const { AsciiDocEditor: MockEditor } = jest.requireMock('@/components/editor/asciidoc-editor');
    const onChangeCallback: ((v: string) => void) | undefined = MockEditor.mock.calls.at(-1)?.[0]?.onChange;
    expect(onChangeCallback).toBeDefined();
    act(() => onChangeCallback!('user typed content'));

    // Simulate an external content update (e.g., a background save poll returns new content)
    useFileSelection.mockReturnValue({
      selectedFile: { nodeId: 'f1', nodeName: 'doc.adoc', nodePath: '/doc.adoc', nodeType: 'file' },
      contentState: { content: 'server updated content', isLoading: false, error: null, isBinary: false },
      selectFile: jest.fn(),
      clearSelection: jest.fn(),
    });
    rerender(<ProjectEditorLayout {...defaultProps} />);
    await waitFor(() => {});

    // The preview must still show the user's typed content, not the server's version
    const { AsciiDocPreview: MockPreview } = jest.requireMock('@/components/asciidoc-preview');
    const lastPreviewContent: string | undefined = MockPreview.mock.calls.at(-1)?.[0]?.content;
    expect(lastPreviewContent).toBe('user typed content');
  });

  // Issue 6: switching files must remount AsciiDocPreview so stale HTML is never shown
  it('remounts AsciiDocPreview when switching between different AsciiDoc files', async () => {
    const { useFileSelection } = jest.requireMock('@/hooks/use-file-selection');
    useFileSelection.mockReturnValue({
      selectedFile: { nodeId: 'file-a', nodeName: 'a.adoc', nodePath: '/a.adoc', nodeType: 'file' },
      contentState: { content: '= File A', isLoading: false, error: null, isBinary: false },
      selectFile: jest.fn(),
      clearSelection: jest.fn(),
    });

    const { rerender } = render(<ProjectEditorLayout {...defaultProps} />);
    const expandButton = await screen.findByRole('button', { name: /expand preview/i });
    fireEvent.click(expandButton);
    await waitFor(() => expect(screen.getByTestId('asciidoc-preview')).toBeInTheDocument());

    const firstPreviewElement = screen.getByTestId('asciidoc-preview');

    // Switch to a different AsciiDoc file
    useFileSelection.mockReturnValue({
      selectedFile: { nodeId: 'file-b', nodeName: 'b.adoc', nodePath: '/b.adoc', nodeType: 'file' },
      contentState: { content: '= File B', isLoading: false, error: null, isBinary: false },
      selectFile: jest.fn(),
      clearSelection: jest.fn(),
    });
    rerender(<ProjectEditorLayout {...defaultProps} />);
    await waitFor(() => expect(screen.getByTestId('asciidoc-preview')).toBeInTheDocument());

    const secondPreviewElement = screen.getByTestId('asciidoc-preview');

    // key={selectedFile.nodeId} must force a remount — a new DOM element must appear
    expect(secondPreviewElement).not.toBe(firstPreviewElement);
  });

  // Issue C1: AsciiDocEditor must receive projectId and fileNodeId for auto-save to work
  it('passes projectId and fileNodeId to AsciiDocEditor when a file is selected', async () => {
    const { useFileSelection } = jest.requireMock('@/hooks/use-file-selection');
    useFileSelection.mockReturnValue({
      selectedFile: { nodeId: 'file-abc', nodeName: 'chapter.adoc', path: '/chapter.adoc', nodeType: 'file' },
      contentState: { content: '= Chapter', isLoading: false, error: null, isBinary: false },
      selectFile: jest.fn(),
      clearSelection: jest.fn(),
    });

    render(<ProjectEditorLayout {...defaultProps} projectId="proj-123" />);

    await waitFor(() => expect(screen.getByTestId('asciidoc-editor')).toBeInTheDocument());
    const editor = screen.getByTestId('asciidoc-editor');
    expect(editor).toHaveAttribute('data-project-id', 'proj-123');
    expect(editor).toHaveAttribute('data-file-node-id', 'file-abc');
  });
});
