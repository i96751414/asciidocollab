/**
 * Cross-boundary AsciiDoc structural shapes (Reference / ProjectSymbol /
 * Diagnostic / IncludeEdge) defined once here and reused by the web symbol-index
 * projection and the domain use cases (FindReferences, move/rename) — so no two
 * packages independently define the same type (Architecture Constitution).
 */

/** A half-open text range within a file (document offsets). */
export interface TextRange {
  /** Start offset (inclusive). */
  from: number;
  /** End offset (exclusive). */
  to: number;
}

/** A reference from one file to a symbol/file/path elsewhere. */
export interface Reference {
  /** What kind of reference this is. */
  kind: 'xref' | 'include' | 'image' | 'attributeRef';
  /** The referenced symbol id, file path, or attribute name. */
  target: string;
  /** The file containing the reference. */
  fileId: string;
  /** The reference's location within its file. */
  range: TextRange;
}

/** A definable, referenceable symbol within the project. */
export interface ProjectSymbol {
  /** The kind of symbol. */
  kind: 'section' | 'anchor' | 'attribute';
  /** Section/anchor id or attribute name. */
  name: string;
  /** The file that defines the symbol. */
  fileId: string;
  /** The symbol definition's location. */
  range: TextRange;
}

/** A validation finding produced over the document tree. */
export interface Diagnostic {
  /** Finding severity. */
  severity: 'error' | 'warning' | 'info';
  /** Human-readable message. */
  message: string;
  /** Location of the finding. */
  range: TextRange;
  /** Machine-readable code. */
  code:
    | 'unterminated-block'
    | 'unknown-xref'
    | 'duplicate-id'
    | 'undefined-attribute'
    | 'unresolved-include';
}

/** An `include::` edge between two files in the include graph. */
export interface IncludeEdge {
  /** The including file. */
  from: string;
  /** The included file. */
  to: string;
  /** Location of the `include::` directive in the including file. */
  includeDirectiveRange: TextRange;
  /** Level offset declared on the include directive (`leveloffset=`), 0 if none. */
  leveloffset: number;
}

/** An include target that could not be resolved (drives the unresolved-include diagnostic). */
export interface UnresolvedInclude {
  /** The file containing the unresolved include. */
  fromFile: string;
  /** The raw include target. */
  target: string;
  /** Location of the directive. */
  range: TextRange;
}

/** The transitive include graph rooted at a main (or current) file. */
export interface DocumentTree {
  /** The root file (the configured main file, or the open file when none). */
  rootFileId: string;
  /** All files reachable via transitive `include::`. */
  nodes: string[];
  /** Include relationships. */
  edges: IncludeEdge[];
  /** Includes that could not be resolved. */
  unresolved: UnresolvedInclude[];
}

/**
 * Typed outcome returned by move/rename when the project's configured main file
 * is cleared (rename-to-non-adoc / delete) — a shared DTO, not an ad-hoc signal
 * (FR-070). The client uses it to inform the user.
 */
export interface MainFileClearedOutcome {
  /** True when `Project.mainFileNodeId` was cleared by the operation. */
  mainFileCleared: boolean;
}
