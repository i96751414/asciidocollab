import { ExternalTokenizer } from '@lezer/lr';
import * as terms from './asciidoc-parser.terms.js';
import { createBlockTokenLogic } from './asciidoc-block-token-logic';

// The generated terms module exports one numeric id per external token; spread it into a
// plain record so the shared logic can look ids up by the grammar's external token names.
const termIds: Record<string, number> = { ...terms };

/**
 * The production AsciiDoc block-level external tokenizer. The tokenizing logic lives in
 * `asciidoc-block-token-logic.ts` (shared with the grammar test harness so the two can never
 * diverge); here we bind it to the generated term-id map and wrap it in an ExternalTokenizer.
 */
export const blockTokenizer = new ExternalTokenizer(createBlockTokenLogic(termIds), { contextual: true });
