import type { RenameSymbolKind, SymbolUsage } from '@/lib/api/projects';
import type { DocumentRange } from './types';

/**
 * Whole-project usage lookup + suppression for the rename suggestion.
 *
 * The authoritative, project-wide, live-aware search is the server `symbol-usages` endpoint
 * (reused via `findSymbolUsages`). This module turns its raw result into the impact summary the
 * suggestion shows, and applies the suppression rule: a suggestion is offered only when the old
 * name has at least one OTHER rewritable occurrence beyond the definition the author is editing —
 * a reference, or (for anchors/attributes) a same-named definition in another file.
 */

/** The impact of a candidate rename: how many other occurrences, in how many files, and whether to suppress. */
export interface UsageImpact {
  /** Number of other occurrences (references + other definitions) of the old name. */
  usageCount: number;
  /** Number of distinct files those occurrences span. */
  fileCount: number;
  /** True when there is nothing to refactor → no suggestion should be shown. */
  suppressed: boolean;
}

/**
 * True when a usage is the very definition token the author is editing (same file + overlapping range).
 * Shared by the suppression count here and the collision check in the state machine.
 *
 * @param usage - A usage returned by the project-wide search.
 * @param definitionFileNodeId - The file that holds the definition being edited.
 * @param definitionRange - The definition token's range.
 * @returns Whether the usage is the edited definition itself.
 */
export function isEditedDefinition(usage: SymbolUsage, definitionFileNodeId: string, definitionRange: DocumentRange): boolean {
  return (
    usage.fileNodeId === definitionFileNodeId &&
    usage.range.from < definitionRange.to &&
    usage.range.to > definitionRange.from
  );
}

/**
 * Whether a usage is an occurrence the rename would actually rewrite — the occurrences that make a
 * suggestion worth offering (and, for the new name, a real collision).
 *
 * References always count. A `definition` usage counts only when it shares the rename's family: the
 * rewrite rewrites references and explicit-anchor/attribute definitions, but NEVER a `section`
 * heading. So a derived section id (`definitionKind === 'section'`) is not a rewritable occurrence —
 * an unrelated `== Section title` in another file that merely derives the same id is a distinct
 * section, and counting it would offer a phantom refactor and flag a false collision. An explicit
 * `[[id]]` anchor whose id coincides with a heading's derived id (`definitionKind === 'anchor'`) IS
 * rewritten, so it still counts.
 *
 * @param usage - A usage returned by the project-wide search.
 * @param targetFamily - The rename's family (anchor or attribute).
 * @returns Whether the rename would rewrite this occurrence.
 */
export function isRewritableOccurrence(usage: SymbolUsage, targetFamily: RenameSymbolKind): boolean {
  if (usage.kind !== 'definition') return true;
  return usage.definitionKind === targetFamily;
}

/**
 * Evaluate raw usages into an impact summary, excluding the edited definition itself.
 *
 * @param usages - Every occurrence of the old name returned by the project-wide search.
 * @param edited - The rename family, file, and range of the definition the author is currently editing.
 * @returns The count of other rewritable occurrences, distinct affected files, and the suppression flag.
 */
export function evaluateUsages(
  usages: SymbolUsage[],
  edited: { targetFamily: RenameSymbolKind; definitionFileNodeId: string; definitionRange: DocumentRange },
): UsageImpact {
  // Files that own the id through their OWN section heading. A reference in such a file resolves to
  // that local section, and the rename never rewrites a section heading, so the server leaves those
  // references untouched (its `ownsIdViaLocalSection`). Mirror that here or the offer would promise a
  // usage in a file Apply never changes. A file surfacing an explicit-anchor definition of the id is
  // NOT in this set — the section is dropped in favour of the anchor — so its references still count.
  const filesOwningViaSection = new Set(
    usages.filter((u) => u.kind === 'definition' && u.definitionKind === 'section').map((u) => u.fileNodeId),
  );
  const others = usages.filter(
    (u) =>
      !isEditedDefinition(u, edited.definitionFileNodeId, edited.definitionRange) &&
      isRewritableOccurrence(u, edited.targetFamily) &&
      !(u.kind !== 'definition' && filesOwningViaSection.has(u.fileNodeId)),
  );
  const fileCount = new Set(others.map((u) => u.fileNodeId)).size;
  return { usageCount: others.length, fileCount, suppressed: others.length === 0 };
}
