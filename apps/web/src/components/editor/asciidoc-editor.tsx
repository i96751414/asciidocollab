'use client';
import './editor-themes.css';
import React from 'react';
import { useState, useCallback } from 'react';
import { useAutoSave } from '@/hooks/use-auto-save';
import { useEditorPreferences } from '@/hooks/use-editor-preferences';
import { useIncludeCompletions, useImagePaths } from '@/hooks/use-include-completions';
import { useEditorMount } from '@/hooks/use-editor-mount';
import { useTableContext } from '@/hooks/use-table-context';
import { OFFLINE_QUEUE_KEY_PREFIX } from '@/lib/editor-config';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';
import { EditorBanners } from './editor-banners';
import { EditorStatusBar } from './editor-status-bar';
import { EditorToolbar } from './editor-toolbar';
import { EditorTableContextToolbar } from './editor-table-context-toolbar';
import { EditorSectionOutline } from './editor-section-outline';

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
  onChange?: (value: string) => void;
  onNavigateToFile?: (path: string) => void;
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
   * Called (the caller debounces) with the 1-based cursor line as it changes, so the position
   * can be persisted for restore.
   *
   * @param line - The 1-based line the cursor is on.
   */
  onCursorLineChange?: (line: number) => void;
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
  onChange,
  onNavigateToFile,
  onOpenUrl,
  onLineClick,
  onScrollLine,
  initialLine,
  onCursorLineChange,
}: AsciiDocEditorProperties) {
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1, totalLines: 1 });
  const [outlineEntries, setOutlineEntries] = useState<SectionOutlineEntry[]>([]);
  const [externalChangeBanner, setExternalChangeBanner] = useState(false);
  const [draftContent, setDraftContent] = useState<string | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(true);

  const { fontSize, theme, softWrap: prefsSoftWrap, setFontSize, setTheme } = useEditorPreferences();
  const softWrap = softWrapProperty === undefined ? prefsSoftWrap : softWrapProperty;
  const includePaths = useIncludeCompletions(projectId ?? '');
  const imagePaths = useImagePaths(includePaths);

  const handleExternalChange = useCallback(() => setExternalChangeBanner(true), []);
  const handleDraftRecovered = useCallback((draft: string) => setDraftContent(draft), []);

  const { saveState, save } = useAutoSave({
    projectId: projectId ?? '',
    fileNodeId: fileNodeId ?? '',
    initialEtag: initialEtag ?? undefined,
    onExternalChange: handleExternalChange,
    onDraftRecovered: handleDraftRecovered,
  });

  const handleChange = useCallback((value: string) => {
    if (projectId && fileNodeId) save(value);
    onChange?.(value);
  }, [projectId, fileNodeId, save, onChange]);

  // Track cursor position for the status bar and report the line up for persistence.
  const handleCursorChange = useCallback((pos: { line: number; col: number; totalLines: number }) => {
    setCursorPos(pos);
    onCursorLineChange?.(pos.line);
  }, [onCursorLineChange]);

  const { containerReference, viewReference, handleHeadingClick } = useEditorMount({
    content,
    canEdit,
    softWrap,
    includePaths,
    imagePaths,
    onDocChange: handleChange,
    onCursorChange: handleCursorChange,
    onOutlineChange: setOutlineEntries,
    onNavigateToFile,
    onOpenUrl,
    onLineClick,
    onScrollLine,
    initialLine,
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
      {isAsciiDoc && (
        <EditorToolbar
          view={viewReference.current}
          canEdit={canEdit}
          fontSize={fontSize}
          theme={theme}
          setFontSize={setFontSize}
          setTheme={setTheme}
        />
      )}
      {isAsciiDoc && canEdit && tableContext !== null && viewReference.current !== null && (
        <EditorTableContextToolbar
          view={viewReference.current}
          context={tableContext}
          tableText={viewReference.current.state.doc.sliceString(tableContext.tableFrom, tableContext.tableTo)}
          tableFrom={tableContext.tableFrom}
        />
      )}
      <EditorBanners
        externalChange={externalChangeBanner}
        draftContent={draftContent}
        onDismissExternalChange={() => setExternalChangeBanner(false)}
        onRestoreDraft={restoreDraft}
        onDiscardDraft={discardDraft}
      />
      <div className="flex flex-1 overflow-hidden">
        <div ref={containerReference} className="flex-1 overflow-auto" />
        {isAsciiDoc && outlineOpen && (
          <div className="w-52 shrink-0 border-l overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-2 py-1 border-b text-xs text-muted-foreground">
              <span>Outline</span>
              <button
                type="button"
                aria-label="Collapse outline panel"
                className="hover:text-foreground"
                onClick={() => setOutlineOpen(false)}
              >
                ×
              </button>
            </div>
            <EditorSectionOutline
              entries={outlineEntries}
              onHeadingClick={handleHeadingClick}
            />
          </div>
        )}
        {isAsciiDoc && !outlineOpen && (
          <button
            type="button"
            aria-label="Expand outline panel"
            className="w-5 shrink-0 border-l flex items-center justify-center text-muted-foreground hover:text-foreground text-xs"
            onClick={() => setOutlineOpen(true)}
          >
            ≡
          </button>
        )}
      </div>
      {(projectId && fileNodeId) && (
        <div className="border-t">
          <EditorStatusBar
            line={cursorPos.line}
            col={cursorPos.col}
            totalLines={cursorPos.totalLines}
            saveState={saveState}
            onRetry={handleRetry}
          />
        </div>
      )}
    </div>
  );
}
