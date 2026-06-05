import type { CompletionSource, CompletionContext, CompletionResult } from '@codemirror/autocomplete';

// Built-in AsciiDoc attributes
const BUILTIN_ATTRIBUTES: readonly string[] = [
  'author', 'revdate', 'revnumber', 'revremark', 'toc', 'toc-title',
  'toclevels', 'sectnums', 'sectids', 'sectanchors', 'icons', 'iconsdir',
  'imagesdir', 'source-highlighter', 'coderay-style', 'pygments-style',
  'highlight.js', 'prettify', 'table-caption', 'figure-caption', 'appendix-caption',
  'last-update-label', 'max-include-depth', 'numbered', 'hardbreaks',
  'nofooter', 'noheader', 'notitle', 'showcomments', 'experimental',
];

// Extract document-defined attribute names from ":name: value" lines
function extractDocumentAttributes(state: { doc: { toString: () => string } }): string[] {
  const text = state.doc.toString();
  const names: string[] = [];
  for (const line of text.split('\n')) {
    const match = line.match(/^:([a-zA-Z0-9][a-zA-Z0-9_-]*):/);
    if (match) names.push(match[1]);
  }
  return names;
}

// Extract section IDs from heading text (convert to kebab-case)
function headingToId(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
}

// Extract anchor definitions [[id]] and [#id] from document text
function extractAnchors(text: string): string[] {
  const anchors: string[] = [];
  const explicit = text.matchAll(/\[\[([^\]]+)\]\]|\[#([^\]]+)\]/g);
  for (const match of explicit) {
    anchors.push(match[1] ?? match[2]);
  }
  return anchors;
}

// Extract heading titles from the document
function extractHeadingIds(state: { doc: { toString: () => string } }): string[] {
  const text = state.doc.toString();
  const ids: string[] = [];
  for (const line of text.split('\n')) {
    const match = line.match(/^={1,6} (.+)$/);
    if (match) ids.push(headingToId(match[1]));
  }
  return ids;
}

/** Attribute completion source — triggers after "{". */
export const attributeCompletionSource: CompletionSource = (context: CompletionContext): CompletionResult | null => {
  const match = context.matchBefore(/\{[a-zA-Z0-9_-]*/);
  if (!match) return null;

  const prefix = match.text.slice(1);
  const documentAttributes = extractDocumentAttributes(context.state);
  const allAttributes = [...new Set([...documentAttributes, ...BUILTIN_ATTRIBUTES])];
  const filtered = allAttributes.filter((attribute) => attribute.startsWith(prefix));

  return {
    from: match.from + 1,
    options: filtered.map((label) => ({ label, type: 'variable' })),
    filter: false,
  };
};

/** Cross-reference completion source — triggers after "<<". */
export const xrefCompletionSource: CompletionSource = (context: CompletionContext): CompletionResult | null => {
  const match = context.matchBefore(/<<[^>]*/);
  if (!match) return null;

  const text = context.state.doc.toString();
  const prefix = match.text.slice(2);
  const headingIds = extractHeadingIds({ doc: { toString: () => text } });
  const anchors = extractAnchors(text);
  const allIds = [...new Set([...headingIds, ...anchors])];
  const filtered = allIds.filter((id) => id.startsWith(prefix));

  return {
    from: match.from + 2,
    options: filtered.map((label) => ({ label, type: 'keyword' })),
    filter: false,
  };
};

/**
 * Include path completion source factory — triggers after "include::".
 *  Accepts a static array or a getter so callers can pass a ref and always
 *  read the latest paths without recreating the completion source.
 */
export function createIncludeCompletionSource(paths: string[] | (() => string[])): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/include::[^\n[]*/);
    if (!match) return null;

    const currentPaths = typeof paths === 'function' ? paths() : paths;
    const prefix = match.text.slice('include::'.length);
    const filtered = currentPaths.filter((filePath) => filePath.startsWith(prefix));

    return {
      from: match.from + 'include::'.length,
      options: filtered.map((label) => ({ label, type: 'file' })),
      filter: false,
    };
  };
}
