import { PRESENCE_COLOR_PALETTE, type PresenceColor } from '@/lib/editor-config';

/**
 * Deterministically maps a user id to a presence colour from the fixed palette.
 *
 * Uses a small stable string hash (FNV-1a–style) so every client derives the
 * same colour for a given user without any server coordination (research D9).
 * Total over arbitrary strings, including empty and non-ASCII ids.
 */
export function colorForUser(userId: string): PresenceColor {
  let hash = 2_166_136_261;
  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.codePointAt(index) ?? 0;
    // Multiply by the FNV prime, keeping the value in 32-bit unsigned range.
    hash = Math.imul(hash, 16_777_619);
  }
  const paletteIndex = (hash >>> 0) % PRESENCE_COLOR_PALETTE.length;
  return PRESENCE_COLOR_PALETTE[paletteIndex];
}
