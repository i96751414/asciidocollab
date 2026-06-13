import { foldService, syntaxTree, ensureSyntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode, SyntaxNodeRef } from '@lezer/common';
import { computeHeadingLevels } from './asciidoc-heading-levels';

/**
 * AsciiDoc folding (US4, FR-012–016). Beyond the original delimited-block folds
 * this adds: section folds (heading → next same/higher heading), Literal/
 * Admonition blocks, PSV/CSV/DSV tables, conditional `ifdef…endif` ranges, and
 * runs of consecutive comment / attribute-entry lines.
 *
 * The range producers are pure (text- or node-based) so they unit-test without a
 * live editor (contracts/editor-extensions.md §1). Folding never edits the
 * document, and a selection spanning a fold includes the hidden text — both are
 * CodeMirror defaults (FR-015/016a).
 */

/** A collapsed (folded) text region. */
export interface FoldRange {
  /** Document offset where the collapsed region begins (end of the opener line). */
  from: number;
  /** Document offset where the collapsed region ends. */
  to: number;
}

/** Delimited blocks (incl. Literal + Admonition) whose body folds. */
const FOLDABLE_BLOCK_TYPES = new Set([
  'ListingBlock', 'LiteralBlock', 'ExampleBlock', 'SidebarBlock', 'QuoteBlock',
  'PassthroughBlock', 'OpenBlock', 'StemBlock', 'CommentBlock', 'AdmonitionBlock',
]);

/** Table block variants (PSV + CSV/DSV) whose body folds. */
const FOLDABLE_TABLE_TYPES = new Set(['TableBlock', 'CsvTableBlock', 'DsvTableBlock']);

// Only the BLOCK forms open a foldable region: `ifdef::name[]` / `ifndef::name[]`
// (empty brackets) and `ifeval::[expr]`. The single-line form `ifdef::name[text]`
// (content in the brackets) has no matching `endif` and must not inflate nesting depth.
const CONDITIONAL_OPEN_RE = /^if(n?def::[^[\]]*\[\]|eval::\[.*\])$/;
const CONDITIONAL_CLOSE_RE = /^endif::/;
const ATTR_ENTRY_RE = /^:[A-Za-z0-9][\w-]*!?:/;

function isSingleLineComment(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('//') && !/^\/{4,}$/.test(trimmed);
}

function rangeBetweenLines(state: EditorState, openerLine: number, lastBodyLine: number): FoldRange | null {
  if (lastBodyLine <= openerLine) return null;
  const from = state.doc.line(openerLine).to;
  const to = state.doc.line(lastBodyLine).to;
  return from < to ? { from, to } : null;
}

/** Fold a delimited block (or table) from a parsed node: end-of-opener → start-of-closer line. */
function foldRangeForDelimitedNode(node: SyntaxNode, state: EditorState): FoldRange | null {
  const firstChild = node.firstChild;
  const lastChild = node.lastChild;
  if (!firstChild || !lastChild || firstChild === lastChild) return null;
  const from = state.doc.lineAt(firstChild.to - 1).to;
  const to = state.doc.lineAt(lastChild.from).from - 1;
  return from < to ? { from, to } : null;
}

/** Fold range for a delimited block node (Listing/Literal/Example/…/Admonition). */
export function foldRangeForBlock(node: SyntaxNode, state: EditorState): FoldRange | null {
  return FOLDABLE_BLOCK_TYPES.has(node.type.name) ? foldRangeForDelimitedNode(node, state) : null;
}

/** Fold range for a table node (PSV `|===`, CSV `,===`, DSV `:===`). */
export function foldRangeForTable(node: SyntaxNode, state: EditorState): FoldRange | null {
  return FOLDABLE_TABLE_TYPES.has(node.type.name) ? foldRangeForDelimitedNode(node, state) : null;
}

/** Fold a section: a heading line down to the next same/higher-level (non-discrete) heading. */
export function foldRangeForSection(state: EditorState, lineFrom: number): FoldRange | null {
  const lineNumber = state.doc.lineAt(lineFrom).number;
  const headings = computeHeadingLevels(state.doc.toString());
  const index = headings.findIndex((heading) => heading.line === lineNumber && !heading.discrete && !heading.beyondMax);
  if (index === -1) return null;
  const current = headings[index];

  let endLine = state.doc.lines;
  for (let next = index + 1; next < headings.length; next++) {
    if (!headings[next].discrete && headings[next].effectiveLevel <= current.effectiveLevel) {
      endLine = headings[next].line - 1;
      break;
    }
  }
  while (endLine > lineNumber && state.doc.line(endLine).text.trim() === '') endLine -= 1;
  return rangeBetweenLines(state, lineNumber, endLine);
}

/** Fold an `ifdef`/`ifndef`/`ifeval` … matching `endif` region (nesting-safe). */
export function foldRangeForConditional(state: EditorState, lineFrom: number): FoldRange | null {
  const startLine = state.doc.lineAt(lineFrom).number;
  if (!CONDITIONAL_OPEN_RE.test(state.doc.line(startLine).text.trim())) return null;

  let depth = 0;
  for (let line = startLine; line <= state.doc.lines; line++) {
    const text = state.doc.line(line).text.trim();
    if (CONDITIONAL_OPEN_RE.test(text)) depth += 1;
    else if (CONDITIONAL_CLOSE_RE.test(text)) {
      depth -= 1;
      if (depth === 0) return rangeBetweenLines(state, startLine, line - 1);
    }
  }
  return null;
}

/** Fold a run of ≥2 consecutive single-line comments (`//`). */
export function foldRangeForCommentRun(state: EditorState, lineFrom: number): FoldRange | null {
  const startLine = state.doc.lineAt(lineFrom).number;
  if (!isSingleLineComment(state.doc.line(startLine).text)) return null;
  let endLine = startLine;
  while (endLine + 1 <= state.doc.lines && isSingleLineComment(state.doc.line(endLine + 1).text)) endLine += 1;
  return endLine > startLine ? rangeBetweenLines(state, startLine, endLine) : null;
}

/** Fold a run of ≥2 consecutive attribute-entry header lines (`:name:`). */
export function foldRangeForAttributeRun(state: EditorState, lineFrom: number): FoldRange | null {
  const startLine = state.doc.lineAt(lineFrom).number;
  if (!ATTR_ENTRY_RE.test(state.doc.line(startLine).text.trim())) return null;
  let endLine = startLine;
  while (endLine + 1 <= state.doc.lines && ATTR_ENTRY_RE.test(state.doc.line(endLine + 1).text.trim())) endLine += 1;
  return endLine > startLine ? rangeBetweenLines(state, startLine, endLine) : null;
}

/** Tree-based block/table fold for the line at `lineStart`. */
function foldDelimitedAt(state: EditorState, lineStart: number): FoldRange | null {
  const tree = ensureSyntaxTree(state, state.doc.length) ?? syntaxTree(state);
  let result: FoldRange | null = null;
  tree.cursor().iterate((node: SyntaxNodeRef) => {
    if (node.from > lineStart) return false;
    if (node.to < lineStart) return undefined;
    const range = foldRangeForBlock(node.node, state) ?? foldRangeForTable(node.node, state);
    if (range && range.from >= lineStart) {
      result = range;
      return false;
    }
    return undefined;
  });
  return result;
}

/**
 * CM6 fold service for AsciiDoc. Dispatches the pure range producers by line kind
 * (section / conditional / comment-run / attr-run) and falls back to the
 * tree-based delimited-block / table fold.
 */
export const asciidocFold = foldService.of((state, lineStart) =>
  foldRangeForSection(state, lineStart) ??
  foldRangeForConditional(state, lineStart) ??
  foldRangeForCommentRun(state, lineStart) ??
  foldRangeForAttributeRun(state, lineStart) ??
  foldDelimitedAt(state, lineStart),
);
