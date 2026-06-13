/**
 * @file Domain AsciiDoc structural model — the canonical business rules for
 * references, symbols, the include graph and effective offsets, plus the DTO
 * types that cross boundaries. This is domain logic (document integrity); the
 * delivery layers consume it via the domain barrel / API, never the reverse.
 */
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
