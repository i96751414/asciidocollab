import { ExternalTokenizer } from '@lezer/lr';
import { createBlockTokenLogic } from '@/lib/codemirror/asciidoc-block-token-logic';

/**
 * Builds the AsciiDoc block-level ExternalTokenizer for the grammar test harness. It binds the
 * SHARED production tokenizing logic (`asciidoc-block-token-logic.ts`) to the term-id map that
 * `buildParser` provides — so tests exercise the exact code the editor ships (no hand-maintained
 * mirror to drift). The logic file takes the term ids as a parameter and imports nothing from the
 * generated parser, so it loads cleanly under the jest transform.
 *
 * @param terms - The term table from buildParser (external token name → id).
 */
export function createTestBlockTokenizer(terms: Record<string, number>): ExternalTokenizer {
  return new ExternalTokenizer(createBlockTokenLogic(terms), { contextual: true });
}
