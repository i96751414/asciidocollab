'use client';
import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Settings, Users } from 'lucide-react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';
import { ResizeHandle } from '@/components/ui/resize-handle';
import { usePanelResize } from '@/hooks/use-panel-resize';
import { BackButton } from '@/components/back-button';
import { LogoMark } from '@/components/logo';
import { FileTree } from '@/components/file-tree/file-tree';
import { AsciiDocEditor } from '@/components/editor/asciidoc-editor';
import { EditorMainFilePicker } from '@/components/editor/editor-main-file-picker';
import { useProjectSymbolIndex } from '@/hooks/use-project-symbol-index';
import type { ProjectSymbolIndex } from '@/lib/codemirror/asciidoc-symbol-index';
import { AsciiDocPreview, isAsciiDocFile } from '@/components/asciidoc-preview';
import { ImagePreview } from '@/components/image-preview';
import { isImageFile } from '@/lib/codemirror/asciidoc-image-extensions';
import type { ScrollRequest } from '@/hooks/use-asciidoc-preview';
import { useFileSelection } from '@/hooks/use-file-selection';
import { useEditorPreferences } from '@/hooks/use-editor-preferences';
import { useLastSelection } from '@/hooks/use-last-selection';
import { useCollabDocument, type ConnectionState } from '@/hooks/use-collab-document';
import { useProjectPresence } from '@/hooks/use-project-presence';
import { useCurrentUser } from '@/contexts/current-user-context';
import { getDocumentContent } from '@/lib/api/file-content';
import { getCollabDocumentInfo } from '@/lib/api/collab';
import type { CollabAuthRole } from '@asciidocollab/shared';

import type { SelectedFile, FileContentState } from '@/hooks/use-file-selection';
import type { CollabBinding } from '@/components/editor/asciidoc-editor';

interface ContentAreaProperties {
  selectedFile: SelectedFile | null;
  contentState: FileContentState;
  canEdit: boolean;
  projectId: string;
  onScrollLine?: (line: number) => void;
  onLineClick?: (line: number) => void;
  // Ctrl+click on an include/image path — reveals and selects the target file in the tree.
  onNavigateToFile?: (path: string) => void;
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
}

function ContentArea({
  selectedFile,
  contentState,
  canEdit,
  projectId,
  onScrollLine,
  onLineClick,
  onNavigateToFile,
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
      onScrollLine={onScrollLine}
      onLineClick={onLineClick}
      onNavigateToFile={onNavigateToFile}
      onOpenUrl={onOpenUrl}
      onChange={onChange}
      initialLine={initialLine}
      onCursorLineChange={onCursorLineChange}
      collab={collab}
      connectionState={connectionState}
      collabUnavailable={collabUnavailable}
      getProjectIndex={getProjectIndex}
    />
  );
}

interface ProjectEditorLayoutProperties {
  projectId: string;
  projectName: string;
  projectDescription: string | null;
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
  mainFileNodeId,
  canManage,
  canEdit,
  userId,
}: ProjectEditorLayoutProperties) {
  // Live main-file selection (US8); updates when the picker persists a change so the
  // cross-file symbol index (T059) and heading-level offset (T066) re-evaluate.
  const [mainFile, setMainFile] = useState<string | null>(mainFileNodeId);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sidebarResize = usePanelResize({
    initialWidth: 256, min: 160, max: 480, side: 'start', storageKey: 'asciidoc-filetree-width',
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [scrollRequest, setScrollRequest] = useState<ScrollRequest | null>(null);
  // Track the last line scrolled via scroll-sync to deduplicate rapid fire events.
  const lastScrolledLine = useRef<number | null>(null);
  // Track live editor content so the preview reflects what the user is typing.
  const [liveContent, setLiveContent] = useState('');
  // True once the user has typed in the current file — prevents server updates from
  // overwriting in-progress edits.
  const userHasEditedReference = useRef(false);
  const { selectedFile, contentState, selectFile, clearSelection } = useFileSelection(projectId);

  // Cross-file symbol index (US8): rooted at the configured main file, or the open file when
  // none is set (FR-047). Powers cross-file diagnostics + completion; refreshes when the main
  // file changes (FR-045a) and overlays the open file's live content (FR-048).
  const { getIndex: getProjectIndex } = useProjectSymbolIndex({
    projectId,
    rootFileId: mainFile ?? selectedFile?.nodeId ?? null,
    openFileId: selectedFile?.nodeId ?? null,
    liveContent,
  });

  // Collaboration binding for the selected file. `contentState.collab` is set by useFileSelection
  // on the collab path (a backing collaborative document); otherwise this hook stays inert.
  const currentUser = useCurrentUser();
  const collabInfo = contentState.collab;
  const { doc, awareness, connectionState } = useCollabDocument({
    projectId,
    yjsStateId: collabInfo?.yjsStateId ?? '',
    enabled: collabInfo != null,
    user: { userId: currentUser.userId, name: currentUser.displayName },
  });

  // Feature 024: project-wide open-file presence for the file tree. Joins a lightweight presence
  // room to publish which file this user has open and observe which files others have open.
  const presenceByFile = useProjectPresence({
    projectId,
    enabled: true,
    user: { userId: currentUser.userId, name: currentUser.displayName },
    // "Open" means a collaborative document is open in the editor — gate on collabInfo so a selected
    // folder (or a legacy/non-collab file) is never advertised as the viewer's open file.
    openFileNodeId: collabInfo ? (selectedFile?.nodeId ?? null) : null,
  });

  // Mid-session role enforcement (FR-012 / edge case "permission change mid-session"): the role
  // is re-checked on reconnect, so a user demoted to viewer flips to read-only without a reload.
  const [liveRole, setLiveRole] = useState<CollabAuthRole | null>(null);
  useEffect(() => {
    setLiveRole(collabInfo?.role ?? null);
  }, [collabInfo?.yjsStateId, collabInfo?.role]);
  const previousConnectionReference = useRef<ConnectionState>(connectionState);
  useEffect(() => {
    const previous = previousConnectionReference.current;
    previousConnectionReference.current = connectionState;
    if (collabInfo && selectedFile && previous === 'reconnecting' && connectionState === 'synced') {
      getCollabDocumentInfo(projectId, selectedFile.nodeId)
        .then((info) => { if (info) setLiveRole(info.role); })
        .catch(() => { /* keep the current role; the server still rejects observer writes */ });
    }
  }, [connectionState, collabInfo, selectedFile?.nodeId, projectId]);
  const effectiveRole: CollabAuthRole = liveRole ?? collabInfo?.role ?? 'editor';

  const collabBinding: CollabBinding | null =
    collabInfo && doc && awareness
      ? { doc, awareness, connectionState, role: effectiveRole, yjsStateId: collabInfo.yjsStateId }
      : null;
  // Collaborative file whose provider/Y.Doc has not been created yet — show a placeholder
  // rather than briefly mounting the legacy REST editor.
  const collabPending = collabInfo != null && collabBinding == null;

  // Offline fallback (FR-013): the collab server never synced within the timeout. Drop the
  // (empty) Yjs binding and open the file read-only, seeded from GET /content, with a banner —
  // no edits are accepted, so nothing is silently lost.
  const offline = collabInfo != null && connectionState === 'offline';
  const [offlineContent, setOfflineContent] = useState<string | null>(null);
  useEffect(() => {
    if (!offline || !selectedFile) {
      setOfflineContent(null);
      return;
    }
    let cancelled = false;
    getDocumentContent(projectId, selectedFile.nodeId)
      .then((text) => { if (!cancelled) setOfflineContent(text); })
      .catch(() => { if (!cancelled) setOfflineContent(''); });
    return () => { cancelled = true; };
  }, [offline, selectedFile?.nodeId, projectId]);

  // A text document with no collaborative backing (GET /collab 404) must open read-only — never
  // the legacy editable REST path, whose uncoordinated PUTs let clients overwrite each other.
  const collabUnavailable = contentState.collabUnavailable;

  // Editor props derived from the collaboration mode (research D6 / EditorMode).
  const editorCollab = offline ? null : collabBinding;
  const editorCanEdit = offline || collabUnavailable ? false : canEdit;
  const editorContentOverride = offline ? offlineContent : undefined;
  const editorConnectionState = collabInfo ? connectionState : undefined;
  const editorPending = collabPending || (offline && offlineContent === null);

  const { scrollSyncEnabled, setScrollSyncEnabled, previewStyle, setPreviewStyle } = useEditorPreferences();
  const { readLastSelection, rememberFile, rememberLine, clearLastSelection } = useLastSelection(userId, projectId);
  // The line to restore, paired with the file it belongs to. Applied only to that file's first
  // (restore) mount; cleared once the user navigates so in-session clicks never re-jump (Decision 4).
  const [restoredLine, setRestoredLine] = useState<{ nodeId: string; line: number } | null>(null);
  const lineDebounceReference = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist the file on every selection, then delegate to useFileSelection. Folders are
  // ignored by rememberFile, so only content files are remembered. A user-initiated selection
  // also ends the restore window, so the remembered line is never re-applied mid-session.
  const handleSelectFile = useCallback(
    (nodeId: string, nodeName: string, nodePath: string, nodeType: 'file' | 'folder') => {
      setRestoredLine(null);
      rememberFile({ nodeId, nodeName, nodeType, path: nodePath });
      selectFile(nodeId, nodeName, nodePath, nodeType);
    },
    [rememberFile, selectFile],
  );

  // Debounced cursor-line persistence — AsciiDoc files only (FR-006).
  const handleCursorLineChange = useCallback((line: number) => {
    if (!selectedFile || !isAsciiDocFile(selectedFile.nodeName)) return;
    if (lineDebounceReference.current) clearTimeout(lineDebounceReference.current);
    lineDebounceReference.current = setTimeout(() => { rememberLine(line); }, 500);
  }, [selectedFile, rememberLine]);

  // Cancel any pending line-persistence debounce when the open file changes (or on unmount), so a
  // stale timer from the previous file never merges its line into the newly-selected file's entry.
  useEffect(() => () => { if (lineDebounceReference.current) clearTimeout(lineDebounceReference.current); }, [selectedFile?.nodeId]);

  // Restore the last opened file (and its cursor line) on mount. Synchronous localStorage read —
  // never blocks first paint (FR-010); a no-op when nothing is stored.
  //
  // The empty dependency array already runs this once per real mount. We deliberately do NOT gate
  // it behind a persistent ref: under React StrictMode (and any mount→unmount→remount cycle), the
  // unmount aborts the first content fetch via useFileSelection's cleanup; a persistent guard would
  // then suppress the re-fetch on remount, leaving the editor stuck on "Loading…" forever. Letting
  // the effect re-run re-issues the fetch (the superseded request resolves to a harmless AbortError).
  useEffect(() => {
    const stored = readLastSelection();
    if (!stored) return;
    if (stored.line !== undefined) setRestoredLine({ nodeId: stored.nodeId, line: stored.line });
    selectFile(stored.nodeId, stored.nodeName, stored.path, stored.nodeType);
  }, []);

  // Apply the restored line only to the restored file (matched by id); undefined otherwise.
  const initialLine = restoredLine && selectedFile?.nodeId === restoredLine.nodeId
    ? restoredLine.line
    : undefined;

  // The selected file is gone (content fetch 404). Clear the stale memory so it is not retried,
  // and reset to the no-file state — no error is shown (FR-009 / US3).
  useEffect(() => {
    if (!contentState.notFound) return;
    clearLastSelection();
    clearSelection();
  }, [contentState.notFound, clearLastSelection, clearSelection]);

  // Scroll-sync handler: dedup identical consecutive lines to avoid jitter.
  const handleScrollLine = useCallback((line: number) => {
    if (lastScrolledLine.current === line) return;
    lastScrolledLine.current = line;
    setScrollRequest({ line });
  }, []);

  // Line-click handler: always fires, even for the same line clicked twice.
  // No dedup — the user intentionally clicked, so we always issue a fresh scroll.
  const handleLineClick = useCallback((line: number) => {
    setScrollRequest({ line });
  }, []);

  const handleChange = useCallback((value: string) => {
    userHasEditedReference.current = true;
    setLiveContent(value);
  }, []);

  // When switching to a different file, reset edit tracking and load initial content.
  useEffect(() => {
    userHasEditedReference.current = false;
    setLiveContent(contentState.content ?? '');
  }, [selectedFile?.nodeId]);

  // Apply server-pushed content updates only while the user hasn't typed anything.
  useEffect(() => {
    if (!userHasEditedReference.current) {
      setLiveContent(contentState.content ?? '');
    }
  }, [contentState.content]);

  // Reset scroll position whenever a different file is opened.
  // useLayoutEffect prevents a one-frame flash of the old scroll position.
  useLayoutEffect(() => {
    setScrollRequest(null);
    lastScrolledLine.current = null;
  }, [selectedFile?.nodeId]);

  useEffect(() => {
    const stored = sessionStorage.getItem('asciidoc-preview-open');
    if (stored === 'true') setPreviewOpen(true);
  }, []);

  const togglePreview = () => {
    setPreviewOpen((previous) => {
      const next = !previous;
      sessionStorage.setItem('asciidoc-preview-open', String(next));
      return next;
    });
  };

  // Ctrl+click on a macro path asks the file tree to reveal + select that file. A bumped nonce
  // makes each request distinct so repeat clicks on the same path re-fire.
  const [openPathRequest, setOpenPathRequest] = useState<{ path: string; nonce: number } | null>(null);
  const openPathNonce = useRef(0);
  const handleNavigateToFile = useCallback((path: string) => {
    openPathNonce.current += 1;
    setOpenPathRequest({ path, nonce: openPathNonce.current });
  }, []);
  const handleOpenUrl = useCallback((url: string) => {
    globalThis.open(url, '_blank', 'noopener,noreferrer');
  }, []);

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
          <EditorMainFilePicker
            projectId={projectId}
            canEdit={canEdit}
            currentMainFileNodeId={mainFile}
            onChange={setMainFile}
          />
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
              onScrollLine={previewOpen && scrollSyncEnabled ? handleScrollLine : undefined}
              onLineClick={previewOpen ? handleLineClick : undefined}
              onNavigateToFile={handleNavigateToFile}
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
    </div>
  );
}
