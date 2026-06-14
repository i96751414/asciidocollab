'use client';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { isAsciiDocFile } from '@/components/asciidoc-preview';
import { useLastSelection } from '@/hooks/use-last-selection';
import type { SelectedFile, FileContentState } from '@/hooks/use-file-selection';

interface EditorRestorationOptions {
  userId: string;
  projectId: string;
  selectedFile: SelectedFile | null;
  contentState: FileContentState;
  selectFile: (nodeId: string, nodeName: string, nodePath: string, nodeType: 'file' | 'folder') => void;
  clearSelection: () => void;
  /** Cross-file go-to-definition line set by navigation, consumed on the next selection. */
  pendingXrefLine: RefObject<number | null>;
}

interface EditorRestoration {
  // Selection handler that remembers the file, threads any pending xref line, and selects it.
  handleSelectFile: (nodeId: string, nodeName: string, nodePath: string, nodeType: 'file' | 'folder') => void;
  // Debounced cursor-line persistence — AsciiDoc files only (FR-006).
  handleCursorLineChange: (line: number) => void;
  /** 1-based line to restore on the restored file's first mount, or undefined otherwise. */
  initialLine: number | undefined;
}

/**
 * Last-selection restoration (FR-010), cursor-line persistence (FR-006), and the stale-memory
 * cleanup for a missing restored file (FR-009/US3). Owns the restored-line state and the
 * persistence debounce; selection/content come from useFileSelection in the parent.
 */
export function useEditorRestoration({
  userId,
  projectId,
  selectedFile,
  contentState,
  selectFile,
  clearSelection,
  pendingXrefLine,
}: EditorRestorationOptions): EditorRestoration {
  const { readLastSelection, rememberFile, rememberLine, clearLastSelection } = useLastSelection(userId, projectId);
  // The line to restore, paired with the file it belongs to. Applied only to that file's first
  // (restore) mount; cleared once the user navigates so in-session clicks never re-jump (Decision 4).
  const [restoredLine, setRestoredLine] = useState<{ nodeId: string; line: number } | null>(null);
  const lineDebounceReference = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist the file on every selection, then delegate to useFileSelection. Folders are
  // ignored by rememberFile, so only content files are remembered. A user-initiated selection
  // also ends the restore window, so the remembered line is never re-applied mid-session.
  // The pending cross-file go-to-definition line (set when an xref targets another file) is consumed
  // here so the opened file reveals the definition via its mount-time initialLine.
  const handleSelectFile = useCallback(
    (nodeId: string, nodeName: string, nodePath: string, nodeType: 'file' | 'folder') => {
      const xrefLine = pendingXrefLine.current;
      pendingXrefLine.current = null;
      setRestoredLine(xrefLine === null ? null : { nodeId, line: xrefLine });
      rememberFile({ nodeId, nodeName, nodeType, path: nodePath });
      selectFile(nodeId, nodeName, nodePath, nodeType);
    },
    [rememberFile, selectFile, pendingXrefLine],
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

  return { handleSelectFile, handleCursorLineChange, initialLine };
}
