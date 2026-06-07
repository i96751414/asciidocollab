import * as collection from '@dicebear/collection';

/** A single entry in the DiceBear style catalogue. */
export interface DiceBearStyleEntry {
  /** DiceBear style module compatible with `createAvatar()`. */
  style: Parameters<typeof import('@dicebear/core').createAvatar>[0];
  /** Human-readable label displayed in the avatar picker. */
  label: string;
}

export const DICEBEAR_STYLES: Record<string, DiceBearStyleEntry> = {
  'initial-face': { style: collection.initials, label: 'Initials' },
  'bottts': { style: collection.bottts, label: 'Bottts' },
  'pixel-art': { style: collection.pixelArt, label: 'Pixel Art' },
  'fun-emoji': { style: collection.funEmoji, label: 'Fun Emoji' },
  'lorelei': { style: collection.lorelei, label: 'Lorelei' },
  'adventurer': { style: collection.adventurer, label: 'Adventurer' },
  'shapes': { style: collection.shapes, label: 'Shapes' },
  'identicon': { style: collection.identicon, label: 'Identicon' },
};

/** Union type of all supported DiceBear style keys. */
export type AvatarStyleKey = keyof typeof DICEBEAR_STYLES;

export const DEFAULT_AVATAR_STYLE: AvatarStyleKey = 'initial-face';
