import type { CompletionSource, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { crossFileSymbolNames, type ProjectIndexGetter } from '@/lib/codemirror/completions/symbol-index';

// Built-in AsciiDoc attributes
const BUILTIN_ATTRIBUTES: readonly string[] = [
  'author', 'revdate', 'revnumber', 'revremark', 'toc', 'toc-title',
  'toclevels', 'sectnums', 'sectids', 'sectanchors', 'icons', 'iconsdir',
  'imagesdir', 'source-highlighter', 'coderay-style', 'pygments-style',
  'highlight.js', 'prettify', 'table-caption', 'figure-caption', 'appendix-caption',
  'last-update-label', 'max-include-depth', 'numbered', 'hardbreaks',
  'nofooter', 'noheader', 'notitle', 'showcomments', 'experimental',
];

function extractDocumentAttributes(state: { doc: { toString: () => string } }): string[] {
  const text = state.doc.toString();
  const names: string[] = [];
  for (const line of text.split('\n')) {
    const match = line.match(/^:([a-zA-Z0-9][a-zA-Z0-9_-]*):/);
    if (match) names.push(match[1]);
  }
  return names;
}

/**
 * Attribute completion source factory — triggers after "{". When a symbol index is
 * supplied, cross-file attribute definitions are merged in alongside the current
 * document's and the built-ins.
 */
export function createAttributeCompletionSource(getIndex?: ProjectIndexGetter): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/\{[a-zA-Z0-9_-]*/);
    if (!match) return null;

    const prefix = match.text.slice(1);
    const documentAttributes = extractDocumentAttributes(context.state);
    const crossFile = crossFileSymbolNames(getIndex, ['attribute']);
    const allAttributes = [...new Set([...documentAttributes, ...crossFile, ...BUILTIN_ATTRIBUTES])];
    const filtered = allAttributes.filter((attribute) => attribute.startsWith(prefix));

    return {
      from: match.from + 1,
      options: filtered.map((label) => ({ label, type: 'variable' })),
      filter: false,
    };
  };
}

/** Attribute completion source — current-document + built-ins only. */
export const attributeCompletionSource: CompletionSource = createAttributeCompletionSource();
