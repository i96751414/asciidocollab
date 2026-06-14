import type { CompletionSource, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { headingToId } from '@/lib/asciidoc/extraction';
import { crossFileSymbolNames, type ProjectIndexGetter } from '@/lib/codemirror/completions/symbol-index';

// Heading auto-ids use the shared Asciidoctor-correct slug (`_my_section`), so xref
// completion offers the same ids the symbol index / diagnostics recognize (one source).

// Anchor-id charset, mirroring the symbol index's ANCHOR_RE (asciidoc/extraction.ts) so completion
// offers exactly the ids the index recognizes. A bare `[^\]]+` would swallow `[#id,role]` /
// `[#id%opt]` role/option shorthand into the suggested id, yielding xrefs the index can't resolve.
const ANCHOR_ID = String.raw`[A-Za-z][\w:.-]*`;

function extractAnchors(text: string): string[] {
  const anchors: string[] = [];
  const explicit = text.matchAll(new RegExp(String.raw`\[\[(${ANCHOR_ID})\]\]|\[#(${ANCHOR_ID})\]`, 'g'));
  for (const match of explicit) {
    anchors.push(match[1] ?? match[2]);
  }
  return anchors;
}

function extractHeadingIds(state: { doc: { toString: () => string } }): string[] {
  const text = state.doc.toString();
  const ids: string[] = [];
  for (const line of text.split('\n')) {
    const match = line.match(/^={1,6} (.+)$/);
    if (match) ids.push(headingToId(match[1]));
  }
  return ids;
}

/**
 * Cross-reference completion source factory — triggers after "<<". When a symbol
 * index is supplied, section/anchor ids defined across the whole include tree are
 * merged in alongside the current document's (US8/FR-029).
 */
export function createXrefCompletionSource(getIndex?: ProjectIndexGetter): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/<<[^>]*/);
    if (!match) return null;

    const text = context.state.doc.toString();
    const prefix = match.text.slice(2);
    const headingIds = extractHeadingIds({ doc: { toString: () => text } });
    const anchors = extractAnchors(text);
    const crossFile = crossFileSymbolNames(getIndex, ['section', 'anchor']);
    const allIds = [...new Set([...headingIds, ...anchors, ...crossFile])];
    const filtered = allIds.filter((id) => id.startsWith(prefix));

    return {
      from: match.from + 2,
      options: filtered.map((label) => ({ label, type: 'keyword' })),
      filter: false,
    };
  };
}

/** Cross-reference completion source — current-document ids only. */
export const xrefCompletionSource: CompletionSource = createXrefCompletionSource();
