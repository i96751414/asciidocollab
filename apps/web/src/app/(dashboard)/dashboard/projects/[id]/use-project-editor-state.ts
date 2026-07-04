'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePanelResize } from '@/hooks/use-panel-resize';

interface ProjectEditorStateOptions {
  /** Configured main-file node id, or null when unset. */
  mainFileNodeId: string | null;
  /** Node id of the open file, driving the per-file live-content reset. */
  selectedFileNodeId: string | null;
  /** Latest server-loaded content for the open file. */
  content: string | null | undefined;
}

interface ProjectEditorState {
  /** Live main-file selection; updates when the picker persists a change. */
  mainFile: string | null;
  setMainFile: (nodeId: string | null) => void;
  /** File-tree sidebar visibility + its resizable-width controller. */
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  sidebarResize: ReturnType<typeof usePanelResize>;
  /** Preview-panel visibility, restored from / persisted to sessionStorage. */
  previewOpen: boolean;
  togglePreview: () => void;
  /** Live editor content so the preview reflects what the user is typing. */
  liveContent: string;
  /**
   * The open file's live content to OVERLAY onto its cached/persisted copy — i.e. `liveContent` once
   * the open editor has produced content (a sync or an edit), or `null` before then. While null, a
   * consumer should fall back to the cached content rather than treating the file as empty. This is
   * what keeps the full-document outline from dropping the open file's headings during a file switch,
   * when `liveContent` has been reset but the new editor has not yet reported its content.
   */
  liveOverlayContent: string | null;
  // Editor change handler: marks the file edited and tracks the live buffer.
  handleChange: (value: string) => void;
}

/**
 * Layout-shell + live-content state: the main-file selection, sidebar + preview panel visibility,
 * and the live editor buffer that feeds the preview (with the edit-tracking guard that stops
 * server-pushed updates from clobbering in-progress edits).
 */
export function useProjectEditorState({
  mainFileNodeId,
  selectedFileNodeId,
  content,
}: ProjectEditorStateOptions): ProjectEditorState {
  const [mainFile, setMainFile] = useState<string | null>(mainFileNodeId);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sidebarResize = usePanelResize({
    initialWidth: 256, min: 160, max: 480, side: 'start', storageKey: 'asciidoc-filetree-width',
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  // Track live editor content so the preview reflects what the user is typing.
  const [liveContent, setLiveContent] = useState('');
  // True once the user has typed in the current file — prevents server updates from
  // overwriting in-progress edits.
  const userHasEditedReference = useRef(false);
  // The file `liveContent` currently belongs to, used to reset it the moment the selection changes.
  const liveContentFileReference = useRef<string | null>(selectedFileNodeId);

  const handleChange = useCallback((value: string) => {
    userHasEditedReference.current = true;
    setLiveContent(value);
  }, []);

  // Reset edit tracking + live content the instant the open file changes, SYNCHRONOUSLY during render
  // (React's "adjust state during render" pattern) rather than in an effect. An effect lags the change
  // by a render, during which `liveContent` still holds the previous file's text while the selection
  // already points at the new file — so a consumer that overlays `liveContent` onto the open file (the
  // symbol index / assembled outline) momentarily applies the wrong file's content and flickers.
  if (liveContentFileReference.current !== selectedFileNodeId) {
    liveContentFileReference.current = selectedFileNodeId;
    userHasEditedReference.current = false;
    setLiveContent(content ?? '');
  }

  // Apply server-pushed content updates only while the user hasn't typed anything.
  useEffect(() => {
    if (!userHasEditedReference.current) {
      setLiveContent(content ?? '');
    }
  }, [content]);

  useEffect(() => {
    const stored = sessionStorage.getItem('asciidoc-preview-open');
    if (stored === 'true') setPreviewOpen(true);
  }, []);

  const togglePreview = useCallback(() => {
    setPreviewOpen((previous) => {
      const next = !previous;
      sessionStorage.setItem('asciidoc-preview-open', String(next));
      return next;
    });
  }, []);

  return {
    mainFile,
    setMainFile,
    sidebarOpen,
    setSidebarOpen,
    sidebarResize,
    previewOpen,
    togglePreview,
    liveContent,
    // The open file's content to OVERLAY onto its cached copy: the live editor buffer once the user
    // has typed, otherwise the loaded server content (`content`), and `null` only while that content
    // is still loading. Using the loaded content rather than the reset-to-empty buffer prevents the
    // full-document outline from dropping (and re-adding) the open file's headings during a switch,
    // and lets the symbol index serve the open file from this overlay instead of issuing a redundant
    // fetch for it. `content` is reset to null on every file change (useFileSelection), so it is never
    // the previous file's text — the overlay can never apply the wrong file's content.
    liveOverlayContent: userHasEditedReference.current ? liveContent : (content ?? null),
    handleChange,
  };
}
