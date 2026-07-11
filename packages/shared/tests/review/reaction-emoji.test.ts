import { isAllowedReactionEmoji, REACTION_EMOJI_ALLOWLIST } from '../../src/review';

describe('reaction emoji allowlist', () => {
  test('every listed emoji is accepted', () => {
    for (const emoji of REACTION_EMOJI_ALLOWLIST) {
      expect(isAllowedReactionEmoji(emoji)).toBe(true);
    }
  });

  test('arbitrary or non-listed input is rejected', () => {
    expect(isAllowedReactionEmoji('🦄')).toBe(false);
    expect(isAllowedReactionEmoji('not-an-emoji')).toBe(false);
    expect(isAllowedReactionEmoji('')).toBe(false);
    expect(isAllowedReactionEmoji('<script>')).toBe(false);
  });
});
