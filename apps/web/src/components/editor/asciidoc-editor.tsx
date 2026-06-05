'use client';
import React from 'react';
import { useState, useCallback } from 'react';
import { useAutoSave } from '@/hooks/use-auto-save';
import { useEditorPreferences } from '@/hooks/use-editor-preferences';
import { useIncludeCompletions } from '@/hooks/use-include-completions';
import { useEditorMount } from '@/hooks/use-editor-mount';
import { OFFLINE_QUEUE_KEY_PREFIX } from '@/lib/editor-config';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';
import { EditorBanners } from './editor-banners';
import { EditorStatusBar } from './editor-status-bar';
import { EditorToolbar } from './editor-toolbar';
import { EditorSectionOutline } from './editor-section-outline';
import { EditorSettingsPanel } from './editor-settings-panel';

interface AsciiDocEditorProperties {
  content: string;
  canEdit: boolean;
  projectId?: string;
  fileNodeId?: string;
  /** ETag from the initial GET /content response — seeds external-change polling
   *  so it works from first load without requiring a save first. */
  initialEtag?: string | null;
  onChange?: (value: string) => void;
  onNavigateToFile?: (path: string) => void;
  onOpenUrl?: (url: string) => void;
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
  onChange,
  onNavigateToFile,
  onOpenUrl,
}: AsciiDocEditorProperties) {
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1, totalLines: 1 });
  const [outlineEntries, setOutlineEntries] = useState<SectionOutlineEntry[]>([]);
  const [externalChangeBanner, setExternalChangeBanner] = useState(false);
  const [draftContent, setDraftContent] = useState<string | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { fontSize, theme, setFontSize, setTheme } = useEditorPreferences();
  const includePaths = useIncludeCompletions(projectId ?? '');

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

  const { containerReference, viewReference, handleHeadingClick } = useEditorMount({
    content,
    canEdit,
    includePaths,
    onDocChange: handleChange,
    onCursorChange: setCursorPos,
    onOutlineChange: setOutlineEntries,
    onNavigateToFile,
    onOpenUrl,
  });

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
      {canEdit && <EditorToolbar view={viewReference.current} />}
      <EditorBanners
        externalChange={externalChangeBanner}
        draftContent={draftContent}
        onDismissExternalChange={() => setExternalChangeBanner(false)}
        onRestoreDraft={restoreDraft}
        onDiscardDraft={discardDraft}
      />
      <div className="flex flex-1 overflow-hidden">
        <div ref={containerReference} className="flex-1 overflow-auto" />
        {outlineOpen && (
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
        {!outlineOpen && (
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
      <div className="flex items-center border-t">
        {(projectId && fileNodeId) ? (
          <div className="flex-1">
            <EditorStatusBar
              line={cursorPos.line}
              col={cursorPos.col}
              totalLines={cursorPos.totalLines}
              saveState={saveState}
              onRetry={handleRetry}
            />
          </div>
        ) : <div className="flex-1" />}
        <button
          type="button"
          aria-label="Editor settings"
          className="px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setSettingsOpen((previous) => !previous)}
        >
          ⚙
        </button>
      </div>
      {settingsOpen && (
        <div className="border-t bg-background shadow-lg">
          <EditorSettingsPanel
            fontSize={fontSize}
            theme={theme}
            setFontSize={setFontSize}
            setTheme={setTheme}
          />
        </div>
      )}
    </div>
  );
}
