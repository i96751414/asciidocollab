import type { CompletionSource, CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete';
import { isImageFile } from './asciidoc-image-extensions';
import type { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { listSourceLanguageTokens } from './source-languages';
import { headingToId, type ProjectSymbol } from '@asciidocollab/shared';
import type { ProjectSymbolIndex } from './asciidoc-symbol-index';

/** Accessor for the live cross-file symbol index (null ⇒ current-file-only completion). */
type ProjectIndexGetter = () => ProjectSymbolIndex | null;

/** Names of the index's symbols matching the given kinds — the cross-file completion targets (US8/FR-029/030). */
function crossFileSymbolNames(getIndex: ProjectIndexGetter | undefined, kinds: ProjectSymbol['kind'][]): string[] {
  const index = getIndex?.();
  if (!index) return [];
  return index.symbols.filter((symbol) => kinds.includes(symbol.kind)).map((symbol) => symbol.name);
}

// Built-in AsciiDoc attributes
const BUILTIN_ATTRIBUTES: readonly string[] = [
  'author', 'revdate', 'revnumber', 'revremark', 'toc', 'toc-title',
  'toclevels', 'sectnums', 'sectids', 'sectanchors', 'icons', 'iconsdir',
  'imagesdir', 'source-highlighter', 'coderay-style', 'pygments-style',
  'highlight.js', 'prettify', 'table-caption', 'figure-caption', 'appendix-caption',
  'last-update-label', 'max-include-depth', 'numbered', 'hardbreaks',
  'nofooter', 'noheader', 'notitle', 'showcomments', 'experimental',
];

export const TABLE_SKELETON = '|===\n|Column 1 |Column 2\n\n|cell 1 |cell 2\n|===\n';

function extractDocumentAttributes(state: { doc: { toString: () => string } }): string[] {
  const text = state.doc.toString();
  const names: string[] = [];
  for (const line of text.split('\n')) {
    const match = line.match(/^:([a-zA-Z0-9][a-zA-Z0-9_-]*):/);
    if (match) names.push(match[1]);
  }
  return names;
}

// Heading auto-ids use the shared Asciidoctor-correct slug (`_my_section`), so xref
// completion offers the same ids the symbol index / diagnostics recognize (one source).

function extractAnchors(text: string): string[] {
  const anchors: string[] = [];
  const explicit = text.matchAll(/\[\[([^\]]+)\]\]|\[#([^\]]+)\]/g);
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

// ── Attribute completion ──────────────────────────────────────────────────────

/**
 * Attribute completion source factory — triggers after "{". When a symbol index is
 * supplied, cross-file attribute definitions are merged in alongside the current
 * document's and the built-ins (US8/FR-030).
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

// ── Source-language completion ─────────────────────────────────────────────────

/** Source-language completion (US8/FR-031) — triggers inside `[source,<here>]`. */
export const sourceLanguageCompletionSource: CompletionSource = (context: CompletionContext): CompletionResult | null => {
  const match = context.matchBefore(/\[source,\s*[\w+#.-]*/);
  if (!match) return null;
  const afterComma = match.text.slice(match.text.indexOf(',') + 1);
  const prefix = afterComma.trimStart().toLowerCase();
  const from = match.to - prefix.length;
  const options: Completion[] = listSourceLanguageTokens()
    .filter((token) => token.startsWith(prefix))
    .map((label) => ({ label, type: 'type' }));
  return { from, options, filter: false };
};

// ── Cross-reference completion ────────────────────────────────────────────────

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

// ── Include path completion ───────────────────────────────────────────────────

/**
 * Include path completion source factory — triggers after "include::".
 * Supports mid-path narrowing: after typing a prefix like "docs/", completions
 * narrow to only paths starting with that prefix (FR-IN-002).
 */
export function createIncludeCompletionSource(paths: string[] | (() => string[])): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/include::[^\n[]*/);
    if (!match) return null;

    const currentPaths = typeof paths === 'function' ? paths() : paths;
    const prefix = match.text.slice('include::'.length);
    const filtered = currentPaths.filter((filePath) => filePath.startsWith(prefix));

    const options: Completion[] = filtered.map((label) => ({
      label,
      type: 'file',
      apply: (view, _completion, from, to) => {
        view.dispatch({
          changes: { from, to, insert: `${label}[]` },
          selection: { anchor: from + label.length + 1 },
        });
      },
    }));

    return {
      from: match.from + 'include::'.length,
      options,
      filter: false,
    };
  };
}

// ── Table syntax-tree helpers ─────────────────────────────────────────────────

/** Non-table delimited block names that can contain |=== in their bodies. */
const DELIMITED_BLOCK_NAMES = new Set([
  'ListingBlock', 'ExampleBlock', 'CommentBlock', 'SidebarBlock',
  'QuoteBlock', 'PassthroughBlock', 'OpenBlock', 'AdmonitionBlock', 'StemBlock',
]);

/**
 * Text-based fallback: counts top-level |=== delimiters in `text`, skipping
 * lines inside other delimited blocks (----...----, ====...====, etc.).
 * Returns true when the count is odd, meaning an unclosed table is open.
 * Used for incomplete tables where Lezer hasn't yet produced a TableBlock node.
 */
function isInsideTableBlockByText(text: string): boolean {
  let currentBlockDelimiter: string | null = null;
  let tableDepth = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (currentBlockDelimiter === null) {
      // Standard delimited-block opener: 4+ of the SAME char (-, =, ., *, _, /, +)
      const m = trimmed.match(/^([-=.*_/+])\1{3,}$/);
      if (m) {
        currentBlockDelimiter = m[0];
      } else if (trimmed === '|===') {
        tableDepth++;
      }
    } else if (trimmed === currentBlockDelimiter) {
      currentBlockDelimiter = null;
    }
  }
  return tableDepth % 2 === 1;
}

/**
 * Returns true when `pos` is inside a table block.
 *
 * Strategy:
 * 1. Walk up the syntax tree. If we reach a TableBlock node → inside.
 *    If we reach another delimited block → NOT inside (prevents |=== in code
 *    blocks from being counted as a table opener).
 * 2. If the tree walk is inconclusive (incomplete table with no closing |===,
 *    so Lezer hasn't created a TableBlock node yet), fall back to text scanning.
 *    The text scan uses a state machine that skips content inside delimited
 *    blocks, avoiding false positives from |=== inside listing blocks.
 */
function isInsideTableBlock(state: EditorState, pos: number): boolean {
  const treeCursor = syntaxTree(state).cursor(pos);
  do {
    if (treeCursor.name === 'TableBlock') return true;
    if (DELIMITED_BLOCK_NAMES.has(treeCursor.name)) return false;
  } while (treeCursor.parent());

  return isInsideTableBlockByText(state.doc.sliceString(0, pos));
}

/**
 * Returns the column count of the table at the cursor position.
 * Tries the syntax tree first; falls back to scanning text from the most
 * recent opening |=== delimiter.
 */
function getTableColumnCount(state: EditorState, pos: number): number {
  // Syntax-tree path (works for complete tables)
  const treeCursor = syntaxTree(state).cursor(pos);
  do {
    if (treeCursor.name === 'TableBlock') {
      const tableText = state.doc.sliceString(treeCursor.from, treeCursor.to);
      for (const line of tableText.split('\n')) {
        if (line.startsWith('|') && !line.startsWith('|===')) {
          return line.split('|').length - 1;
        }
      }
      return 2;
    }
  } while (treeCursor.parent());

  // Text-based fallback (incomplete tables): find the last top-level |=== opener
  // using the same state machine as isInsideTableBlockByText.
  const textBefore = state.doc.sliceString(0, pos);
  let currentBlockDelimiter: string | null = null;
  let lastTopLevelTableOffset = -1;
  let offset = 0;
  for (const line of textBefore.split('\n')) {
    const trimmed = line.trim();
    if (currentBlockDelimiter === null) {
      const m = trimmed.match(/^([-=.*_/+])\1{3,}$/);
      if (m) {
        currentBlockDelimiter = m[0];
      } else if (trimmed === '|===') {
        lastTopLevelTableOffset = offset;
      }
    } else if (trimmed === currentBlockDelimiter) {
      currentBlockDelimiter = null;
    }
    offset += line.length + 1;
  }
  if (lastTopLevelTableOffset === -1) return 2;
  const textAfterDelim = state.doc.sliceString(lastTopLevelTableOffset);
  for (const line of textAfterDelim.split('\n').slice(1)) {
    if (line.startsWith('|') && !line.startsWith('|===')) {
      return line.split('|').length - 1;
    }
  }
  return 2;
}

// ── Table skeleton completion ─────────────────────────────────────────────────

/**
 * Table skeleton completion source — triggers when "|===" is typed at column 0
 * OUTSIDE an existing table. Offers to expand into a full 2-column skeleton.
 */
export const tableSnippetCompletionSource: CompletionSource = (context: CompletionContext): CompletionResult | null => {
  const match = context.matchBefore(/\|===/);
  if (!match) return null;

  // Only trigger when |=== is at column 0 (match.from equals line start)
  const line = context.state.doc.lineAt(context.pos);
  if (match.from !== line.from) return null;

  // Do not offer skeleton when already inside a table — the user is likely typing
  // the closing delimiter, and replacing it with a new skeleton would corrupt the table.
  // Check at match.from (before the |=== being typed) so we don't count the current
  // |=== as the opener of a table the cursor is already inside.
  if (isInsideTableBlock(context.state, match.from)) return null;

  const option: Completion = {
    label: 'Table skeleton',
    type: 'keyword',
    detail: '2-column table',
    apply: (view, _completion, from, to) => {
      view.dispatch({
        changes: { from, to, insert: TABLE_SKELETON },
        // Place cursor at the first cell (after "Column 1 " on the header row)
        selection: { anchor: from + '|===\n|'.length },
      });
    },
  };

  return {
    from: match.from,
    options: [option],
    filter: false,
  };
};

// ── Table cell/row completion ─────────────────────────────────────────────────

/**
 * Table cell/row completion source — triggers when "|" is typed at line start
 * inside a table body (not on a delimiter line). Inserts a new row with the
 * correct number of cells for the current table.
 */
export const tableCellCompletionSource: CompletionSource = (context: CompletionContext): CompletionResult | null => {
  const match = context.matchBefore(/\|/);
  if (!match) return null;

  // Only trigger when | is at column 0 (line start)
  const line = context.state.doc.lineAt(context.pos);
  if (match.from !== line.from) return null;

  // Only trigger inside a table block, and not on a delimiter line (|===).
  if (line.text.startsWith('|===')) return null;
  if (!isInsideTableBlock(context.state, context.pos)) return null;

  const colCount = getTableColumnCount(context.state, context.pos);
  const rowTemplate = Array.from({ length: colCount }, (_, index) => `|cell ${index + 1}`).join(' ') + '\n';

  const option: Completion = {
    label: 'New row',
    type: 'keyword',
    detail: 'insert table row',
    apply: (view, _completion, from, to) => {
      view.dispatch({
        changes: { from, to, insert: rowTemplate },
        selection: { anchor: from + 1 },
      });
    },
  };

  return {
    from: match.from,
    options: [option],
    filter: false,
  };
};

// ── Caption completion ────────────────────────────────────────────────────────

/**
 * Caption completion source — triggers when "." is typed at column 0.
 * Offers a ".Caption text" placeholder with cursor selecting "Caption text".
 */
export const captionCompletionSource: CompletionSource = (context: CompletionContext): CompletionResult | null => {
  const match = context.matchBefore(/\./);
  if (!match) return null;

  // Only trigger when . is at column 0
  const line = context.state.doc.lineAt(context.pos);
  if (match.from !== line.from) return null;

  const captionText = 'Caption text';
  const fullLabel = `.${captionText}`;

  const option: Completion = {
    label: fullLabel,
    type: 'keyword',
    detail: 'block caption',
    apply: (view, _completion, from, to) => {
      view.dispatch({
        changes: { from, to, insert: fullLabel },
        selection: { anchor: from + 1, head: from + fullLabel.length },
      });
    },
  };

  return {
    from: match.from,
    options: [option],
    filter: false,
  };
};

// ── Image path completion ─────────────────────────────────────────────────────

/**
 * Image path completion source factory — triggers after "image::" or "image:".
 * Filters paths to image extensions only. On accept, inserts path[] with cursor between [ and ].
 */
export function createImageCompletionSource(paths: string[] | (() => string[])): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    // Match after 'image::' (block) or 'image:' (inline, not followed by another colon)
    const match = context.matchBefore(/image::?[^\n["]*/);
    if (!match) return null;

    // Reject matches that are preceded by an identifier character — e.g. "notimage::"
    // should not trigger, only standalone "image::" at a macro boundary.
    if (match.from > 0) {
      const charBefore = context.state.sliceDoc(match.from - 1, match.from);
      if (/[a-zA-Z0-9_]/.test(charBefore)) return null;
    }

    // Determine prefix after the trigger
    const text = match.text;
    const triggerLength = text.startsWith('image::') ? 'image::'.length : 'image:'.length;
    const prefix = text.slice(triggerLength);

    const currentPaths = typeof paths === 'function' ? paths() : paths;
    const filtered = currentPaths.filter((p) => isImageFile(p) && p.startsWith(prefix));

    const options: Completion[] = filtered.map((label) => ({
      label,
      type: 'file',
      apply: (view, _completion, from, to) => {
        view.dispatch({
          changes: { from, to, insert: `${label}[]` },
          selection: { anchor: from + label.length + 1 },
        });
      },
    }));

    return {
      from: match.from + triggerLength,
      options,
      filter: false,
    };
  };
}
