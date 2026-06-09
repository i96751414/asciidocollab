'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { fileContentUrl } from '@/lib/api/file-content';

/** Represents the currently selected file node in the editor layout. */
export interface SelectedFile {
  /** Unique file node identifier. */
  nodeId: string;
  /** Display name of the file or folder. */
  nodeName: string;
  /** Whether the node is a file or a folder. */
  nodeType: 'file' | 'folder';
  /** Absolute path within the project. */
  path: string;
}

/** Tracks the loading/loaded/error state of the selected file's content. */
export interface FileContentState {
  /** Raw file text; null while loading or on error. */
  content: string | null;
  /** ETag from the GET /content response; null before first load or on error. */
  etag: string | null;
  /** True while a content fetch is in-flight. */
  isLoading: boolean;
  /** Error message if the last fetch failed; null otherwise. */
  error: string | null;
  /** True when the Content-Type is not text/*. */
  isBinary: boolean;
  /** True when the content fetch returned a non-OK status — the file was deleted, moved, or forbidden. */
  notFound: boolean;
}

const initialContentState: FileContentState = {
  content: null,
  etag: null,
  isLoading: false,
  error: null,
  isBinary: false,
  notFound: false,
};

/** Manages file selection state and fetches file content with abort-on-navigate support. */
export function useFileSelection(projectId: string) {
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [contentState, setContentState] = useState<FileContentState>(initialContentState);
  const abortReference = useRef<AbortController | null>(null);

  const selectFile = useCallback(
    async (nodeId: string, nodeName: string, nodePath: string, nodeType: 'file' | 'folder' = 'file') => {
      if (abortReference.current) {
        abortReference.current.abort();
      }

      const file: SelectedFile = { nodeId, nodeName, nodeType, path: nodePath };
      setSelectedFile(file);

      if (nodeType !== 'file') {
        setContentState(initialContentState);
        return;
      }

      const controller = new AbortController();
      abortReference.current = controller;
      setContentState({ content: null, etag: null, isLoading: true, error: null, isBinary: false, notFound: false });

      try {
        const response = await fetch(
          fileContentUrl(projectId, nodeId),
          { credentials: 'include', signal: controller.signal },
        );

        // A non-OK response means the node no longer exists (deleted/moved → id changed) or is
        // forbidden. Surface a `notFound` signal — no body read, no error UI — so the caller can
        // clear stale memory and fall back gracefully (FR-009).
        if (!response.ok) {
          setContentState({ content: null, etag: null, isLoading: false, error: null, isBinary: false, notFound: true });
          return;
        }

        const contentType = response.headers.get('Content-Type') ?? '';
        if (!contentType.startsWith('text/')) {
          setContentState({ content: null, etag: null, isLoading: false, error: null, isBinary: true, notFound: false });
          return;
        }

        const etag = response.headers.get('ETag');
        const text = await response.text();
        setContentState({ content: text, etag, isLoading: false, error: null, isBinary: false, notFound: false });
      } catch (error_) {
        if (error_ instanceof DOMException && error_.name === 'AbortError') return;
        setContentState({
          content: null,
          etag: null,
          isLoading: false,
          error: error_ instanceof Error ? error_.message : 'An error occurred.',
          isBinary: false,
          notFound: false,
        });
      }
    },
    [projectId],
  );

  const clearSelection = useCallback(() => {
    if (abortReference.current) {
      abortReference.current.abort();
      abortReference.current = null;
    }
    setSelectedFile(null);
    setContentState(initialContentState);
  }, []);

  useEffect(() => () => { abortReference.current?.abort(); }, []);

  return { selectedFile, contentState, selectFile, clearSelection };
}
