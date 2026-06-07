import * as collection from '@dicebear/collection';

/** A single entry in the DiceBear style catalogue. */
export interface DiceBearStyleEntry {
  /** DiceBear style module compatible with `createAvatar()`. */
  style: Parameters<typeof import('@dicebear/core').createAvatar>[0];
  /** Human-readable label displayed in the avatar picker. */
  label: string;
  /** Extra options merged into `createAvatar()` calls for this style (e.g. background colour). */
  options?: Record<string, unknown>;
}

const PORTRAIT_BG = { backgroundColor: ['b6e3f4', 'c0aede', 'ffd5dc', 'd1d4f9'], backgroundType: ['solid'] };

export const DICEBEAR_STYLES: Record<string, DiceBearStyleEntry> = {
  'initial-face': { style: collection.initials, label: 'Initial Face' },
  'bottts': { style: collection.bottts, label: 'Bottts' },
  'pixel-art': { style: collection.pixelArt, label: 'Pixel Art' },
  'fun-emoji': { style: collection.funEmoji, label: 'Fun Emoji' },
  'lorelei': { style: collection.lorelei, label: 'Lorelei', options: PORTRAIT_BG },
  'adventurer': { style: collection.adventurer, label: 'Adventurer', options: PORTRAIT_BG },
  'shapes': { style: collection.shapes, label: 'Shapes' },
  'identicon': { style: collection.identicon, label: 'Identicon' },
};

/** Union type of all supported DiceBear style keys. */
export type AvatarStyleKey = keyof typeof DICEBEAR_STYLES;

export const DEFAULT_AVATAR_STYLE: AvatarStyleKey = 'initial-face';

/** Seeds used to render the variant picker grid within a selected style. */
export const AVATAR_VARIANT_SEEDS = [
  '1', '2', '3', '4', '5', '6', '7', '8',
  '9', '10', '11', '12', '13', '14', '15', '16',
] as const;
