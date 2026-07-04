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
 * accounts sharing a browser profile isolated. Named helper — no inline
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

// --- Per-file cursor memory -----------------------------------------------
//
// A second, independent store remembers each file's last cursor line — not just the single
// last-opened file above, but EVERY file the user has visited in the project. Value shape is a
// `Record<nodeId, { line: number }>` so reopening any file restores its own position.

/** One file's remembered cursor position (1-based line). */
interface CursorEntry {
  /** Last cursor line (1-based). */
  line: number;
}

/**
 * Builds the user- and project-scoped key for the per-file cursor map. Scoping mirrors
 * `lastSelectionKey` so two accounts sharing a browser profile stay isolated. Named
 * helper — no inline string literals.
 */
export function fileCursorsKey(userId: string, projectId: string): string {
  return `asciidocollab:file-cursors:${userId}:${projectId}`;
}

/** Narrows one untrusted map value to a valid `CursorEntry`, dropping a non-finite or < 1 line. */
function toCursorEntry(value: unknown): CursorEntry | null {
  if (!isObject(value)) return null;
  const { line } = value;
  if (typeof line !== 'number' || !Number.isFinite(line) || line < 1) return null;
  return { line };
}

/** Reads and validates the whole cursor map once; returns an empty object when none/invalid (never throws). */
function readCursorMap(userId: string, projectId: string): Record<string, CursorEntry> {
  try {
    const raw = localStorage.getItem(fileCursorsKey(userId, projectId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) return {};
    const map: Record<string, CursorEntry> = {};
    for (const [nodeId, entry] of Object.entries(parsed)) {
      const valid = toCursorEntry(entry);
      if (valid) map[nodeId] = valid;
    }
    return map;
  } catch {
    return {};
  }
}

/** Persists the cursor map, replacing the stored value. No-op when localStorage is unavailable. */
function writeCursorMap(userId: string, projectId: string, map: Record<string, CursorEntry>): void {
  try {
    localStorage.setItem(fileCursorsKey(userId, projectId), JSON.stringify(map));
  } catch { /* localStorage unavailable — feature stays inert */ }
}

/** Merges one file's cursor line into the map (caller debounces). Ignores a non-finite or < 1 line. */
export function rememberCursorLine(userId: string, projectId: string, nodeId: string, line: number): void {
  if (!Number.isFinite(line) || line < 1) return;
  const map = readCursorMap(userId, projectId);
  map[nodeId] = { line };
  writeCursorMap(userId, projectId, map);
}

/**
 * Reads one file's remembered 1-based cursor line, or `undefined` when none/invalid (the caller
 * opens at the top). Clamp-to-valid is the caller's concern at restore time, against the
 * actual document length. Never throws.
 */
export function readCursorLine(userId: string, projectId: string, nodeId: string): number | undefined {
  return readCursorMap(userId, projectId)[nodeId]?.line;
}

/** Removes a deleted file's entry from the map (edge case). No-op when absent. Never throws. */
export function pruneCursor(userId: string, projectId: string, nodeId: string): void {
  const map = readCursorMap(userId, projectId);
  if (!(nodeId in map)) return;
  delete map[nodeId];
  writeCursorMap(userId, projectId, map);
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
  /**
   * Merges one file's cursor line into the per-file map (caller debounces).
   *
   * @param nodeId - The file node whose position is remembered.
   * @param line - The 1-based cursor line to remember.
   */
  rememberCursorLine: (nodeId: string, line: number) => void;
  /**
   * Reads one file's remembered 1-based cursor line, or `undefined` (open at top).
   *
   * @param nodeId - The file node whose position to read.
   */
  readCursorLine: (nodeId: string) => number | undefined;
  /**
   * Removes a deleted file's entry from the per-file map.
   *
   * @param nodeId - The file node to forget.
   */
  pruneCursor: (nodeId: string) => void;
}

/** Per-user, per-project last-selection persistence backed by `localStorage`. */
export function useLastSelection(userId: string, projectId: string): UseLastSelectionResult {
  return useMemo(() => ({
    readLastSelection: () => readLastSelection(userId, projectId),
    rememberFile: (file: RememberedFile) => rememberFile(userId, projectId, file),
    rememberLine: (line: number) => rememberLine(userId, projectId, line),
    clearLastSelection: () => clearLastSelection(userId, projectId),
    rememberCursorLine: (nodeId: string, line: number) => rememberCursorLine(userId, projectId, nodeId, line),
    readCursorLine: (nodeId: string) => readCursorLine(userId, projectId, nodeId),
    pruneCursor: (nodeId: string) => pruneCursor(userId, projectId, nodeId),
  }), [userId, projectId]);
}
