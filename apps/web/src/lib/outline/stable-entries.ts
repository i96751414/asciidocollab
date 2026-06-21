import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';

/**
 * Structural equality for two section-outline lists: same length and, per position, the same fields
 * that affect rendering (title, level, source provenance, open-file flag, lines). Used to keep the
 * outline's array identity STABLE across the many rebuilds that produce an identical result — the
 * assembled full-document outline is recomputed on every symbol-index rebuild (keystrokes, reachable
 * doc changes), and without this guard each recompute would hand the renderer a fresh array and force
 * a needless re-render even when nothing changed.
 *
 * @param a - One outline list.
 * @param b - The other outline list.
 * @returns True when the two lists are element-wise equal on every render-affecting field.
 */
export function sameOutlineEntries(a: SectionOutlineEntry[], b: SectionOutlineEntry[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (const [index, x] of a.entries()) {
    const y = b[index];
    if (
      x.title !== y.title ||
      x.level !== y.level ||
      x.line !== y.line ||
      x.from !== y.from ||
      x.sourceFileId !== y.sourceFileId ||
      x.sourcePath !== y.sourcePath ||
      x.sourceLine !== y.sourceLine ||
      x.isOpenFile !== y.isOpenFile
    ) {
      return false;
    }
  }
  return true;
}
