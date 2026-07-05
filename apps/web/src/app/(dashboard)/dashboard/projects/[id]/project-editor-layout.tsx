'use client';
import { useLayoutEffect, useState, useCallback, useMemo, useRef } from 'react';
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
import { useFileTreeEvents } from '@/hooks/use-file-tree-events';
import type { ProjectSymbolIndex } from '@/lib/codemirror/asciidoc-symbol-index';
import { AsciiDocPreview, isAsciiDocFile } from '@/components/asciidoc-preview';
import { ImagePreview } from '@/components/image-preview';
import { isImageFile } from '@/lib/codemirror/asciidoc-image-extensions';
import { useFileSelection } from '@/hooks/use-file-selection';
import { useFileHistory } from '@/hooks/use-file-history';
import { useEditorPreferences } from '@/hooks/use-editor-preferences';
import { type ConnectionState } from '@/hooks/use-collab-document';

import { LeftPanel } from '@/components/editor/left-panel';
import { OutlineView } from '@/components/editor/outline-view';
import { SearchView, type SearchResultTarget } from '@/components/editor/search-view';
import { NonLiveIndicator } from '@/components/editor/non-live-indicator';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';
import { assembleOutline, mapOutlinePresence } from '@/lib/outline';
import { sameOutlineEntries } from '@/lib/outline/stable-entries';
import type { OutlinePeer } from '@/lib/outline';
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
  // Ctrl+click on a cross-reference — reveals its definition (same file or another).
  onNavigateToXref?: (target: XrefTarget) => void;
  // Include-path level offset inherited by the open file from its ancestors.
  inheritedOffset?: number;
  // Attributes the open file inherits from the documents that include it.
  inheritedAttributes?: ReadonlyMap<string, string>;
  // The open file's resolved cross-document scope (inherited + own), for `{name}` known highlighting.
  resolvedScope?: ReadonlyMap<string, string>;
  // Bumped when a collaborator changes any project file, so a visible rename offer re-queries.
  renameRefreshNonce?: number;
  // Live request to reveal a line in the open editor (same-file go-to-definition).
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
  /**
   * Reports the live section outline up so the left-panel Outline view can render it (028).
   *
   * @param entries - The current section outline entries, including the level-0 title.
   */
  onOutlineChange?: (entries: SectionOutlineEntry[]) => void;
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
  /** Live accessor for the cross-file symbol index; powers cross-file diagnostics + completion. */
  getProjectIndex?: () => ProjectSymbolIndex | null;
  /** Opens the Go to Symbol palette from the editor toolbar. */
  onGoToSymbol?: () => void;
  // Opens the refactor dialog from the editor toolbar, seeded with the cursor symbol.
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
  resolvedScope,
  renameRefreshNonce,
  revealRequest,
  onOpenUrl,
  onChange,
  initialLine,
  onCursorLineChange,
  onOutlineChange,
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
      resolvedScope={resolvedScope}
      renameRefreshNonce={renameRefreshNonce}
      revealRequest={revealRequest}
      onOpenUrl={onOpenUrl}
      onChange={onChange}
      initialLine={initialLine}
      onCursorLineChange={onCursorLineChange}
      onOutlineChange={onOutlineChange}
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
  /** Configured main-file node id, or null when unset. */
  mainFileNodeId: string | null;
  canManage: boolean;
  canEdit: boolean;
  /** Authenticated user id — scopes the persisted last-selection so accounts stay isolated. */
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
    mainFile, setMainFile,
    sidebarOpen, setSidebarOpen, sidebarResize,
    previewOpen, togglePreview,
    liveContent, liveOverlayContent, handleChange,
  } = useProjectEditorState({
    mainFileNodeId,
    selectedFileNodeId: selectedFile?.nodeId ?? null,
    content: contentState.content,
  });

  // Editor preferences (preview style, outline scope/visibility, included-file display).
  const { scrollSyncEnabled, setScrollSyncEnabled, previewStyle, setPreviewStyle, leftPanelTab, setLeftPanelTab, showIncludedFiles, setShowIncludedFiles, outlineScope, setOutlineScope } = useEditorPreferences();

  // Cross-file symbol index: rooted at the configured main file, or the open file when
  // none is set. Powers cross-file diagnostics + completion; refreshes when the main
  // file changes and overlays the open file's live content.
  const { index: projectIndex, getIndex: getProjectIndex, getFiles: getProjectFiles, resolvedScopeOf, refresh: refreshProjectIndex, fileIdForPath, reachableDocVersion } = useProjectSymbolIndex({
    projectId,
    rootFileId: mainFile ?? selectedFile?.nodeId ?? null,
    openFileId: selectedFile?.nodeId ?? null,
    // Overlay the open file's content only once its editor has produced it; before then `null` keeps
    // the index on the cached/persisted copy so a file switch doesn't transiently blank the open file
    // (which would drop its headings from the assembled outline and re-add them a frame later).
    liveContent: liveOverlayContent,
  });

  // Rename freshness: a rename suggestion's project-wide counts/collision must track a collaborator's
  // edits to ANY project file — including files outside the open document's dependency graph — so this
  // subscription is intentionally unfiltered (the symbol index's content-changed handler filters by
  // reachability, which is too narrow for a project-wide rename). The bumped nonce nudges the editor's
  // rename plugin to re-query while an offer is visible.
  const [renameRefreshNonce, setRenameRefreshNonce] = useState(0);
  // While the SSE stream is down, a collaborator's live edits are not being delivered, so related
  // content may be resolved from last-saved rather than a live session — surface that subtly. Driven
  // by the true connection edges (dropped ⇒ non-live, (re)established ⇒ live), not by a rebuild, so it
  // stays steadily on through an outage and clears exactly when the stream actually recovers.
  const [nonLive, setNonLive] = useState(false);
  useFileTreeEvents(projectId, {
    onContentChanged: () => setRenameRefreshNonce((nonce) => nonce + 1),
    // A collaborator changed the project's main file: update the single source of truth so BOTH the
    // symbol index's root and the preview root re-resolve against the new anchor (no split-brain).
    onMainFileChanged: (event) => setMainFile(event.mainFileNodeId),
    onReconnect: () => setNonLive(true),
    onConnected: () => setNonLive(false),
  });

  // Left-panel Outline view state (028): the live outline lifted from the editor and the cursor line
  // used to mark the current section. Held here so the panel is fed without remounting the editor.
  // Declared before useManagedCollab so cursorLine can be forwarded to presence publishing.
  const [cmOutlineEntries, setOutlineEntries] = useState<SectionOutlineEntry[]>([]);
  const [currentLine, setCurrentLine] = useState<number | null>(null);

  // Collaboration orchestration for the open file: the Yjs binding, mid-session role enforcement,
  // offline read-only fallback, presence (feature 024), and the derived editor
  // props (research D6 / EditorMode).
  const {
    presenceByFile,
    editorCollab,
    collabUnavailable,
    editorCanEdit,
    editorContentOverride,
    editorConnectionState,
    editorPending,
  } = useManagedCollab({ projectId, selectedFile, contentState, canEdit, cursorLine: currentLine });

  // File + cross-reference navigation, the go-to-symbol palette, and the refactor dialog.
  const {
    scrollRequest, resetScroll, revealRequest, openPathRequest, pendingXrefLine,
    handleScrollLine, handleLineClick, revealLine, handleNavigateToFile, handleNavigateToXref, handleOpenUrl,
    goToSymbolOpen, setGoToSymbolOpen, symbolPathOf, handleSelectSymbol,
    refactorOpen, setRefactorOpen, refactorInitial, openRefactor,
    handleNavigateToUsage, handleSymbolRenamed,
  } = useEditorNavigation({ projectIndex, getProjectIndex, refreshProjectIndex });

  // Last-selection restoration, cursor-line persistence, and the stale-memory
  // cleanup for a missing restored file.
  const { handleSelectFile, handleCursorLineChange, initialLine } = useEditorRestoration({
    userId, projectId, selectedFile, contentState, selectFile, clearSelection, pendingXrefLine,
  });

  // Make file selection a real browser navigation: each opened file becomes a history entry, so the
  // Back/Forward buttons walk the files visited this session and re-open the previous one through the
  // same selection funnel (remember + cursor restore). Reload restoration stays the localStorage
  // concern of useEditorRestoration above.
  useFileHistory({ selectedFile, selectFile: handleSelectFile });

  // Reset the scroll position AND the current-section marker whenever a different file is opened, so the
  // Outline never highlights a row using the previous file's cursor line before the new editor reports
  // its cursor. useLayoutEffect prevents a one-frame flash of the old scroll position / stale highlight.
  useLayoutEffect(() => {
    resetScroll();
    setCurrentLine(null);
  }, [selectedFile?.nodeId, resetScroll]);

  // Level offset the open file inherits from its include ancestors; 0 until the index
  // resolves it or when the file is the tree root. Re-evaluates heading levels on main-file change.
  const editorInheritedOffset = projectIndex && selectedFile ? projectIndex.inheritedOffset(selectedFile.nodeId) : 0;
  // Attributes the open file inherits from the documents that include it; empty until the
  // index resolves them or when the file is the tree root. Seeds the `{attr}` collapse-to-value
  // display so cross-document references render their value.
  const editorInheritedAttributes =
    projectIndex && selectedFile ? projectIndex.inheritedAttributes(selectedFile.nodeId) : undefined;
  // The open file's RESOLVED cross-document scope (inherited + own definitions): drives the editor's
  // known-vs-unknown `{name}` highlighting so a reference resolving in a parent/included file marks
  // as known. Recomputed when the index rebuilds (live).
  const editorResolvedScope =
    projectIndex && selectedFile ? resolvedScopeOf(selectedFile.nodeId) : undefined;
  // Render the assembled main document (includes inlined) only while the open file IS the
  // configured main file. Editing an included child still previews that child standalone with exact
  // source-line scroll-sync. (When the main file itself has content after an include, scroll-sync to
  // those later lines is approximate — an inherent limit of an assembled multi-file preview; lines
  // before the first include still map exactly.)
  const previewMainPath = mainFile && selectedFile?.nodeId === mainFile && projectIndex
    ? (projectIndex.pathOf(mainFile) ?? undefined)
    : undefined;

  // Cross-document attribute resolution: when a main file is configured and the open
  // file is NOT it, the preview resolves the open file's `{name}` references against the scope it
  // inherits under the main-file root. Paths key the worker's resolution model (matching getFiles).
  const previewRootPath = mainFile && projectIndex ? (projectIndex.pathOf(mainFile) ?? undefined) : undefined;
  const previewOpenPath =
    selectedFile && projectIndex ? (projectIndex.pathOf(selectedFile.nodeId) ?? undefined) : undefined;

  // Full-document outline (feature 032): assemble across include directives when a main file is
  // configured and the open file is reachable. `getProjectFiles()` overlays the open file's live
  // content (once its editor has produced it — see `liveOverlayContent`) so in-progress edits are
  // reflected. Depends on liveOverlayContent (open-file edit), previewOpenPath (open-file change),
  // and previewRootPath (main-file change).
  const assembledOutlineResult = useMemo(() => {
    if (!previewRootPath || !previewOpenPath || !selectedFile) return null;
    if (outlineScope === 'current') return null; // skip assembly when user wants current-file only
    // Skip assembly until the file tree is loaded enough to resolve file IDs. Without this guard,
    // fileIdForPath falls back to the path string, making isOpenFile comparisons always false and
    // routing every outline heading click through handleNavigateToFile instead of revealLine.
    if (!fileIdForPath(previewOpenPath)) return null;
    const files = getProjectFiles();
    return assembleOutline({
      rootPath: previewRootPath,
      openFilePath: previewOpenPath,
      openFileId: selectedFile.nodeId,
      readFile: (path: string) => files[path] ?? null,
      fileIdForPath: (path: string) => fileIdForPath(path) ?? path,
      scopePreference: 'full',
    });
    // `projectIndex` is included so a rebuild that asynchronously fetches a reachable file's content
    // (e.g. The included file's text arrives after a reload, or a collaborator's live edit lands)
    // re-runs this memo against the now-populated `getProjectFiles()` snapshot. Without it the memo
    // would keep the stale assembly because `getProjectFiles` is referentially stable.
  }, [previewRootPath, previewOpenPath, selectedFile, liveOverlayContent, getProjectFiles, fileIdForPath, projectIndex, reachableDocVersion, outlineScope]);

  // Resolve outline entries and effective scope: prefer the assembled full outline when available
  // (scope='full'), otherwise use the CM6 single-file entries (current scope).
  const outlineEntriesRaw: SectionOutlineEntry[] =
    assembledOutlineResult?.scope === 'full' ? assembledOutlineResult.entries : cmOutlineEntries;
  const outlineEffectiveScope: 'full' | 'current' =
    assembledOutlineResult?.scope === 'full' ? 'full' : 'current';

  // Keep the outline array identity STABLE when a rebuild produces a value-equal result. The assembled
  // outline is recomputed on every symbol-index rebuild (keystrokes, reachable-doc changes, a file
  // switch that doesn't alter the full document), each time yielding a fresh array; reusing the prior
  // reference when nothing changed stops the outline panel from re-rendering needlessly.
  const stableOutlineReference = useRef<SectionOutlineEntry[]>(outlineEntriesRaw);
  if (!sameOutlineEntries(stableOutlineReference.current, outlineEntriesRaw)) {
    stableOutlineReference.current = outlineEntriesRaw;
  }
  const outlineEntries = stableOutlineReference.current;

  // Peer cursor positions mapped to outline headings (feature 032).
  // Only peers with a numeric cursorLine contribute; others are ignored.
  const outlinePresence = useMemo(() => {
    const peersWithCursor = new Map<string, OutlinePeer[]>();
    for (const [fileId, peers] of presenceByFile) {
      const filtered = peers.filter((p): p is OutlinePeer => typeof p.cursorLine === 'number');
      if (filtered.length > 0) peersWithCursor.set(fileId, filtered);
    }
    return mapOutlinePresence(outlineEntries, peersWithCursor);
  }, [outlineEntries, presenceByFile]);

  // Outline navigation (feature 032): route by provenance.
  // - Open-file entries (no provenance OR isOpenFile=true) → reveal in the open editor.
  // - Foreign-file entries (isOpenFile=false with a sourcePath) → switch to that file and reveal
  //   the source line once the new editor mounts (reuses the xref pending-line seam).
  const handleOutlineHeadingClick = useCallback(
    (entry: SectionOutlineEntry) => {
      if (entry.isOpenFile === false && entry.sourcePath) {
        pendingXrefLine.current = entry.sourceLine ?? null;
        handleNavigateToFile(entry.sourcePath);
        return;
      }
      const targetLine = entry.sourceLine ?? entry.line;
      revealLine(targetLine);
      if (previewOpen && !scrollSyncEnabled) handleLineClick(targetLine);
    },
    [revealLine, handleLineClick, handleNavigateToFile, pendingXrefLine, previewOpen, scrollSyncEnabled],
  );

  // Project-wide search result activation: reveal in place when the match is in the open file,
  // otherwise switch to its file and reveal the match line once the new editor mounts (reuses the
  // same pending-line seam as xref/outline navigation).
  const handleSearchResultNavigate = useCallback(
    (target: SearchResultTarget) => {
      if (selectedFile?.nodeId === target.fileNodeId) {
        revealLine(target.line);
        if (previewOpen && !scrollSyncEnabled) handleLineClick(target.line);
        return;
      }
      pendingXrefLine.current = target.line;
      handleNavigateToFile(target.path);
    },
    [selectedFile, revealLine, handleLineClick, handleNavigateToFile, pendingXrefLine, previewOpen, scrollSyncEnabled],
  );

  const showPreview = selectedFile !== null && isAsciiDocFile(selectedFile.nodeName);

  return (
    // The editor is full-bleed: it cancels the dashboard <main>'s `p-6` with a negative margin and adds
    // that padding back to its height so the rail, editor, and preview reach every edge of the viewport.
    // COUPLED to `<main className="…p-6">` in `(dashboard)/layout.tsx`: `-m-6` cancels its padding and
    // `3rem` re-adds the top+bottom (2 × the 1.5rem `p-6`). If that padding changes, update BOTH here.
    <div className="flex flex-col h-[calc(100%+3rem)] -m-6">
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
          <NonLiveIndicator active={nonLive} />
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
          className={sidebarOpen ? 'shrink-0 overflow-hidden' : 'hidden'}
        >
          <LeftPanel
            activeTab={leftPanelTab}
            onTabChange={setLeftPanelTab}
            onCollapse={() => setSidebarOpen(false)}
            filesSlot={
              <FileTree
                projectId={projectId}
                canEdit={canEdit}
                onSelectFile={handleSelectFile}
                selectedNodeId={selectedFile?.nodeId ?? null}
                presenceByFile={presenceByFile}
                openPathRequest={openPathRequest}
              />
            }
            outlineSlot={
              <OutlineView
                entries={outlineEntries}
                currentLine={currentLine}
                hasDocument={selectedFile !== null && isAsciiDocFile(selectedFile.nodeName)}
                onHeadingClick={handleOutlineHeadingClick}
                effectiveScope={outlineEffectiveScope}
                outlineScope={previewRootPath ? outlineScope : undefined}
                onScopeChange={previewRootPath ? setOutlineScope : undefined}
                outlinePresence={outlinePresence}
              />
            }
            searchSlot={<SearchView projectId={projectId} onNavigate={handleSearchResultNavigate} />}
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
            and never loses editor content/cursor/scroll. */}
        <PanelGroup direction="horizontal" className="flex-1 overflow-hidden">
          <Panel
            id="editor-content"
            order={1}
            defaultSize={showPreview && previewOpen ? 50 : 100}
            minSize={20}
            className="overflow-hidden flex flex-col"
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
              resolvedScope={editorResolvedScope}
              renameRefreshNonce={renameRefreshNonce}
              revealRequest={revealRequest}
              onOpenUrl={handleOpenUrl}
              onChange={handleChange}
              initialLine={initialLine}
              onCursorLineChange={(line) => { setCurrentLine(line); handleCursorLineChange(line); }}
              onOutlineChange={setOutlineEntries}
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
              <PanelResizeHandle className="group relative z-10 -mx-[3px] flex w-[7px] shrink-0 cursor-col-resize items-stretch justify-center outline-none">
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
                  filesVersion={reachableDocVersion}
                  rootFilePath={previewRootPath}
                  openFilePath={previewOpenPath}
                  scrollToLine={scrollRequest}
                  onCollapse={togglePreview}
                  scrollSyncEnabled={scrollSyncEnabled}
                  onToggleScrollSync={() => setScrollSyncEnabled(!scrollSyncEnabled)}
                  previewStyle={previewStyle}
                  onPreviewStyleChange={setPreviewStyle}
                  showIncludedFiles={showIncludedFiles}
                  onOpenInclude={handleNavigateToFile}
                  onShowIncludedFilesChange={setShowIncludedFiles}
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
