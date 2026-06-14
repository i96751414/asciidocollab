'use client';
import { useLayoutEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Settings, Users } from 'lucide-react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';
import { ResizeHandle } from '@/components/ui/resize-handle';
import { BackButton } from '@/components/back-button';
import { LogoMark } from '@/components/logo';
import { FileTree } from '@/components/file-tree/file-tree';
import { AsciiDocEditor } from '@/components/editor/asciidoc-editor';
import { useProjectSymbolIndex } from '@/hooks/use-project-symbol-index';
import type { ProjectSymbolIndex } from '@/lib/codemirror/asciidoc-symbol-index';
import { AsciiDocPreview, isAsciiDocFile } from '@/components/asciidoc-preview';
import { ImagePreview } from '@/components/image-preview';
import { isImageFile } from '@/lib/codemirror/asciidoc-image-extensions';
import { useFileSelection } from '@/hooks/use-file-selection';
import { useEditorPreferences } from '@/hooks/use-editor-preferences';
import { type ConnectionState } from '@/hooks/use-collab-document';

import type { SelectedFile, FileContentState } from '@/hooks/use-file-selection';
import type { CollabBinding } from '@/components/editor/asciidoc-editor';
import type { XrefTarget } from '@/lib/codemirror/asciidoc-link-handler';
import type { CursorSymbol } from '@/lib/codemirror/asciidoc-symbol-at-cursor';
import { EditorGoToSymbol } from '@/components/editor/editor-go-to-symbol';
import { EditorSymbolRefactor } from '@/components/editor/editor-symbol-refactor';
import { findSymbolUsages, renameSymbol } from '@/lib/api/projects';
import { useProjectEditorState } from '@/app/(dashboard)/dashboard/projects/[id]/use-project-editor-state';
import { useManagedCollab } from '@/app/(dashboard)/dashboard/projects/[id]/use-managed-collab';
import { useEditorNavigation } from '@/app/(dashboard)/dashboard/projects/[id]/use-editor-navigation';
import { useEditorRestoration } from '@/app/(dashboard)/dashboard/projects/[id]/use-editor-restoration';

interface ContentAreaProperties {
  selectedFile: SelectedFile | null;
  contentState: FileContentState;
  canEdit: boolean;
  projectId: string;
  /** Project document language (ISO 639-1) driving the spellchecker, or null when unset. */
  projectLanguage: string | null;
  onScrollLine?: (line: number) => void;
  onLineClick?: (line: number) => void;
  // Ctrl+click on an include/image path — reveals and selects the target file in the tree.
  onNavigateToFile?: (path: string) => void;
  // Ctrl+click on a cross-reference — reveals its definition (same file or another, FR-049).
  onNavigateToXref?: (target: XrefTarget) => void;
  // Include-path level offset inherited by the open file from its ancestors (US3/FR-071/045a).
  inheritedOffset?: number;
  // Attributes the open file inherits from the documents that include it (US8/FR-045a).
  inheritedAttributes?: ReadonlyMap<string, string>;
  // Live request to reveal a line in the open editor (same-file go-to-definition, FR-049).
  revealRequest?: { line: number; nonce: number } | null;
  // Ctrl+click on a link or URL — opens it in a new tab.
  onOpenUrl?: (url: string) => void;
  onChange?: (value: string) => void;
  /** 1-based line to restore the cursor to on mount (only for the restored file). */
  initialLine?: number;
  /**
   * Reports the 1-based cursor line up for debounced persistence.
   *
   * @param line - The 1-based line the cursor is on.
   */
  onCursorLineChange?: (line: number) => void;
  /** Live collaboration binding for the selected file, or null on the legacy path. */
  collab?: CollabBinding | null;
  /** True when the file is collaborative but the provider/Y.Doc is not ready yet. */
  collabPending?: boolean;
  /** Collaboration connection state, for the editor's status banner. */
  connectionState?: ConnectionState;
  /** Content to render instead of contentState.content (offline read-only fallback). */
  contentOverride?: string | null;
  /** True when the file is editable text with no collaborative document — read-only, no autosave. */
  collabUnavailable?: boolean;
  /** Live accessor for the cross-file symbol index (US8); powers cross-file diagnostics + completion. */
  getProjectIndex?: () => ProjectSymbolIndex | null;
  /** Opens the Go to Symbol palette from the editor toolbar (FR-061). */
  onGoToSymbol?: () => void;
  // Opens the refactor dialog from the editor toolbar, seeded with the cursor symbol (US12).
  onRefactor?: (initial: CursorSymbol | null) => void;
}

function ContentArea({
  selectedFile,
  contentState,
  canEdit,
  projectId,
  projectLanguage,
  onScrollLine,
  onLineClick,
  onNavigateToFile,
  onNavigateToXref,
  inheritedOffset,
  inheritedAttributes,
  revealRequest,
  onOpenUrl,
  onChange,
  initialLine,
  onCursorLineChange,
  collab,
  collabPending,
  connectionState,
  contentOverride,
  collabUnavailable,
  getProjectIndex,
  onGoToSymbol,
  onRefactor,
}: ContentAreaProperties) {
  if (selectedFile === null) {
    return <p className="text-muted-foreground text-sm p-4">Select a file from the tree to view its content.</p>;
  }
  if (contentState.isLoading || collabPending) {
    return (
      <div className="p-4 space-y-2">
        <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
        <div className="h-4 w-1/2 bg-muted animate-pulse rounded" />
      </div>
    );
  }
  if (contentState.isBinary) {
    if (isImageFile(selectedFile.nodeName)) {
      return (
        <ImagePreview
          key={selectedFile.nodeId}
          projectId={projectId}
          fileNodeId={selectedFile.nodeId}
          fileName={selectedFile.nodeName}
        />
      );
    }
    return <p className="text-muted-foreground text-sm p-4">Preview not available for binary files.</p>;
  }
  if (contentState.error) {
    return <p className="text-destructive text-sm p-4">{contentState.error}</p>;
  }
  return (
    <AsciiDocEditor
      key={selectedFile.nodeId}
      content={contentOverride ?? contentState.content ?? ''}
      canEdit={canEdit}
      projectId={projectId}
      fileNodeId={selectedFile.nodeId}
      initialEtag={contentState.etag}
      isAsciiDoc={isAsciiDocFile(selectedFile.nodeName)}
      spellcheckLanguage={projectLanguage}
      onScrollLine={onScrollLine}
      onLineClick={onLineClick}
      onNavigateToFile={onNavigateToFile}
      onNavigateToXref={onNavigateToXref}
      inheritedOffset={inheritedOffset}
      inheritedAttributes={inheritedAttributes}
      revealRequest={revealRequest}
      onOpenUrl={onOpenUrl}
      onChange={onChange}
      initialLine={initialLine}
      onCursorLineChange={onCursorLineChange}
      collab={collab}
      connectionState={connectionState}
      collabUnavailable={collabUnavailable}
      getProjectIndex={getProjectIndex}
      onGoToSymbol={onGoToSymbol}
      onRefactor={onRefactor}
    />
  );
}

interface ProjectEditorLayoutProperties {
  projectId: string;
  projectName: string;
  projectDescription: string | null;
  /** Project document language (ISO 639-1) driving the spellchecker, or null when unset. */
  projectLanguage: string | null;
  /** Configured main-file node id (US8/FR-045), or null when unset. */
  mainFileNodeId: string | null;
  canManage: boolean;
  canEdit: boolean;
  /** Authenticated user id — scopes the persisted last-selection so accounts stay isolated (FR-011). */
  userId: string;
}

/** Three-panel editor layout: collapsible file tree, CM6 editor, AsciiDoc preview. */
export function ProjectEditorLayout({
  projectId,
  projectName,
  projectDescription,
  projectLanguage,
  mainFileNodeId,
  canManage,
  canEdit,
  userId,
}: ProjectEditorLayoutProperties) {
  const { selectedFile, contentState, selectFile, clearSelection } = useFileSelection(projectId);

  // Layout-shell + live-content state: main-file selection, sidebar + preview visibility, and the
  // live editor buffer that feeds the preview.
  const {
    mainFile,
    sidebarOpen, setSidebarOpen, sidebarResize,
    previewOpen, togglePreview,
    liveContent, handleChange,
  } = useProjectEditorState({
    mainFileNodeId,
    selectedFileNodeId: selectedFile?.nodeId ?? null,
    content: contentState.content,
  });

  // Cross-file symbol index (US8): rooted at the configured main file, or the open file when
  // none is set (FR-047). Powers cross-file diagnostics + completion; refreshes when the main
  // file changes (FR-045a) and overlays the open file's live content (FR-048).
  const { index: projectIndex, getIndex: getProjectIndex, getFiles: getProjectFiles, refresh: refreshProjectIndex } = useProjectSymbolIndex({
    projectId,
    rootFileId: mainFile ?? selectedFile?.nodeId ?? null,
    openFileId: selectedFile?.nodeId ?? null,
    liveContent,
  });

  // Collaboration orchestration for the open file: the Yjs binding, mid-session role enforcement
  // (FR-012), offline read-only fallback (FR-013), presence (feature 024), and the derived editor
  // props (research D6 / EditorMode).
  const {
    presenceByFile,
    editorCollab,
    collabUnavailable,
    editorCanEdit,
    editorContentOverride,
    editorConnectionState,
    editorPending,
  } = useManagedCollab({ projectId, selectedFile, contentState, canEdit });

  // File + cross-reference navigation, the go-to-symbol palette, and the refactor dialog.
  const {
    scrollRequest, resetScroll, revealRequest, openPathRequest, pendingXrefLine,
    handleScrollLine, handleLineClick, handleNavigateToFile, handleNavigateToXref, handleOpenUrl,
    goToSymbolOpen, setGoToSymbolOpen, symbolPathOf, handleSelectSymbol,
    refactorOpen, setRefactorOpen, refactorInitial, openRefactor,
    handleNavigateToUsage, handleSymbolRenamed,
  } = useEditorNavigation({ projectIndex, getProjectIndex, refreshProjectIndex });

  // Last-selection restoration (FR-010), cursor-line persistence (FR-006), and the stale-memory
  // cleanup for a missing restored file (FR-009/US3).
  const { handleSelectFile, handleCursorLineChange, initialLine } = useEditorRestoration({
    userId, projectId, selectedFile, contentState, selectFile, clearSelection, pendingXrefLine,
  });

  const { scrollSyncEnabled, setScrollSyncEnabled, previewStyle, setPreviewStyle } = useEditorPreferences();

  // Reset scroll position whenever a different file is opened.
  // useLayoutEffect prevents a one-frame flash of the old scroll position.
  useLayoutEffect(() => {
    resetScroll();
  }, [selectedFile?.nodeId, resetScroll]);

  // Level offset the open file inherits from its include ancestors (FR-071); 0 until the index
  // resolves it or when the file is the tree root. Re-evaluates heading levels on main-file change.
  const editorInheritedOffset = projectIndex && selectedFile ? projectIndex.inheritedOffset(selectedFile.nodeId) : 0;
  // Attributes the open file inherits from the documents that include it (FR-045a); empty until the
  // index resolves them or when the file is the tree root. Seeds the `{attr}` collapse-to-value
  // display so cross-document references render their value.
  const editorInheritedAttributes =
    projectIndex && selectedFile ? projectIndex.inheritedAttributes(selectedFile.nodeId) : undefined;
  // Render the assembled main document (includes inlined, FR-068) only while the open file IS the
  // configured main file. Editing an included child still previews that child standalone with exact
  // source-line scroll-sync. (When the main file itself has content after an include, scroll-sync to
  // those later lines is approximate — an inherent limit of an assembled multi-file preview; lines
  // before the first include still map exactly.)
  const previewMainPath = mainFile && selectedFile?.nodeId === mainFile && projectIndex
    ? (projectIndex.pathOf(mainFile) ?? undefined)
    : undefined;

  const showPreview = selectedFile !== null && isAsciiDocFile(selectedFile.nodeName);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 h-14 px-3 border-b shrink-0">
        <BackButton href="/dashboard" label="Back to projects" />
        <LogoMark className="h-5 w-5 text-primary shrink-0" />
        <div className="min-w-0 flex flex-col">
          <span className="font-semibold text-sm truncate">{projectName}</span>
          {projectDescription && (
            <span className="text-xs text-muted-foreground truncate">{projectDescription}</span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {canManage && (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/dashboard/projects/${projectId}/settings`}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/dashboard/projects/${projectId}/members`}>
                  <Users className="mr-2 h-4 w-4" />
                  Members
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Body: sidebar + content + preview */}
      <div className="flex flex-1 overflow-hidden">
        {/* File tree panel — resizable via the divider on its right edge. */}
        <div
          data-testid="file-tree-panel"
          style={sidebarOpen ? { width: sidebarResize.width } : undefined}
          className={sidebarOpen ? 'shrink-0 overflow-y-auto' : 'hidden'}
        >
          <FileTree
            projectId={projectId}
            canEdit={canEdit}
            onSelectFile={handleSelectFile}
            selectedNodeId={selectedFile?.nodeId ?? null}
            presenceByFile={presenceByFile}
            onCollapse={() => setSidebarOpen(false)}
            openPathRequest={openPathRequest}
          />
        </div>
        {sidebarOpen && (
          <ResizeHandle
            ariaLabel="Resize file tree"
            onPointerDown={sidebarResize.onPointerDown}
            onKeyDown={sidebarResize.onKeyDown}
            isResizing={sidebarResize.isResizing}
          />
        )}

        {!sidebarOpen && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="expand sidebar"
            className="w-6 h-full shrink-0 border-r rounded-none"
            onClick={() => setSidebarOpen(true)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}

        {/* Editor + Preview panels. The editor's ContentArea stays mounted in ONE
            stable Panel regardless of previewOpen — only the preview Panel + resize
            handle mount/unmount — so toggling the preview never remounts CodeMirror
            and never loses editor content/cursor/scroll (US1, FR-001–005). */}
        <PanelGroup direction="horizontal" className="flex-1 overflow-hidden">
          <Panel
            id="editor-content"
            order={1}
            defaultSize={showPreview && previewOpen ? 50 : 100}
            minSize={20}
            className="overflow-hidden flex flex-col p-4"
            data-testid="content-panel"
          >
            <ContentArea
              selectedFile={selectedFile}
              contentState={contentState}
              canEdit={editorCanEdit}
              projectId={projectId}
              projectLanguage={projectLanguage}
              onScrollLine={previewOpen && scrollSyncEnabled ? handleScrollLine : undefined}
              onLineClick={previewOpen ? handleLineClick : undefined}
              onNavigateToFile={handleNavigateToFile}
              onNavigateToXref={handleNavigateToXref}
              inheritedOffset={editorInheritedOffset}
              inheritedAttributes={editorInheritedAttributes}
              revealRequest={revealRequest}
              onOpenUrl={handleOpenUrl}
              onChange={handleChange}
              initialLine={initialLine}
              onCursorLineChange={handleCursorLineChange}
              collab={editorCollab}
              collabPending={editorPending}
              connectionState={editorConnectionState}
              contentOverride={editorContentOverride}
              collabUnavailable={collabUnavailable}
              getProjectIndex={getProjectIndex}
              onGoToSymbol={() => setGoToSymbolOpen(true)}
              onRefactor={openRefactor}
            />
          </Panel>
          {showPreview && previewOpen && (
            <>
              <PanelResizeHandle className="group relative z-10 flex w-[7px] shrink-0 cursor-col-resize items-stretch justify-center outline-none">
                <span className="w-px bg-border transition-colors group-hover:bg-primary/60 group-data-[resize-handle-state=drag]:bg-primary" />
              </PanelResizeHandle>
              <Panel id="editor-preview" order={2} defaultSize={50} minSize={20} className="overflow-hidden" data-testid="preview-panel">
                <AsciiDocPreview
                  key={selectedFile?.nodeId}
                  content={liveContent}
                  isEnabled={previewOpen}
                  projectId={projectId}
                  mainPath={previewMainPath}
                  getFiles={getProjectFiles}
                  scrollToLine={scrollRequest}
                  onCollapse={togglePreview}
                  scrollSyncEnabled={scrollSyncEnabled}
                  onToggleScrollSync={() => setScrollSyncEnabled(!scrollSyncEnabled)}
                  previewStyle={previewStyle}
                  onPreviewStyleChange={setPreviewStyle}
                />
              </Panel>
            </>
          )}
        </PanelGroup>
        {showPreview && !previewOpen && (
          <Button
            data-testid="preview-panel"
            variant="ghost"
            size="icon"
            aria-label="expand preview"
            className="w-6 h-full shrink-0 border-l rounded-none"
            onClick={togglePreview}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
      </div>
      <EditorGoToSymbol
        open={goToSymbolOpen}
        symbols={projectIndex?.symbols ?? []}
        pathOf={symbolPathOf}
        onSelect={handleSelectSymbol}
        onClose={() => setGoToSymbolOpen(false)}
      />
      <EditorSymbolRefactor
        open={refactorOpen}
        projectId={projectId}
        canEdit={canEdit}
        initial={refactorInitial}
        findUsages={findSymbolUsages}
        renameSymbol={renameSymbol}
        onNavigate={handleNavigateToUsage}
        onRenamed={handleSymbolRenamed}
        onClose={() => setRefactorOpen(false)}
      />
    </div>
  );
}
