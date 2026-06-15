import { ContentReplacement } from '../../ports/storage/collaborative-content-editor';

/**
 * Collapse literal find→replace pairs into a unique set, keeping the first replacement seen for
 * each `find` (a symbol or reference macro may appear more than once in a file). Shared by the
 * symbol rename and the cross-file reference rewrite so both build collaborative-edit deltas the
 * same way — a fix to the dedup semantics applies to both.
 *
 * @param pairs - The find→replace pairs to collapse.
 * @returns The deduplicated replacements.
 */
export function dedupeReplacements(pairs: Iterable<ContentReplacement>): ContentReplacement[] {
  const byFind = new Map<string, string>();
  for (const { find, replace } of pairs) {
    if (!byFind.has(find)) byFind.set(find, replace);
  }
  return [...byFind].map(([find, replace]) => ({ find, replace }));
}
