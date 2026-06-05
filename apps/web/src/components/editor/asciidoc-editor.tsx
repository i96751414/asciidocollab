'use client';
import React from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { search, searchKeymap } from '@codemirror/search';
import { autocompletion } from '@codemirror/autocomplete';
import { syntaxHighlighting, defaultHighlightStyle, foldGutter } from '@codemirror/language';
import { asciidoc } from '@/lib/codemirror/asciidoc-language';
import { asciidocHighlightStyle } from '@/lib/codemirror/asciidoc-highlight';
import { asciidocFold } from '@/lib/codemirror/asciidoc-fold';
import { useAutoSave } from '@/hooks/use-auto-save';
import { useEditorPreferences } from '@/hooks/use-editor-preferences';
import { useIncludeCompletions } from '@/hooks/use-include-completions';
import { showMinimap } from '@replit/codemirror-minimap';
import {
  attributeCompletionSource,
  xrefCompletionSource,
  createIncludeCompletionSource,
} from '@/lib/codemirror/asciidoc-completions';
import { createLinkHandler } from '@/lib/codemirror/asciidoc-link-handler';
import { outlineField } from '@/lib/codemirror/asciidoc-outline';
import { OFFLINE_QUEUE_KEY_PREFIX } from '@/lib/codemirror/constants';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';
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

/** CodeMirror 6 editor with AsciiDoc syntax highlighting, auto-save, and editor chrome. */
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
  const containerReference = useRef<HTMLDivElement>(null);
  const viewReference = useRef<EditorView | null>(null);
  const readOnlyCompartment = useRef(new Compartment());
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1, totalLines: 1 });
  const [outlineEntries, setOutlineEntries] = useState<SectionOutlineEntry[]>([]);
  const [externalChangeBanner, setExternalChangeBanner] = useState(false);
  const [draftContent, setDraftContent] = useState<string | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { fontSize, theme, setFontSize, setTheme } = useEditorPreferences();
  const includePaths = useIncludeCompletions(projectId ?? '');
  // Keep a ref so the mount-time useEffect always reads the latest includePaths
  // without needing to re-create the EditorView when paths load asynchronously.
  const includePathsReference = useRef<string[]>(includePaths);
  useEffect(() => { includePathsReference.current = includePaths; }, [includePaths]);

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

  // Stable callback so React.memo on EditorSectionOutline can bail out.
  // viewReference is a ref (always same object), so no deps needed.
  const handleHeadingClick = useCallback((entry: { from: number }) => {
    if (viewReference.current) {
      viewReference.current.dispatch({
        selection: { anchor: entry.from },
        scrollIntoView: true,
      });
      viewReference.current.focus();
    }
  }, []);

  useEffect(() => {
    if (!containerReference.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        handleChange(update.state.doc.toString());
        try { setOutlineEntries(update.state.field(outlineField)); } catch { /* field not installed */ }
      }
      const head = update.state.selection.main.head;
      const line = update.state.doc.lineAt(head);
      setCursorPos({
        line: line.number,
        col: head - line.from + 1,
        totalLines: update.state.doc.lines,
      });
    });

    const state = EditorState.create({
      doc: content,
      extensions: [
        asciidoc(),
        syntaxHighlighting(asciidocHighlightStyle),
        syntaxHighlighting(defaultHighlightStyle),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        search({ top: true }),
        readOnlyCompartment.current.of(EditorState.readOnly.of(!canEdit)),
        lineNumbers(),
        highlightActiveLine(),
        asciidocFold,
        foldGutter(),
        outlineField,
        showMinimap.of({ create: () => { const dom = document.createElement('div'); return { dom }; } }),
        autocompletion({
          override: [
            attributeCompletionSource,
            createIncludeCompletionSource(() => includePathsReference.current),
            xrefCompletionSource,
          ],
        }),
        updateListener,
      ],
    });

    const view = new EditorView({ state, parent: containerReference.current });
    viewReference.current = view;
    // Seed outline state from the initial document
    try { setOutlineEntries(view.state.field(outlineField)); } catch { /* field not installed */ }

    const linkHandler = createLinkHandler(
      {
        onNavigateToFile,
        onOpenUrl,
        onUnresolvedPath: (unresolvedPath) => {
          // Non-blocking notification for unresolvable include paths
          globalThis.dispatchEvent(new CustomEvent('editor:unresolved-path', { detail: unresolvedPath }));
        },
      },
      () => includePathsReference.current,
    );
    const mousedownFunction = (event: MouseEvent) => linkHandler.handleMousedown(event, view);
    view.dom.addEventListener('mousedown', mousedownFunction);

    return () => {
      view.dom.removeEventListener('mousedown', mousedownFunction);
      view.destroy();
      viewReference.current = null;
      setOutlineEntries([]);
    };
  }, []);

  // When the content prop changes externally (e.g. after an external-change reload),
  // update the EditorView so the editor shows the new content.
  useEffect(() => {
    if (!viewReference.current) return;
    const currentContent = viewReference.current.state.doc.toString();
    if (currentContent !== content) {
      viewReference.current.dispatch({
        changes: { from: 0, to: currentContent.length, insert: content },
      });
    }
  }, [content]);

  useEffect(() => {
    if (!viewReference.current) return;
    viewReference.current.dispatch({
      effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(!canEdit)),
    });
  }, [canEdit]);

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
    if (fileNodeId) {
      const key = OFFLINE_QUEUE_KEY_PREFIX + fileNodeId;
      localStorage.removeItem(key);
    }
    setDraftContent(null);
  }

  return (
    <div
      className="asciidoc-editor flex flex-col h-full"
      style={editorStyle(fontSize)}
      data-theme={theme}
    >
      {canEdit && <EditorToolbar view={viewReference.current} />}
      {externalChangeBanner && (
        <div role="status" className="px-3 py-1 text-xs bg-yellow-50 border-b border-yellow-200 text-yellow-800 flex items-center gap-2">
          <span>This file was updated externally.</span>
          <button type="button" className="underline" onClick={() => setExternalChangeBanner(false)}>Dismiss</button>
        </div>
      )}
      {draftContent !== null && (
        <div role="status" className="px-3 py-1 text-xs bg-blue-50 border-b border-blue-200 text-blue-800 flex items-center gap-2">
          <span>An unsaved draft was recovered.</span>
          <button type="button" className="underline" onClick={restoreDraft}>Restore</button>
          <button type="button" className="underline" onClick={discardDraft}>Discard</button>
        </div>
      )}
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
