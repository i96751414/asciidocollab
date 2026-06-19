/**
 * @file `@asciidocollab/asciidoc-core` — the zero-dependency single source of truth for the AsciiDoc
 * preprocessor rules that BOTH the server (`@asciidocollab/domain`) and the in-browser editor
 * (`apps/web`) must apply identically: conditional-region gating, `{ref}` attribute substitution, and
 * the shared structural types. Living in a leaf package both sides import is what keeps the editor and
 * the server from drifting apart (the mirror they previously maintained by hand).
 */
export type { ConditionalExpr } from './types';
export { substitutePathAttributes } from './attribute-substitution';
export {
  ENDIF_LINE_RE,
  CONDITIONAL_REGION_OPENER_RE,
  INCLUDE_LINE_RE,
  parseConditional,
  evaluateConditional,
  conditionalLineKind,
  ConditionalRegionStack,
} from './conditional-regions';
