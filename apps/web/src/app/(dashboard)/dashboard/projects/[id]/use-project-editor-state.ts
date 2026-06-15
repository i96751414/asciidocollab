'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePanelResize } from '@/hooks/use-panel-resize';

interface ProjectEditorStateOptions {
  /** Configured main-file node id (US8/FR-045), or null when unset. */
  mainFileNodeId: string | null;
  /** Node id of the open file, driving the per-file live-content reset. */
  selectedFileNodeId: string | null;
  /** Latest server-loaded content for the open file. */
  content: string | null | undefined;
}

interface ProjectEditorState {
  /** Live main-file selection (US8); updates when the picker persists a change. */
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

  const handleChange = useCallback((value: string) => {
    userHasEditedReference.current = true;
    setLiveContent(value);
  }, []);

  // When switching to a different file, reset edit tracking and load initial content.
  useEffect(() => {
    userHasEditedReference.current = false;
    setLiveContent(content ?? '');
  }, [selectedFileNodeId]);

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
    handleChange,
  };
}
