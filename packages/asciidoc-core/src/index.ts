/**
 * @file `@asciidocollab/asciidoc-core` — the zero-dependency single source of truth for the AsciiDoc
 * preprocessor + structural rules that BOTH the server (`@asciidocollab/domain`) and the in-browser
 * editor (`apps/web`) must apply identically: conditional-region gating, `{ref}` attribute
 * substitution, the reference/symbol/include-graph EXTRACTION engine, and the shared structural types.
 * Living in a leaf package both sides import is what keeps the editor and the server from drifting
 * apart (the mirror they previously maintained by hand).
 */
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
} from './types';
export { substitutePathAttributes } from './attribute-substitution';
export { isValidNewName, type RenamableSymbolKind } from './name-validation';
export {
  ENDIF_LINE_RE,
  CONDITIONAL_REGION_OPENER_RE,
  INCLUDE_LINE_RE,
  parseConditional,
  evaluateConditional,
  conditionalLineKind,
  ConditionalRegionStack,
} from './conditional-regions';
// The reference/symbol/include-graph extraction engine (its own barrel + concern sub-modules).
export * from './extraction';
// The environment-agnostic include-assembly primitive (I/O + sandbox path policy injected) shared by
// every rendering path so include semantics never drift between them.
export * from './assembly';
