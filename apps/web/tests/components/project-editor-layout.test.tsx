import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Heavy dependency mocks ───────────────────────────────────────────────────

jest.mock('@/components/file-tree/file-tree', () => ({
  FileTree: ({
    onSelectFile,
    onCollapse,
  }: {
    onSelectFile?: (id: string, name: string, path: string, type: 'file' | 'folder') => void;
    onCollapse?: () => void;
  }) => (
    <div data-testid="file-tree">
      {onSelectFile && (
        <button data-testid="file-tree-select" onClick={() => onSelectFile('n1', 'doc.adoc', '/doc.adoc', 'file')} />
      )}
      {onCollapse && (
        <button data-testid="file-tree-collapse" onClick={onCollapse} />
      )}
    </div>
  ),
}));

jest.mock('@/components/editor/asciidoc-editor', () => ({
  AsciiDocEditor: ({ onScrollLine }: { onScrollLine?: (line: number) => void }) => (
    <div data-testid="asciidoc-editor">
      {onScrollLine && (
        <button data-testid="editor-scroll-line" onClick={() => onScrollLine(10)} />
      )}
    </div>
  ),
}));

jest.mock('@/components/image-preview', () => ({
  ImagePreview: ({ fileName }: { fileName: string }) => (
    <div data-testid="image-preview">{fileName}</div>
  ),
}));

jest.mock('@/components/asciidoc-preview', () => ({
  AsciiDocPreview: ({ onCollapse, scrollToLine }: { onCollapse?: () => void; scrollToLine?: { line: number } | null }) => (
    <div data-testid="asciidoc-preview" data-scroll-line={scrollToLine?.line ?? ''}>
      {onCollapse && (
        <button aria-label="collapse preview" onClick={onCollapse} />
      )}
    </div>
  ),
  isAsciiDocFile: (name: string) => name.endsWith('.adoc'),
}));

jest.mock('@/hooks/use-file-selection', () => ({
  useFileSelection: jest.fn(),
}));

jest.mock('react-resizable-panels', () => ({
  PanelGroup: ({ children, ...props }: { children: React.ReactNode; direction: string }) => (
    <div data-testid="panel-group" data-direction={props.direction}>{children}</div>
  ),
  Panel: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="panel">{children}</div>
  ),
  PanelResizeHandle: () => <div data-testid="panel-resize-handle" />,
}));

import { useFileSelection } from '@/hooks/use-file-selection';
const mockUseFileSelection = useFileSelection as jest.Mock;

import { ProjectEditorLayout } from '@/app/(dashboard)/dashboard/projects/[id]/project-editor-layout';

const adocFile = { nodeId: 'node-1', nodeName: 'doc.adoc', nodePath: '/doc.adoc', nodeType: 'file' as const };
const imageFile = { nodeId: 'img-1', nodeName: 'photo.png', nodePath: '/photo.png', nodeType: 'file' as const };
const noFile = null;

function makeContentState(overrides = {}) {
  return { isLoading: false, isBinary: false, error: null, content: '= Hello', etag: null, ...overrides };
}

beforeEach(() => {
  mockUseFileSelection.mockReturnValue({
    selectedFile: noFile,
    contentState: makeContentState(),
    selectFile: jest.fn(),
  });
  // Reset session storage
  sessionStorage.clear();
});

const defaultProps = {
  projectId: 'p1',
  projectName: 'My Project',
  projectDescription: null,
  isOwner: true,
  canEdit: true,
};

// ── ContentArea rendering states ─────────────────────────────────────────────

describe('ProjectEditorLayout — ContentArea states', () => {
  it('shows loading skeleton when content is loading', () => {
    mockUseFileSelection.mockReturnValue({
      selectedFile: adocFile,
      contentState: makeContentState({ isLoading: true }),
      selectFile: jest.fn(),
    });

    render(<ProjectEditorLayout {...defaultProps} />);

    expect(screen.queryByTestId('asciidoc-editor')).not.toBeInTheDocument();
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows binary-file message when content is binary and not an image', () => {
    mockUseFileSelection.mockReturnValue({
      selectedFile: adocFile,
      contentState: makeContentState({ isBinary: true }),
      selectFile: jest.fn(),
    });

    render(<ProjectEditorLayout {...defaultProps} />);

    expect(screen.getByText('Preview not available for binary files.')).toBeInTheDocument();
    expect(screen.queryByTestId('asciidoc-editor')).not.toBeInTheDocument();
  });

  it('shows ImagePreview when a binary image file is selected', () => {
    mockUseFileSelection.mockReturnValue({
      selectedFile: imageFile,
      contentState: makeContentState({ isBinary: true }),
      selectFile: jest.fn(),
    });

    render(<ProjectEditorLayout {...defaultProps} />);

    expect(screen.getByTestId('image-preview')).toBeInTheDocument();
    expect(screen.queryByText('Preview not available for binary files.')).not.toBeInTheDocument();
  });

  it('shows error message when content has an error', () => {
    mockUseFileSelection.mockReturnValue({
      selectedFile: adocFile,
      contentState: makeContentState({ error: 'Failed to load file' }),
      selectFile: jest.fn(),
    });

    render(<ProjectEditorLayout {...defaultProps} />);

    expect(screen.getByText('Failed to load file')).toBeInTheDocument();
    expect(screen.queryByTestId('asciidoc-editor')).not.toBeInTheDocument();
  });
});

// ── onScrollLine propagation ───────────────────────────────────────────────────

describe('ProjectEditorLayout — onScrollLine', () => {
  it('scrolling the editor updates scrollToLine passed to AsciiDocPreview', () => {
    mockUseFileSelection.mockReturnValue({
      selectedFile: adocFile,
      contentState: makeContentState(),
      selectFile: jest.fn(),
    });
    sessionStorage.setItem('asciidoc-preview-open', 'true');

    render(<ProjectEditorLayout {...defaultProps} />);

    // Before any scroll — no scroll request
    expect(screen.getByTestId('asciidoc-preview')).toHaveAttribute('data-scroll-line', '');

    // Simulate editor scroll at line 10
    fireEvent.click(screen.getByTestId('editor-scroll-line'));

    // Preview should now show scroll to line 10
    expect(screen.getByTestId('asciidoc-preview')).toHaveAttribute('data-scroll-line', '10');
  });
});

// ── Issue 1: collapse button must exist when preview is open ─────────────────

describe('ProjectEditorLayout — collapse preview', () => {
  // (a) a collapse button is rendered when the preview panel is open
  it('renders a collapse preview button when preview is open', () => {
    mockUseFileSelection.mockReturnValue({
      selectedFile: adocFile,
      contentState: makeContentState(),
      selectFile: jest.fn(),
    });
    sessionStorage.setItem('asciidoc-preview-open', 'true');

    render(<ProjectEditorLayout {...defaultProps} />);

    expect(screen.getByRole('button', { name: /collapse preview/i })).toBeInTheDocument();
  });

  // (b) clicking the collapse button closes the preview panel
  it('clicking collapse preview button closes the panel group', () => {
    mockUseFileSelection.mockReturnValue({
      selectedFile: adocFile,
      contentState: makeContentState(),
      selectFile: jest.fn(),
    });
    sessionStorage.setItem('asciidoc-preview-open', 'true');

    render(<ProjectEditorLayout {...defaultProps} />);
    expect(screen.getByTestId('panel-group')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /collapse preview/i }));

    expect(screen.queryByTestId('panel-group')).not.toBeInTheDocument();
  });
});

// ── Resizable panels ─────────────────────────────────────────────────────────

describe('ProjectEditorLayout — resizable panels', () => {
  // (a) when preview is open, a resize handle is rendered
  it('renders a PanelResizeHandle when preview is open', () => {
    mockUseFileSelection.mockReturnValue({
      selectedFile: adocFile,
      contentState: makeContentState(),
      selectFile: jest.fn(),
    });
    sessionStorage.setItem('asciidoc-preview-open', 'true');

    render(<ProjectEditorLayout {...defaultProps} />);

    expect(screen.getByTestId('panel-resize-handle')).toBeInTheDocument();
  });

  // (b) editor and preview panels are wrapped in a PanelGroup
  it('wraps editor and preview in a PanelGroup when preview is open', () => {
    mockUseFileSelection.mockReturnValue({
      selectedFile: adocFile,
      contentState: makeContentState(),
      selectFile: jest.fn(),
    });
    sessionStorage.setItem('asciidoc-preview-open', 'true');

    render(<ProjectEditorLayout {...defaultProps} />);

    expect(screen.getByTestId('panel-group')).toBeInTheDocument();
  });

  // (c) no resize handle when preview is closed
  it('does not render a PanelResizeHandle when preview is closed', () => {
    mockUseFileSelection.mockReturnValue({
      selectedFile: adocFile,
      contentState: makeContentState(),
      selectFile: jest.fn(),
    });
    // previewOpen = false (default)

    render(<ProjectEditorLayout {...defaultProps} />);

    expect(screen.queryByTestId('panel-resize-handle')).not.toBeInTheDocument();
  });
});

// ── Sidebar collapse / expand ─────────────────────────────────────────────────

describe('ProjectEditorLayout — sidebar', () => {
  it('collapsing sidebar via FileTree onCollapse shows expand button', () => {
    mockUseFileSelection.mockReturnValue({
      selectedFile: adocFile,
      contentState: makeContentState(),
      selectFile: jest.fn(),
    });

    render(<ProjectEditorLayout {...defaultProps} />);

    // Collapse the sidebar via FileTree's onCollapse button
    fireEvent.click(screen.getByTestId('file-tree-collapse'));

    // Expand button should now be visible
    expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument();
  });

  it('clicking expand sidebar button makes sidebar visible again', () => {
    mockUseFileSelection.mockReturnValue({
      selectedFile: adocFile,
      contentState: makeContentState(),
      selectFile: jest.fn(),
    });

    render(<ProjectEditorLayout {...defaultProps} />);

    fireEvent.click(screen.getByTestId('file-tree-collapse'));
    fireEvent.click(screen.getByRole('button', { name: /expand sidebar/i }));

    expect(screen.queryByRole('button', { name: /expand sidebar/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('file-tree')).toBeInTheDocument();
  });

  it('FileTree onSelectFile propagates the call to selectFile from useFileSelection', () => {
    const selectFile = jest.fn();
    mockUseFileSelection.mockReturnValue({
      selectedFile: adocFile,
      contentState: makeContentState(),
      selectFile,
    });

    render(<ProjectEditorLayout {...defaultProps} />);

    fireEvent.click(screen.getByTestId('file-tree-select'));

    expect(selectFile).toHaveBeenCalledWith('n1', 'doc.adoc', '/doc.adoc', 'file');
  });
});
