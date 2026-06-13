/**
 * @file AsciiDoc structural DTO contracts. The shapes are defined in the domain
 * (`@asciidocollab/domain/asciidoc`, where the authoritative structural rules
 * live) and re-exported here, type-only, as the cross-boundary contract — mirroring
 * how `Result` is re-exported. No logic lives in this package.
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
} from '@asciidocollab/domain';
