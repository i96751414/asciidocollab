/** @file The closed allowlist of reaction emoji (reactions only — comment bodies allow any emoji). */

/**
 * The curated set of emoji that may be used as reactions. A closed allowlist
 * (not a regex) keeps reaction input free of arbitrary payloads and needs no
 * user-controlled pattern matching (Constitution IX). Comment/reply *bodies* are
 * unrestricted (any emoji) and are sanitized on render instead.
 */
export const REACTION_EMOJI_ALLOWLIST: readonly string[] = [
  '👍',
  '👎',
  '😄',
  '🎉',
  '😕',
  '❤️',
  '🚀',
  '👀',
  '🙏',
  '✅',
  '🔥',
  '💡',
];

/** A Set view of {@link REACTION_EMOJI_ALLOWLIST} for O(1) membership checks. */
const ALLOWED = new Set(REACTION_EMOJI_ALLOWLIST);

/**
 * Whether `value` is an allowed reaction emoji.
 *
 * @param value - The candidate emoji key.
 * @returns True when the emoji is in the allowlist.
 */
export function isAllowedReactionEmoji(value: string): boolean {
  return ALLOWED.has(value);
}
