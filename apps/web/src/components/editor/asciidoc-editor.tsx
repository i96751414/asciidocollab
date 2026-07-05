'use client';
import './editor-themes.css';
import React from 'react';
import { useState, useCallback, useMemo, useRef } from 'react';
import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import type { CollabAuthRole } from '@asciidocollab/shared';
import type { ConnectionState } from '@/hooks/use-collab-document';
import { collabExtensions } from './editor-collab-extensions';
import { renameSuggestion } from '@/lib/codemirror/rename-suggestion/rename-suggestion-state';
import { findSymbolUsages, renameSymbol } from '@/lib/api/projects';
import { useAutoSave } from '@/hooks/use-auto-save';
import { useEditorPreferences } from '@/hooks/use-editor-preferences';
import { useIncludeCompletions, useImagePaths } from '@/hooks/use-include-completions';
import { useEditorMount } from '@/hooks/use-editor-mount';
import { useTableContext } from '@/hooks/use-table-context';
import { OFFLINE_QUEUE_KEY_PREFIX } from '@/lib/editor-config';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';
import type { ProjectSymbolIndex } from '@/lib/codemirror/asciidoc-symbol-index';
import type { XrefTarget } from '@/lib/codemirror/asciidoc-link-handler';
import type { CursorSymbol } from '@/lib/codemirror/asciidoc-symbol-at-cursor';
import { EditorBanners } from './editor-banners';
import { EditorStatusBar } from './editor-status-bar';
import { computeMetrics } from '@/lib/codemirror/asciidoc-metrics';
import { EditorChrome } from './editor-chrome';

interface AsciiDocEditorProperties {
  content: string;
  canEdit: boolean;
  projectId?: string;
  fileNodeId?: string;
  /**
   * ETag from the initial GET /content response — seeds external-change polling
   *  so it works from first load without requiring a save first.
   */
  initialEtag?: string | null;
  /** When false, hides the AsciiDoc toolbar and outline panel (e.g. For plain-text files). */
  isAsciiDoc?: boolean;
  /** When true (default), enables line wrapping in the editor. */
  softWrap?: boolean;
  /**
   * Project document language (ISO 639-1) driving the spellchecker, or null when the project has
   * none configured (the editor then falls back to its default). Spellcheck language is a
   * project-level setting; whether spellcheck runs at all stays a per-user preference.
   */
  spellcheckLanguage?: string | null;
  // Live accessor for the cross-file symbol index; powers cross-file diagnostics + completion.
  getProjectIndex?: () => ProjectSymbolIndex | null;
  onChange?: (value: string) => void;
  onNavigateToFile?: (path: string) => void;
  // Navigate to a cross-reference definition resolved via the project symbol index.
  onNavigateToXref?: (target: XrefTarget) => void;
  /** Include-path level offset inherited by the open file from its ancestors. */
  inheritedOffset?: number;
  /** Attributes the open file inherits from the documents that include it. */
  inheritedAttributes?: ReadonlyMap<string, string>;
  /** The open file's resolved cross-document attribute scope (inherited + own), for `{name}` known highlighting. */
  resolvedScope?: ReadonlyMap<string, string>;
  /** Bumped when a collaborator changes any project file, so a visible rename offer re-queries its counts (FR-010). */
  renameRefreshNonce?: number;
  /** Live request to reveal a line in the open editor (same-file go-to-definition). */
  revealRequest?: { line: number; nonce: number } | null;
  onOpenUrl?: (url: string) => void;
  onLineClick?: (line: number) => void;
  /**
   * Called with the top visible 1-based line number as the editor is scrolled.
   *
   * @param line - The 1-based line number at the top of the visible viewport.
   */
  onScrollLine?: (line: number) => void;
  /** 1-based line to place the cursor on when this editor instance mounts (selection restore). */
  initialLine?: number;
  /**
   * Collaboration binding. When present the editor enters collab mode: it binds to the shared
   * Y.Doc (empty initial doc, populated by sync), and the REST autosave/poll/draft/keepalive
   * machinery is disabled — the collaboration server owns persistence. Absent for the
   * legacy REST path (binary assets, non-collaborative files, offline fallback).
   */
  collab?: CollabBinding | null;
  /**
   * Collaboration connection state for the status banner. Passed independently of
   * `collab` so the offline read-only fallback (no binding) can still show the offline banner.
   */
  connectionState?: ConnectionState;
  /**
   * Called (the caller debounces) with the 1-based cursor line as it changes, so the position
   * can be persisted for restore.
   *
   * @param line - The 1-based line the cursor is on.
   */
  onCursorLineChange?: (line: number) => void;
  /**
   * Reports the live section outline up to the layout so it can drive the left-panel Outline view
   * (028). Fires on every doc edit / out-of-band heading refresh with the full entry list.
   *
   * @param entries - The current section outline entries, including the level-0 title.
   */
  onOutlineChange?: (entries: SectionOutlineEntry[]) => void;
  /**
   * True when this is editable text with no collaborative document (GET /collab 404). The editor
   * opens read-only with a banner and the REST autosave stays disabled — silently writing through
   * the legacy path would let two clients overwrite each other (no Yjs merge, no session lock).
   */
  collabUnavailable?: boolean;
  /** Opens the Go to Symbol palette from the toolbar. */
  onGoToSymbol?: () => void;
  // Opens the refactor dialog from the toolbar, seeded with the symbol under the cursor.
  onRefactor?: (initial: CursorSymbol | null) => void;
}

/** Live collaboration binding passed to the editor when a file is a collaborative document. */
export interface CollabBinding {
  /** Shared Y.Doc owned by useCollabDocument. */
  doc: Y.Doc;
  /** Provider awareness for remote cursors/presence. */
  awareness: Awareness;
  /** Current connection lifecycle state (drives read-only/banners). */
  connectionState: ConnectionState;
  /** The user's collaboration role for this document. */
  role: CollabAuthRole;
  /** Yjs state id — used as the editor remount key on room switch. */
  yjsStateId: string;
}

type EditorCssVariables = { '--editor-font-size': string } & React.CSSProperties;

function editorStyle(fontSize: number): EditorCssVariables {
  return { '--editor-font-size': `${fontSize}px` };
}

/** CodeMirror 6 AsciiDoc editor — composes the mount hook, auto-save, preferences, and chrome. */
export function AsciiDocEditor({
  content,
  canEdit,
  projectId,
  fileNodeId,
  initialEtag,
  isAsciiDoc = true,
  softWrap: softWrapProperty,
  spellcheckLanguage,
  getProjectIndex,
  onChange,
  onNavigateToFile,
  onNavigateToXref,
  inheritedOffset,
  inheritedAttributes,
  resolvedScope,
  renameRefreshNonce,
  revealRequest,
  onOpenUrl,
  onLineClick,
  onScrollLine,
  initialLine,
  onCursorLineChange,
  onOutlineChange,
  collab,
  connectionState,
  collabUnavailable = false,
  onGoToSymbol,
  onRefactor,
}: AsciiDocEditorProperties) {
  // The file is on the collab path whenever a binding is present OR a connection state is set —
  // the latter covers the offline read-only fallback, where the binding is dropped but the file
  // is still collaborative and must NOT re-enable the REST autosave machinery.
  // `collabUnavailable` (text doc with no collab document) also disables autosave: that file is
  // opened read-only, and the legacy clobbering PUT path must never run for it.
  const onCollabPath = collab != null || connectionState != null || collabUnavailable;
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1, totalLines: 1 });
  // Live word count / reading time for the status bar. Seeded from the
  // initial content and refreshed from each editor change.
  const [docText, setDocText] = useState(content);
  const metrics = useMemo(() => computeMetrics(docText), [docText]);
  const [externalChangeBanner, setExternalChangeBanner] = useState(false);
  const [draftContent, setDraftContent] = useState<string | null>(null);

  const { fontSize, theme, softWrap: prefsSoftWrap, spellIgnore, spellcheckEnabled, setFontSize, setTheme, setSoftWrap } = useEditorPreferences();
  const softWrap = softWrapProperty === undefined ? prefsSoftWrap : softWrapProperty;
  // Spellcheck language comes from the project; fall back to English when the project leaves it unset.
  const effectiveSpellcheckLanguage = spellcheckLanguage ?? 'en';
  const includePaths = useIncludeCompletions(projectId ?? '');
  const imagePaths = useImagePaths(includePaths);

  const handleExternalChange = useCallback(() => setExternalChangeBanner(true), []);
  const handleDraftRecovered = useCallback((draft: string) => setDraftContent(draft), []);

  const { saveState, save } = useAutoSave({
    projectId: projectId ?? '',
    fileNodeId: fileNodeId ?? '',
    initialEtag: initialEtag ?? undefined,
    // Collab path: the collaboration server owns persistence — disable autosave/poll/draft.
    enabled: !onCollabPath,
    onExternalChange: handleExternalChange,
    onDraftRecovered: handleDraftRecovered,
  });

  // yCollab binding for the collab path; memoized on the doc/awareness identity so it is rebuilt
  // only when the room changes (the editor remounts via remountKey at the same time).
  const collabExtension = useMemo(
    () => (collab ? collabExtensions(collab.doc, collab.awareness) : undefined),
    [collab?.doc, collab?.awareness],
  );

  // Observers get a read-only editor that still renders live remote edits. A text doc with
  // no collaborative backing is also forced read-only so it can never be edited via legacy autosave.
  const effectiveCanEdit = collab?.role === 'observer' || collabUnavailable ? false : canEdit;

  // In-editor symbol rename-suggestion (feature 033). Built once with ref-based getters so it never
  // forces a remount; the getters always read the current project/file. Detection only fires while
  // editing a definition, so read-only viewers never see it.
  const projectIdReference = useRef(projectId);
  projectIdReference.current = projectId;
  const fileNodeIdReference = useRef(fileNodeId);
  fileNodeIdReference.current = fileNodeId;
  const canEditReference = useRef(effectiveCanEdit);
  canEditReference.current = effectiveCanEdit;
  const renameSuggestionExtension = useMemo(
    () =>
      renameSuggestion({
        getProjectId: () => projectIdReference.current,
        getFileNodeId: () => fileNodeIdReference.current,
        getCanEdit: () => canEditReference.current,
        findSymbolUsages,
        renameSymbol,
      }),
    [],
  );

  const handleChange = useCallback((value: string) => {
    setDocText(value);
    if (projectId && fileNodeId) save(value);
    onChange?.(value);
  }, [projectId, fileNodeId, save, onChange]);

  // Track cursor position for the status bar and report the line up for persistence.
  const handleCursorChange = useCallback((pos: { line: number; col: number; totalLines: number }) => {
    setCursorPos(pos);
    onCursorLineChange?.(pos.line);
  }, [onCursorLineChange]);

  // Lift the live outline to the layout (028); the outline now lives in the left panel, not here.
  const handleOutlineChange = useCallback((entries: SectionOutlineEntry[]) => {
    onOutlineChange?.(entries);
  }, [onOutlineChange]);

  const { containerReference, viewReference } = useEditorMount({
    content,
    canEdit: effectiveCanEdit,
    softWrap,
    foldStorageKey: projectId && fileNodeId ? `asciidocollab:folds:${projectId}:${fileNodeId}` : undefined,
    spellIgnore,
    spellcheckLanguage: effectiveSpellcheckLanguage,
    spellcheckEnabled,
    includePaths,
    imagePaths,
    onDocChange: handleChange,
    onCursorChange: handleCursorChange,
    onOutlineChange: handleOutlineChange,
    onNavigateToFile,
    onNavigateToXref,
    inheritedOffset,
    inheritedAttributes,
    resolvedScope,
    revealRequest,
    onOpenUrl,
    onLineClick,
    onScrollLine,
    initialLine,
    getProjectIndex,
    collabExtension,
    renameSuggestionExtension,
    renameRefreshNonce,
    remountKey: collab?.yjsStateId,
  });

  const tableContext = useTableContext(viewReference.current);

  function handleRetry() {
    const currentContent = viewReference.current?.state.doc.toString() ?? '';
    if (projectId && fileNodeId) save(currentContent);
  }

  function restoreDraft() {
    if (!draftContent || !viewReference.current) return;
    viewReference.current.dispatch({
      changes: { from: 0, to: viewReference.current.state.doc.length, insert: draftContent },
    });
    if (projectId && fileNodeId) save(draftContent);
    setDraftContent(null);
  }

  function discardDraft() {
    if (fileNodeId) localStorage.removeItem(OFFLINE_QUEUE_KEY_PREFIX + fileNodeId);
    setDraftContent(null);
  }

  return (
    <div
      className="asciidoc-editor flex flex-col h-full"
      style={editorStyle(fontSize)}
      data-theme={theme}
    >
      <EditorChrome
        view={viewReference.current}
        isAsciiDoc={isAsciiDoc}
        canEdit={effectiveCanEdit}
        fontSize={fontSize}
        theme={theme}
        softWrap={softWrap}
        setFontSize={setFontSize}
        setTheme={setTheme}
        setSoftWrap={setSoftWrap}
        tableContext={tableContext}
        awareness={collab?.awareness}
        onGoToSymbol={onGoToSymbol}
        onRefactor={onRefactor}
      />
      <EditorBanners
        externalChange={externalChangeBanner}
        draftContent={draftContent}
        onDismissExternalChange={() => setExternalChangeBanner(false)}
        onRestoreDraft={restoreDraft}
        onDiscardDraft={discardDraft}
        connectionState={connectionState ?? collab?.connectionState}
        readOnly={collab?.role === 'observer'}
        collabUnavailable={collabUnavailable}
      />
      <div className="flex flex-1 overflow-hidden">
        <div ref={containerReference} className="flex-1 overflow-auto" />
      </div>
      {(projectId && fileNodeId) && (
        <div className="border-t">
          <EditorStatusBar
            line={cursorPos.line}
            col={cursorPos.col}
            totalLines={cursorPos.totalLines}
            saveState={saveState}
            onRetry={handleRetry}
            wordCount={metrics.words}
            readingTimeMin={metrics.readingTimeMin}
          />
        </div>
      )}
    </div>
  );
}
