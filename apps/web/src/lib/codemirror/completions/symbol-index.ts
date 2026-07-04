import type { ProjectSymbol } from '@asciidocollab/shared';
import type { ProjectSymbolIndex } from '@/lib/codemirror/asciidoc-symbol-index';

/** Accessor for the live cross-file symbol index (null ⇒ current-file-only completion). */
export type ProjectIndexGetter = () => ProjectSymbolIndex | null;

/** Names of the index's symbols matching the given kinds — the cross-file completion targets. */
export function crossFileSymbolNames(
  getIndex: ProjectIndexGetter | undefined,
  kinds: ProjectSymbol['kind'][],
): string[] {
  const index = getIndex?.();
  if (!index) return [];
  return index.symbols.filter((symbol) => kinds.includes(symbol.kind)).map((symbol) => symbol.name);
}
