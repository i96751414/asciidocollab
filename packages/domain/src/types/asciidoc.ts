/**
 * Cross-boundary AsciiDoc structural shapes. The extraction-engine DTO contracts
 * (TextRange / Reference / ProjectSymbol / IncludeEdge / ResolvedAttributeScope /
 * DocumentOrderEvent / UnresolvedInclude / DocumentTree / ConditionalExpr) are defined in the
 * zero-dependency `@asciidocollab/asciidoc-core` leaf — beside the extraction engine that produces
 * them — and re-exported here so the domain's cross-boundary type surface (and the
 * `@asciidocollab/shared` chain) is unchanged. The domain-only DTOs (`Diagnostic`,
 * `MainFileClearedOutcome`) are defined below.
 */
import type { TextRange } from '@asciidocollab/asciidoc-core';
export type {
  ConditionalExpr,
  TextRange,
  Reference,
  ProjectSymbol,
  IncludeEdge,
  ResolvedAttributeScope,
  DocumentOrderEvent,
  UnresolvedInclude,
  DocumentTree,
} from '@asciidocollab/asciidoc-core';

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

/**
 * Typed outcome returned by move/rename when the project's configured main file
 * is cleared (rename-to-non-adoc / delete) — a shared DTO, not an ad-hoc signal
 * The client uses it to inform the user.
 */
export interface MainFileClearedOutcome {
  /** True when `Project.mainFileNodeId` was cleared by the operation. */
  mainFileCleared: boolean;
}
