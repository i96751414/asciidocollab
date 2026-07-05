import type { SearchQueryDto } from './project-search.dto';

/**
 * @file HTTP-boundary DTOs for the project-wide replace route. Wire shapes only:
 * never imported by `packages/domain` — the replace route maps them to/from the
 * domain-owned `SearchQuery`/`FileReplaceSelection`/`ReplaceOutcome` types.
 */

/** How far a replace applies. */
export type ReplaceScope = 'match' | 'file' | 'project';

/** One file's confirmed selection, concurrency-robust (re-matched against live content at apply). */
export interface FileReplaceSelectionDto {
  /** The file node to replace within. */
  fileNodeId: string;
  /**
   * The ordinals (within this file, from the search that produced them) to replace, each paired
   * with the exact text expected at that ordinal. A live mismatch skips that ordinal (stale).
   */
  selections: { ordinal: number; expectedText: string }[];
}

/** A project-wide replace request. */
export interface ReplaceRequestDto {
  /** The query, re-evaluated server-side against live content. */
  query: SearchQueryDto;
  /** Literal replacement text, or a capture-group template in regex mode (`$1`, `${name}`, `$$`). */
  replacement: string;
  /** Bounds which selections are honored. */
  scope: ReplaceScope;
  /** The per-file confirmed selections. */
  files: FileReplaceSelectionDto[];
}

/** The outcome of a project-wide replace. */
export interface ReplaceResultDto {
  /** Total occurrences actually replaced. */
  replacedCount: number;
  /** Number of files changed. */
  affectedFiles: number;
  /** Files that could not be replaced, with the reason. */
  skipped: { fileNodeId: string; reason: 'stale' | 'diverged' | 'not-editable' }[];
}
