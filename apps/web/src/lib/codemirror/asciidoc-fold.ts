import { foldService, syntaxTree, ensureSyntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode, SyntaxNodeRef } from '@lezer/common';

const FOLDABLE_BLOCK_TYPES = new Set([
  'ListingBlock', 'ExampleBlock', 'SidebarBlock', 'QuoteBlock',
  'PassthroughBlock', 'OpenBlock', 'StemBlock', 'CommentBlock',
]);

/** Returns the foldable range for a delimited block node, or null if not foldable. */
function findFoldRange(
  node: SyntaxNode,
  state: EditorState,
): { from: number; to: number } | null {
  if (!FOLDABLE_BLOCK_TYPES.has(node.type.name)) return null;

  const firstChild = node.firstChild;
  const lastChild = node.lastChild;
  if (!firstChild || !lastChild || firstChild === lastChild) return null;

  const from = state.doc.lineAt(firstChild.to - 1).to;
  const to = state.doc.lineAt(lastChild.from).from - 1;
  if (from >= to) return null;
  return { from, to };
}

/** CM6 fold service that folds delimited AsciiDoc blocks (listing, example, sidebar, etc.). */
export const asciidocFold = foldService.of(
  /** @param state - The current editor state. */
  (state, lineStart, _lineEnd) => {
  const tree = ensureSyntaxTree(state, state.doc.length) ?? syntaxTree(state);
  let result: { from: number; to: number } | null = null;

  tree.cursor().iterate((node: SyntaxNodeRef) => {
    if (node.from > lineStart) return false;
    if (node.to < lineStart) return;
    const range = findFoldRange(node.node, state);
    if (range && range.from >= lineStart) {
      result = range;
      return false;
    }
  });

  return result;
});
