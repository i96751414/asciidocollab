'use client';
import { useState, useRef, useCallback, useEffect } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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
  /** True while a content fetch is in-flight. */
  isLoading: boolean;
  /** Error message if the last fetch failed; null otherwise. */
  error: string | null;
  /** True when the Content-Type is not text/*. */
  isBinary: boolean;
}

const initialContentState: FileContentState = {
  content: null,
  isLoading: false,
  error: null,
  isBinary: false,
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
      setContentState({ content: null, isLoading: true, error: null, isBinary: false });

      try {
        const response = await fetch(
          `${API_BASE}/projects/${projectId}/files/${nodeId}/content`,
          { credentials: 'include', signal: controller.signal },
        );

        const contentType = response.headers.get('Content-Type') ?? '';
        if (!contentType.startsWith('text/')) {
          setContentState({ content: null, isLoading: false, error: null, isBinary: true });
          return;
        }

        const text = await response.text();
        setContentState({ content: text, isLoading: false, error: null, isBinary: false });
      } catch (error_) {
        if (error_ instanceof DOMException && error_.name === 'AbortError') return;
        setContentState({
          content: null,
          isLoading: false,
          error: error_ instanceof Error ? error_.message : 'An error occurred.',
          isBinary: false,
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
