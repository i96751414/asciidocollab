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
  // Debounced cursor-line persistence — AsciiDoc files only.
  handleCursorLineChange: (line: number) => void;
  /** 1-based line to restore on the restored file's first mount, or undefined otherwise. */
  initialLine: number | undefined;
}

/**
 * Last-selection restoration, cursor-line persistence, and the stale-memory
 * cleanup for a missing restored file. Owns the restored-line state and the
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
  const {
    readLastSelection,
    rememberFile,
    rememberLine,
    clearLastSelection,
    rememberCursorLine,
    readCursorLine,
    pruneCursor,
  } = useLastSelection(userId, projectId);
  // The line to restore, paired with the file it belongs to. Applied only to that file's first
  // (restore) mount; cleared once the user navigates so in-session clicks never re-jump (Decision 4).
  const [restoredLine, setRestoredLine] = useState<{ nodeId: string; line: number } | null>(null);
  const lineDebounceReference = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The pending (debounced) cursor line, captured with the file it belongs to. Held so a file switch
  // can FLUSH it instead of dropping it (see the flush effect below).
  const pendingLineReference = useRef<{ nodeId: string; line: number } | null>(null);
  // Flush the pending cursor save when the file changes (or on unmount). It writes ONLY the per-file
  // map entry, keyed by the OUTGOING file's nodeId — never the single last-selection `line`, which by
  // now belongs to the NEWLY-selected file (rememberLine merges into the current entry, so writing it
  // here would store the old file's line under the new file). The full update — including the
  // last-selection line — happens in the debounce timer, which only fires while the file is still open
  // (a switch clears the timer first). This preserves the just-left cursor without cross-file leakage.
  const flushPendingLineSave = useCallback(() => {
    if (lineDebounceReference.current) {
      clearTimeout(lineDebounceReference.current);
      lineDebounceReference.current = null;
    }
    const pending = pendingLineReference.current;
    pendingLineReference.current = null;
    if (pending) rememberCursorLine(pending.nodeId, pending.line);
  }, [rememberCursorLine]);

  // Persist the file on every selection, then delegate to useFileSelection. Folders are
  // ignored by rememberFile, so only content files are remembered.
  //
  // The line to restore is chosen in priority order:
  //   1. A pending cross-file go-to-definition line (an xref targeting this file), if set.
  //   2. The file's own per-file remembered cursor line — so reopening any file,
  //      even via an in-tree click mid-session, returns the cursor to where it was last left.
  //   3. None → open at the top.
  // Either way the chosen line reaches the editor via the mount-time `initialLine`, which clamps it
  // to the nearest valid line against the live document length (use-editor-mount.ts).
  const handleSelectFile = useCallback(
    (nodeId: string, nodeName: string, nodePath: string, nodeType: 'file' | 'folder') => {
      const xrefLine = pendingXrefLine.current;
      pendingXrefLine.current = null;
      const line = xrefLine ?? readCursorLine(nodeId);
      setRestoredLine(line === undefined ? null : { nodeId, line });
      rememberFile({ nodeId, nodeName, nodeType, path: nodePath });
      selectFile(nodeId, nodeName, nodePath, nodeType);
    },
    [rememberFile, selectFile, pendingXrefLine, readCursorLine],
  );

  // Debounced cursor-line persistence — AsciiDoc files only. Saves into BOTH the single
  // last-selection entry (last-opened-file restore) and the per-file cursor map, keyed by the
  // file that was open when the debounce was scheduled, so a late timer never lands on the wrong file.
  const handleCursorLineChange = useCallback((line: number) => {
    if (!selectedFile || !isAsciiDocFile(selectedFile.nodeName)) return;
    const { nodeId } = selectedFile;
    if (lineDebounceReference.current) clearTimeout(lineDebounceReference.current);
    pendingLineReference.current = { nodeId, line };
    lineDebounceReference.current = setTimeout(() => {
      lineDebounceReference.current = null;
      pendingLineReference.current = null;
      // The file is still open (a switch would have cleared this timer first): update BOTH the single
      // last-selection line (last-opened-file restore) and this file's per-file entry.
      rememberLine(line);
      rememberCursorLine(nodeId, line);
    }, 500);
  }, [selectedFile, rememberLine, rememberCursorLine]);

  // FLUSH the pending line save when the open file changes (or on unmount). The save captured the
  // outgoing file's nodeId, so flushing can only write that file's entry — never the newly-selected
  // file's. Flushing (rather than cancelling) means switching files faster than the 500ms debounce
  // never DROPS the cursor position the user just left.
  useEffect(() => flushPendingLineSave, [selectedFile?.nodeId, flushPendingLineSave]);

  // Restore the last opened file (and its cursor line) on mount. Synchronous localStorage read —
  // never blocks first paint; a no-op when nothing is stored.
  //
  // The empty dependency array already runs this once per real mount. We deliberately do NOT gate
  // it behind a persistent ref: under React StrictMode (and any mount→unmount→remount cycle), the
  // unmount aborts the first content fetch via useFileSelection's cleanup; a persistent guard would
  // then suppress the re-fetch on remount, leaving the editor stuck on "Loading…" forever. Letting
  // the effect re-run re-issues the fetch (the superseded request resolves to a harmless AbortError).
  useEffect(() => {
    const stored = readLastSelection();
    if (!stored) return;
    // Prefer the file's own per-file remembered line; fall back to the line stored on the
    // single last-selection entry for projects last visited before the per-file map existed.
    const line = readCursorLine(stored.nodeId) ?? stored.line;
    if (line !== undefined) setRestoredLine({ nodeId: stored.nodeId, line });
    selectFile(stored.nodeId, stored.nodeName, stored.path, stored.nodeType);
  }, []);

  // Apply the restored line only to the restored file (matched by id); undefined otherwise.
  const initialLine = restoredLine && selectedFile?.nodeId === restoredLine.nodeId
    ? restoredLine.line
    : undefined;

  // The selected file is gone (content fetch 404). Clear the stale memory so it is not retried,
  // and reset to the no-file state — no error is shown. Prune the deleted file's
  // per-file cursor entry too, so a recreated node id never resurrects a stale position.
  useEffect(() => {
    if (!contentState.notFound) return;
    clearLastSelection();
    if (selectedFile) pruneCursor(selectedFile.nodeId);
    clearSelection();
  }, [contentState.notFound, clearLastSelection, pruneCursor, clearSelection, selectedFile]);

  return { handleSelectFile, handleCursorLineChange, initialLine };
}
