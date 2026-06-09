'use client';
import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Settings, Users } from 'lucide-react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/back-button';
import { LogoMark } from '@/components/logo';
import { FileTree } from '@/components/file-tree/file-tree';
import { AsciiDocEditor } from '@/components/editor/asciidoc-editor';
import { AsciiDocPreview, isAsciiDocFile } from '@/components/asciidoc-preview';
import { ImagePreview } from '@/components/image-preview';
import { isImageFile } from '@/lib/codemirror/asciidoc-image-extensions';
import type { ScrollRequest } from '@/hooks/use-asciidoc-preview';
import { useFileSelection } from '@/hooks/use-file-selection';
import { useEditorPreferences } from '@/hooks/use-editor-preferences';
import { useLastSelection } from '@/hooks/use-last-selection';
import { useCollabDocument, type ConnectionState } from '@/hooks/use-collab-document';
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
}

function ContentArea({
  selectedFile,
  contentState,
  canEdit,
  projectId,
  onScrollLine,
  onLineClick,
  onChange,
  initialLine,
  onCursorLineChange,
  collab,
  collabPending,
  connectionState,
  contentOverride,
  collabUnavailable,
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
      onChange={onChange}
      initialLine={initialLine}
      onCursorLineChange={onCursorLineChange}
      collab={collab}
      connectionState={connectionState}
      collabUnavailable={collabUnavailable}
    />
  );
}

interface ProjectEditorLayoutProperties {
  projectId: string;
  projectName: string;
  projectDescription: string | null;
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
  canManage,
  canEdit,
  userId,
}: ProjectEditorLayoutProperties) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
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

  const { scrollSyncEnabled, setScrollSyncEnabled } = useEditorPreferences();
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
        <div className="ml-auto flex items-center gap-1">
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
        {/* File tree panel */}
        <div
          data-testid="file-tree-panel"
          className={sidebarOpen ? 'w-64 shrink-0 border-r overflow-y-auto' : 'hidden'}
        >
          <FileTree
            projectId={projectId}
            canEdit={canEdit}
            onSelectFile={handleSelectFile}
            selectedNodeId={selectedFile?.nodeId ?? null}
            onCollapse={() => setSidebarOpen(false)}
          />
        </div>

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

        {/* Editor + Preview panels — resizable when preview is open */}
        {showPreview && previewOpen ? (
          <PanelGroup direction="horizontal" className="flex-1 overflow-hidden">
            <Panel defaultSize={50} minSize={20} className="overflow-hidden flex flex-col p-4" data-testid="content-panel">
              <ContentArea
                selectedFile={selectedFile}
                contentState={contentState}
                canEdit={editorCanEdit}
                projectId={projectId}
                onScrollLine={scrollSyncEnabled ? handleScrollLine : undefined}
                onLineClick={handleLineClick}
                onChange={handleChange}
                initialLine={initialLine}
                onCursorLineChange={handleCursorLineChange}
                collab={editorCollab}
                collabPending={editorPending}
                connectionState={editorConnectionState}
                contentOverride={editorContentOverride}
                collabUnavailable={collabUnavailable}
              />
            </Panel>
            <PanelResizeHandle className="w-1 bg-border hover:bg-primary/40 transition-colors cursor-col-resize" />
            <Panel defaultSize={50} minSize={20} className="overflow-hidden border-l" data-testid="preview-panel">
              <AsciiDocPreview
                key={selectedFile?.nodeId}
                content={liveContent}
                isEnabled={previewOpen}
                scrollToLine={scrollRequest}
                onCollapse={togglePreview}
                scrollSyncEnabled={scrollSyncEnabled}
                onToggleScrollSync={() => setScrollSyncEnabled(!scrollSyncEnabled)}
              />
            </Panel>
          </PanelGroup>
        ) : (
          <>
            <div data-testid="content-panel" className="flex-1 overflow-hidden flex flex-col p-4">
              <ContentArea
                selectedFile={selectedFile}
                contentState={contentState}
                canEdit={editorCanEdit}
                projectId={projectId}
                onChange={handleChange}
                initialLine={initialLine}
                onCursorLineChange={handleCursorLineChange}
                collab={editorCollab}
                collabPending={editorPending}
                connectionState={editorConnectionState}
                contentOverride={editorContentOverride}
                collabUnavailable={collabUnavailable}
              />
            </div>
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
          </>
        )}
      </div>
    </div>
  );
}
