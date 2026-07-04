import type { SymbolUsage } from '@/lib/api/projects';
import type { DocumentRange } from './types';

/**
 * Whole-project usage lookup + suppression for the rename suggestion.
 *
 * The authoritative, project-wide, live-aware search is the server `symbol-usages` endpoint
 * (reused via `findSymbolUsages`). This module turns its raw result into the impact summary the
 * suggestion shows, and applies the suppression rule: a suggestion is offered only when the old
 * name has at least one OTHER occurrence — a reference or a same-named definition in another
 * file — beyond the definition the author is editing.
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
 * Evaluate raw usages into an impact summary, excluding the edited definition itself.
 *
 * @param usages - Every occurrence of the old name returned by the project-wide search.
 * @param edited - The file + range of the definition the author is currently editing.
 * @returns The count of other occurrences, distinct affected files, and the suppression flag.
 */
export function evaluateUsages(
  usages: SymbolUsage[],
  edited: { definitionFileNodeId: string; definitionRange: DocumentRange },
): UsageImpact {
  const others = usages.filter((u) => !isEditedDefinition(u, edited.definitionFileNodeId, edited.definitionRange));
  const fileCount = new Set(others.map((u) => u.fileNodeId)).size;
  return { usageCount: others.length, fileCount, suppressed: others.length === 0 };
}
