/** @file Shared AsciiDoc structural model — DTOs + pure extraction/graph rules. */
export type {
  TextRange,
  Reference,
  ProjectSymbol,
  Diagnostic,
  IncludeEdge,
  UnresolvedInclude,
  DocumentTree,
  MainFileClearedOutcome,
} from './types';
export {
  headingToId,
  parseIncludeLevelOffset,
  extractReferences,
  extractSymbols,
  resolveReference,
  buildIncludeGraph,
  inheritedLevelOffset,
} from './extraction';
