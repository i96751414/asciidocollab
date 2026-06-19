/**
 * Re-export of the shared AsciiDoc conditional-region authority
 * (`@asciidocollab/asciidoc-core`). The grammar, the non-`eval` evaluation (Constitution IX), and the
 * region stack live in ONE zero-dependency leaf package imported by BOTH the in-browser editor and
 * the server-side domain — so the preview assembler, the editor's `effectiveLevelOffset`/attribute-
 * inheritance walks, the section outline, the conditional dimming, and the domain find-references all
 * gate content identically and can never drift apart. This module keeps the editor-local import path
 * (`@/lib/asciidoc/conditional-regions`) stable for existing consumers.
 */
export type { ConditionalExpr } from '@asciidocollab/asciidoc-core';
export {
  ENDIF_LINE_RE,
  CONDITIONAL_REGION_OPENER_RE,
  INCLUDE_LINE_RE,
  parseConditional,
  evaluateConditional,
  conditionalLineKind,
  ConditionalRegionStack,
} from '@asciidocollab/asciidoc-core';
