import { ProjectId } from '../../value-objects/ids/project-id';
import { YjsStateId } from '../../value-objects/ids/yjs-state-id';
import { Result } from '../../types/result';
import { SearchQuery, ReplaceSelection } from '../../types/search';

/** A structured replacement to apply to one collaborative document. */
export interface StructuredReplacementSpec {
  /** The query, re-evaluated against the document's live content at apply time. */
  readonly query: SearchQuery;
  /** Literal replacement text, or a capture-group template in regex mode. */
  readonly replacement: string;
  /** The confirmed `{ordinal, expectedText}` selections for THIS document (already scope-filtered). */
  readonly selections: ReadonlyArray<ReplaceSelection>;
}

/**
 * Port for applying a **selection- and regex-aware** replacement to a document
 * whose authoritative content is the collaborative Yjs document.
 *
 * Unlike {@link CollaborativeContentEditor} (occurrence-global literal
 * replace-all — correct for rename), this re-matches the query against the live
 * `Y.Text` **inside the apply transaction** and rewrites only the confirmed
 * spans, so it supports regex capture-group substitution and per-match
 * include/exclude. Re-matching late (rather than trusting scan-time offsets)
 * makes positional editing safe despite concurrent edits between scan and apply;
 * a span whose live text no longer equals its `expectedText` is skipped (stale),
 * not failed. Still a single Yjs-authoritative write path — never a parallel
 * plain-text write.
 */
export interface StructuredCollaborativeEditor {
  /**
   * Applies `spec` to the document identified by `yjsStateId`.
   *
   * @param projectId - The project that owns the document.
   * @param yjsStateId - The Yjs state identifier of the document's collaborative room.
   * @param spec - The query, replacement, and confirmed selections for this document.
   * @returns On success, the number of occurrences actually replaced (0 when the
   *   live content diverged from every confirmed selection — the caller must NOT
   *   force a file write); or an error when the edit could not be delivered.
   */
  applyStructuredReplacement(
    projectId: ProjectId,
    yjsStateId: YjsStateId,
    spec: StructuredReplacementSpec,
  ): Promise<Result<number, Error>>;
}
