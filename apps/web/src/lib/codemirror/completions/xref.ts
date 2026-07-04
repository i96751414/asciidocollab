import type { CompletionSource, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { extractSymbols } from '@asciidocollab/asciidoc-core';
import { inheritedAttributesSeed } from '@/lib/codemirror/inherited-attributes-field';
import { crossFileSymbolNames, type ProjectIndexGetter } from '@/lib/codemirror/completions/symbol-index';

// The current document's section/anchor ids come from extractSymbols — the SINGLE authority for
// heading detection (block-boundary rule) and id derivation (idprefix/idseparator/sectids +
// explicit-id override) — so xref completion offers exactly the ids the index / diagnostics resolve.
// The seed carries the open file's inherited idprefix/idseparator/sectids so a heading id derived
// under a parent-set prefix matches the index (and the server), rather than offering an unprefixed
// duplicate.
function localSectionAndAnchorIds(text: string, seed?: ReadonlyMap<string, string>): string[] {
  return extractSymbols('', text, seed)
    .filter((symbol) => symbol.kind === 'section' || symbol.kind === 'anchor')
    .map((symbol) => symbol.name);
}

/**
 * Cross-reference completion source factory — triggers after "<<". When a symbol
 * index is supplied, section/anchor ids defined across the whole include tree are
 * merged in alongside the current document's.
 */
export function createXrefCompletionSource(getIndex?: ProjectIndexGetter): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/<<[^>]*/);
    if (!match) return null;

    const text = context.state.doc.toString();
    const prefix = match.text.slice(2);
    const localIds = localSectionAndAnchorIds(text, inheritedAttributesSeed(context.state));
    const crossFile = crossFileSymbolNames(getIndex, ['section', 'anchor']);
    const allIds = [...new Set([...localIds, ...crossFile])];
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
