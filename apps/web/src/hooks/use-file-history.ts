'use client';
import { useEffect } from 'react';
import type { SelectedFile } from '@/hooks/use-file-selection';

/** The key under which a selected file is stored inside `history.state`. */
const HISTORY_FILE_KEY = 'asciidocFile';

/** The selection snapshot persisted in a history entry — mirrors `SelectedFile`. */
interface FileHistoryEntry {
  nodeId: string;
  nodeName: string;
  nodeType: 'file' | 'folder';
  path: string;
}

interface UseFileHistoryOptions {
  /** The currently selected file (the editor's source of truth), or null. */
  selectedFile: SelectedFile | null;
  // Selects a file — the same funnel a file-tree click uses (remember + open).
  selectFile: (nodeId: string, nodeName: string, nodePath: string, nodeType: 'file' | 'folder') => void;
}

/** True when `value` is a non-null, non-array object. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Builds the entry stored in history from the current selection. */
function toEntry(file: SelectedFile): FileHistoryEntry {
  return { nodeId: file.nodeId, nodeName: file.nodeName, nodeType: file.nodeType, path: file.path };
}

/** Narrows an untrusted `history.state` to a valid file entry, or null. */
function readEntry(state: unknown): FileHistoryEntry | null {
  if (!isObject(state)) return null;
  const file = state[HISTORY_FILE_KEY];
  if (!isObject(file)) return null;
  const { nodeId, nodeName, nodeType, path } = file;
  if (typeof nodeId !== 'string' || typeof nodeName !== 'string' || typeof path !== 'string') return null;
  if (nodeType !== 'file' && nodeType !== 'folder') return null;
  return { nodeId, nodeName, nodeType, path };
}

/**
 * Makes the editor's file selection a real browser navigation: each distinct selection becomes a
 * `history` entry, so Back/Forward walk the files visited this session. The reported gap was that
 * selection lived only in React state, so the browser Back button never returned to the previously
 * opened file.
 *
 * `history.state` is the single source of truth — no origin flags. The first selection REPLACES the
 * current entry (establishing a baseline without leaving a dead entry); later distinct selections
 * PUSH. A selection that already matches `history.state` writes nothing, so the Back/Forward path
 * (which the browser has already moved) never re-pushes or loops. Full-reload restoration stays the
 * localStorage concern of `useEditorRestoration`.
 *
 * @param options - The active selection and the selection funnel to drive on Back/Forward.
 */
export function useFileHistory({ selectedFile, selectFile }: UseFileHistoryOptions): void {
  // Selection → history. Mirror the active file into the history stack.
  useEffect(() => {
    if (!selectedFile) return;
    const state: unknown = globalThis.history.state;
    const current = readEntry(state);
    // Already represented (re-select, or a Back/Forward the browser just applied) — write nothing.
    if (current?.nodeId === selectedFile.nodeId) return;
    const base = isObject(state) ? state : {};
    const merged = { ...base, [HISTORY_FILE_KEY]: toEntry(selectedFile) };
    // No file encoded yet → seed a baseline on the current entry; otherwise add a new one.
    if (current) {
      globalThis.history.pushState(merged, '');
    } else {
      globalThis.history.replaceState(merged, '');
    }
  }, [selectedFile]);

  // History → selection. On Back/Forward, open the file the browser navigated to. The browser has
  // already updated `history.state`, so the selection effect above sees a matching entry and writes
  // nothing — no loop. Entries without a file (page-level history) are ignored.
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const entry = readEntry(event.state);
      if (!entry) return;
      selectFile(entry.nodeId, entry.nodeName, entry.path, entry.nodeType);
    };
    globalThis.addEventListener('popstate', onPopState);
    return () => globalThis.removeEventListener('popstate', onPopState);
  }, [selectFile]);
}
