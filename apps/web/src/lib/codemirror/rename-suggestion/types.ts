/**
 * Shared types for the in-editor symbol rename refactor suggestion (feature 033).
 *
 * The suggestion is transient, per-author editor state — none of this is persisted.
 * The only durable side effects (document rewrites, audit log) come from the reused
 * server-side rename implementation. See specs/033-symbol-rename-refactor/data-model.md.
 */

/** Kind of symbol whose definition-site rename can trigger a suggestion. */
export type SymbolKind = 'anchor' | 'attribute' | 'heading';

/** A half-open document range `[from, to)` in editor positions. */
export interface DocumentRange {
  /** Inclusive start offset. */
  from: number;
  /** Exclusive end offset. */
  to: number;
}

/**
 * Captured when the author edits a symbol definition. `oldName` is the name as of
 * the moment editing began (FR-002); `newName` is the current text after edits.
 */
export interface RenameCandidate {
  /** Which kind of symbol the edited definition is. */
  kind: SymbolKind;
  /** Name at edit-start — the value searched for across the project. */
  oldName: string;
  /** Current name after the author's edits. */
  newName: string;
  /** Location of the definition token in the current document. */
  definitionRange: DocumentRange;
  /** File node containing the definition. */
  fileNodeId: string;
}

/** Lifecycle of a suggestion, driven by the timing/location state machine (FR-010–FR-016). */
export type RenameSuggestionStatus =
  | 'pending'
  | 'visible'
  | 'leaving'
  | 'blocked-collision'
  | 'applied'
  | 'dismissed';

/** The inline offer presented to the author, derived from an actionable candidate + usage lookup. */
export interface RenameSuggestion {
  /** The detected rename this suggestion is for. */
  candidate: RenameCandidate;
  /** Other occurrences (references + other definitions) of the old name, project-wide. */
  usageCount: number;
  /** Distinct files affected. */
  fileCount: number;
  /** Current lifecycle state. */
  status: RenameSuggestionStatus;
  /** True when the new name collides with an existing same-kind symbol → apply blocked (FR-022). */
  collision: boolean;
}

/** Outcome of applying a refactor, surfaced back to the editor (FR-019). */
export interface RefactorResult {
  /** Total usages rewritten. */
  rewrittenReferences: number;
  /** Distinct files changed. */
  rewrittenFiles: number;
  /** Warnings for occurrences that could not be safely rewritten (concurrent-edit / write conflict). */
  warnings: string[];
}

/**
 * The result of an apply plus its single-action undo (FR-020). `undo` re-runs the reused rename in
 * the opposite direction over the same file set, restoring the prior names in one action.
 */
export interface AppliedRefactor {
  /** The outcome of the forward rename. */
  result: RefactorResult;
  /** Reverses the rename as a single action, resolving to the inverse outcome. */
  undo: () => Promise<RefactorResult>;
}
