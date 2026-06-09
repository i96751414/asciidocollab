'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import type { CollabAuthRole } from '@asciidocollab/shared';
import { fileContentUrl } from '@/lib/api/file-content';
import { getCollabDocumentInfo } from '@/lib/api/collab';

/** Collaboration room info for the selected file, present only on the collab path. */
export interface SelectedFileCollab {
  /** Yjs state id forming the room name with the project id. */
  yjsStateId: string;
  /** The current user's collaboration role for this document. */
  role: CollabAuthRole;
}

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
  /**
   * Collaboration room info when the file is a collaborative document. When set,
   * the editor binds to Yjs and the REST `GET /content` fetch is skipped (the
   * collaboration server owns load/save); `null` for assets and the legacy path.
   */
  collab: SelectedFileCollab | null;
  /**
   * True when the file is editable text but the API returned no collaborative document
   * for it (a 404 from `GET /collab`). Every text document is meant to be collaborative,
   * so this is an anomaly such as a stale or misconfigured API. The editor MUST open
   * read-only rather than silently falling back to the legacy REST autosave — uncoordinated
   * PUTs would let two clients overwrite each other (no Yjs merge, no active-session lock).
   */
  collabUnavailable: boolean;
}

const initialContentState: FileContentState = {
  content: null,
  etag: null,
  isLoading: false,
  error: null,
  isBinary: false,
  notFound: false,
  collab: null,
  collabUnavailable: false,
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
      setContentState({ content: null, etag: null, isLoading: true, error: null, isBinary: false, notFound: false, collab: null, collabUnavailable: false });

      // Collab path (B3/M2): if the file backs a collaborative document, the editor binds to Yjs
      // and the collaboration server owns load/save — so skip the REST content fetch entirely. A
      // 404 (null) means a binary asset / no document → fall through to the legacy fetch below.
      // Any OTHER failure (401/403/5xx) is NOT treated as legacy: silently opening the editable
      // REST editor for a collaborative file would let autosave PUTs bypass the Yjs document (a
      // split-brain write), so surface the error instead.
      try {
        const collab = await getCollabDocumentInfo(projectId, nodeId);
        if (controller.signal.aborted) return;
        if (collab) {
          setContentState({ content: null, etag: null, isLoading: false, error: null, isBinary: false, notFound: false, collab, collabUnavailable: false });
          return;
        }
      } catch (error_) {
        if (controller.signal.aborted) return;
        setContentState({
          content: null,
          etag: null,
          isLoading: false,
          error: error_ instanceof Error ? error_.message : 'Failed to open the document.',
          isBinary: false,
          notFound: false,
          collab: null,
          collabUnavailable: false,
        });
        return;
      }

      try {
        const response = await fetch(
          fileContentUrl(projectId, nodeId),
          { credentials: 'include', signal: controller.signal },
        );

        // A non-OK response means the node no longer exists (deleted/moved → id changed) or is
        // forbidden. Surface a `notFound` signal — no body read, no error UI — so the caller can
        // clear stale memory and fall back gracefully (FR-009).
        if (!response.ok) {
          setContentState({ content: null, etag: null, isLoading: false, error: null, isBinary: false, notFound: true, collab: null, collabUnavailable: false });
          return;
        }

        const contentType = response.headers.get('Content-Type') ?? '';
        if (!contentType.startsWith('text/')) {
          setContentState({ content: null, etag: null, isLoading: false, error: null, isBinary: true, notFound: false, collab: null, collabUnavailable: false });
          return;
        }

        const etag = response.headers.get('ETag');
        const text = await response.text();
        // Reaching the legacy fetch means GET /collab returned 404 (no collaborative document).
        // For editable TEXT that is an anomaly — every text file should be collaborative — so open
        // it read-only (collabUnavailable) instead of enabling the clobbering legacy autosave path.
        setContentState({ content: text, etag, isLoading: false, error: null, isBinary: false, notFound: false, collab: null, collabUnavailable: true });
      } catch (error_) {
        if (error_ instanceof DOMException && error_.name === 'AbortError') return;
        setContentState({
          content: null,
          etag: null,
          isLoading: false,
          error: error_ instanceof Error ? error_.message : 'An error occurred.',
          isBinary: false,
          notFound: false,
          collab: null,
          collabUnavailable: false,
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
