import initials from '@dicebear/styles/initials.json';
import initialFace from '@dicebear/styles/initial-face.json';
import botttsNeutral from '@dicebear/styles/bottts-neutral.json';
import pixelArt from '@dicebear/styles/pixel-art.json';
import funEmoji from '@dicebear/styles/fun-emoji.json';
import lorelei from '@dicebear/styles/lorelei.json';
import adventurerNeutral from '@dicebear/styles/adventurer-neutral.json';
import shapes from '@dicebear/styles/shapes.json';
import identicon from '@dicebear/styles/identicon.json';

/** Number of variant options shown per style in the picker grid. */
export const AVATAR_VARIANT_COUNT = 30;

/** Seeds used to render the variant picker grid for styles whose variety comes from the seed. */
export const AVATAR_VARIANT_SEEDS = Array.from({ length: AVATAR_VARIANT_COUNT }, (_, index) => String(index + 1));

/** The eight eye shapes the "Initial Face" style ships with; cycled across the variant grid. */
export const INITIAL_FACE_EYE_VARIANTS = [
  'variant01', 'variant02', 'variant03', 'variant04',
  'variant05', 'variant06', 'variant07', 'variant08',
] as const;

/** Deterministic HSL → `#rrggbb`. Used to spread variant colours evenly around the wheel. */
function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * value).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** One selectable option in the avatar picker grid. */
export interface AvatarVariant {
  /** Stable identifier stored after the colon in the avatarKey, e.g. "initial-face:5". */
  id: string;
  /** DiceBear options applied for this variant, merged over the style's base options. */
  options: Record<string, unknown>;
}

/** A single entry in the DiceBear style catalogue. */
export interface DiceBearStyleEntry {
  /** DiceBear v10 style definition (JSON), passed to `new Avatar(style, options)`. */
  style: object;
  /** Human-readable label displayed in the avatar picker. */
  label: string;
  /** Extra options merged into the `Avatar` constructor for this style, for example background colour. */
  options?: Record<string, unknown>;
  /** Selectable variants shown in the picker grid. Omitted for styles with no variants, for example plain Initials. */
  variants?: readonly AvatarVariant[];
}

// Some portrait styles ship without a default background, so they render almost
// invisibly against the page. Force a soft background palette so they stay legible.
const PORTRAIT_BG = { backgroundColor: ['#b6e3f4', '#c0aede', '#ffd5dc', '#d1d4f9'] };

// Random styles vary the whole avatar by changing the seed.
const SEED_VARIANTS: readonly AvatarVariant[] = AVATAR_VARIANT_SEEDS.map((seed) => ({
  id: seed,
  options: { seed },
}));

// "Initial Face" keeps the name as its seed — so the initials stay the same — and
// each variant gets its own hue: a light background with dark, saturated eyes, plus
// a cycling eye shape. Hues are spread by the golden angle so neighbours look distinct.
const EYE_VARIANTS: readonly AvatarVariant[] = Array.from({ length: AVATAR_VARIANT_COUNT }, (_, index) => {
  const hue = (index * 137.508) % 360;
  return {
    id: String(index + 1),
    options: {
      eyesVariant: INITIAL_FACE_EYE_VARIANTS[index % INITIAL_FACE_EYE_VARIANTS.length],
      eyesColor: [hslToHex(hue, 70, 32)],
      backgroundColor: [hslToHex(hue, 70, 85)],
    },
  };
});

export const DICEBEAR_STYLES: Record<string, DiceBearStyleEntry> = {
  'initials': { style: initials, label: 'Initials' },
  'initial-face': { style: initialFace, label: 'Initial Face', variants: EYE_VARIANTS },
  'bottts-neutral': { style: botttsNeutral, label: 'Bottts Neutral', variants: SEED_VARIANTS },
  'pixel-art': { style: pixelArt, label: 'Pixel Art', variants: SEED_VARIANTS },
  'fun-emoji': { style: funEmoji, label: 'Fun Emoji', variants: SEED_VARIANTS },
  'lorelei': { style: lorelei, label: 'Lorelei', options: PORTRAIT_BG, variants: SEED_VARIANTS },
  'adventurer-neutral': { style: adventurerNeutral, label: 'Adventurer Neutral', options: PORTRAIT_BG, variants: SEED_VARIANTS },
  'shapes': { style: shapes, label: 'Shapes', variants: SEED_VARIANTS },
  'identicon': { style: identicon, label: 'Identicon', variants: SEED_VARIANTS },
};

/** Union type of all supported DiceBear style keys. */
export type AvatarStyleKey = keyof typeof DICEBEAR_STYLES;

export const DEFAULT_AVATAR_STYLE: AvatarStyleKey = 'initials';
