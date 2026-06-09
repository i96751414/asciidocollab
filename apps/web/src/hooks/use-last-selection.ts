'use client';
import { useMemo } from 'react';

/**
 * The most recent file selection (and AsciiDoc cursor line) remembered for a
 * single project, scoped to the current user on the current browser.
 *
 * Shape intentionally aligns with `SelectedFile` (`use-file-selection.ts`) plus
 * an optional 1-based `line`, so restoration can call `selectFile` directly.
 */
export interface LastSelection {
  /** Stable identifier of the selected file node. */
  nodeId: string;
  /** Display name; decides AsciiDoc vs other via `isAsciiDocFile(nodeName)`. */
  nodeName: string;
  /** Always `'file'` in practice — folders are not remembered. */
  nodeType: 'file' | 'folder';
  /** Absolute path within the project. */
  path: string;
  /** Last cursor line (1-based); persisted only for AsciiDoc files. */
  line?: number;
}

/** The file shape accepted by `rememberFile` (a `LastSelection` without `line`). */
type RememberedFile = Omit<LastSelection, 'line'>;

/**
 * Builds the user- and project-scoped storage key. Scoping by `userId` keeps two
 * accounts sharing a browser profile isolated (FR-011). Named helper — no inline
 * string literals, mirroring `use-editor-preferences.ts`.
 */
export function lastSelectionKey(userId: string, projectId: string): string {
  return `asciidocollab:last-selection:${userId}:${projectId}`;
}

/** True when `value` is a non-null, non-array object — the first read guard. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Narrows untrusted parsed JSON to a valid `LastSelection`, dropping an invalid `line`. */
function toLastSelection(value: unknown): LastSelection | null {
  if (!isObject(value)) return null;
  const { nodeId, nodeName, nodeType, path, line } = value;
  if (!isNonEmptyString(nodeId) || !isNonEmptyString(nodeName) || !isNonEmptyString(path)) return null;
  if (nodeType !== 'file' && nodeType !== 'folder') return null;
  const selection: LastSelection = { nodeId, nodeName, nodeType, path };
  // A non-finite or < 1 line is dropped (treated as absent), never fatal.
  if (typeof line === 'number' && Number.isFinite(line) && line >= 1) selection.line = line;
  return selection;
}

/** Reads and validates the stored selection once; returns null when none/invalid (never throws). */
export function readLastSelection(userId: string, projectId: string): LastSelection | null {
  try {
    const raw = localStorage.getItem(lastSelectionKey(userId, projectId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return toLastSelection(parsed);
  } catch {
    return null;
  }
}

/** Persists the selected file, dropping any previously stored line. No-op for folders. */
export function rememberFile(userId: string, projectId: string, file: RememberedFile): void {
  if (file.nodeType !== 'file') return;
  const entry: LastSelection = {
    nodeId: file.nodeId,
    nodeName: file.nodeName,
    nodeType: file.nodeType,
    path: file.path,
  };
  try {
    localStorage.setItem(lastSelectionKey(userId, projectId), JSON.stringify(entry));
  } catch { /* localStorage unavailable — feature stays inert */ }
}

/** Merges the cursor line into the existing entry. No fabrication when none exists. */
export function rememberLine(userId: string, projectId: string, line: number): void {
  const existing = readLastSelection(userId, projectId);
  if (!existing) return;
  try {
    localStorage.setItem(lastSelectionKey(userId, projectId), JSON.stringify({ ...existing, line }));
  } catch { /* localStorage unavailable — feature stays inert */ }
}

/** Deletes the stored entry (used when the remembered file is gone). */
export function clearLastSelection(userId: string, projectId: string): void {
  try {
    localStorage.removeItem(lastSelectionKey(userId, projectId));
  } catch { /* localStorage unavailable — nothing to clear */ }
}

/** Bound read/write/clear helpers for one (user, project), stable across renders. */
export interface UseLastSelectionResult {
  /** Reads and validates the stored selection (null when none/invalid). */
  readLastSelection: () => LastSelection | null;
  /**
   * Persists the selected file, dropping any prior line. No-op for folders.
   *
   * @param file - The selected file node to remember.
   */
  rememberFile: (file: RememberedFile) => void;
  /**
   * Merges the cursor line into the existing entry (caller debounces).
   *
   * @param line - The 1-based cursor line to remember.
   */
  rememberLine: (line: number) => void;
  /** Deletes the stored entry. */
  clearLastSelection: () => void;
}

/** Per-user, per-project last-selection persistence backed by `localStorage`. */
export function useLastSelection(userId: string, projectId: string): UseLastSelectionResult {
  return useMemo(() => ({
    readLastSelection: () => readLastSelection(userId, projectId),
    rememberFile: (file: RememberedFile) => rememberFile(userId, projectId, file),
    rememberLine: (line: number) => rememberLine(userId, projectId, line),
    clearLastSelection: () => clearLastSelection(userId, projectId),
  }), [userId, projectId]);
}
