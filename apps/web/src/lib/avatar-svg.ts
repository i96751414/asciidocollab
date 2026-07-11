import { Avatar as DiceBearAvatar } from '@dicebear/core';
import { DICEBEAR_STYLES, DEFAULT_AVATAR_STYLE } from '@/lib/avatars';

/** Small deterministic hash (djb2) used to namespace SVG element ids. */
export function hashToken(input: string): string {
  let hash = 5381;
  for (const character of input) {
    hash = (Math.imul(hash, 33) + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  return hash.toString(36);
}

/**
 * DiceBear derives SVG element ids from the seed, so avatars sharing inputs emit colliding ids. On one
 * page the browser resolves every `url(#id)` and `href="#id"` to the first match, so later copies render
 * with the wrong or missing mask. Suffix every id and reference with the caller's unique token to keep
 * them isolated.
 */
function namespaceSvgIds(svg: string, token: string): string {
  return svg
    .replaceAll(/ id="([^"]+)"/g, ` id="$1-${token}"`)
    .replaceAll(/href="#([^"]+)"/g, `href="#$1-${token}"`)
    .replaceAll(/url\(#([^"()]+)\)/g, `url(#$1-${token})`);
}

/**
 * Builds a DiceBear avatar SVG string for a user. The `avatarKey` may be "style" or "style:variant":
 * for seed-varied styles the variant is the seed; for "Initial Face" the variant selects the eyes while
 * the seed stays the display name so the initials persist. `uniqueToken` namespaces this render's SVG
 * ids so the same avatar drawn elsewhere on the page can't collide with it.
 *
 * @param avatarKey - The configured style/variant key, or null for the default style.
 * @param displayName - Seeds the avatar (and stays the seed for Initial Face variants).
 * @param uniqueToken - A token unique to this rendered instance, mixed into the SVG id namespace.
 * @returns The avatar as an inline SVG string sized to fill its container.
 */
export function buildAvatarSvg(avatarKey: string | null, displayName: string, uniqueToken: string): string {
  const colonIndex = avatarKey ? avatarKey.indexOf(':') : -1;
  const styleKey = colonIndex === -1 ? (avatarKey ?? DEFAULT_AVATAR_STYLE) : avatarKey!.slice(0, colonIndex);
  const variantValue = colonIndex === -1 ? null : avatarKey!.slice(colonIndex + 1);
  const entry = DICEBEAR_STYLES[styleKey] ?? DICEBEAR_STYLES[DEFAULT_AVATAR_STYLE];

  const options: Record<string, unknown> = { seed: displayName, ...entry.options };
  if (variantValue !== null) {
    // Seed variants override the seed (whole avatar changes); Initial Face variants
    // override the eyes and background, leaving the name seed so the initials persist.
    const variant = entry.variants?.find((candidate) => candidate.id === variantValue);
    if (variant) Object.assign(options, variant.options);
  }
  const rawSvg = new DiceBearAvatar(entry.style, options).toString();
  // Override SVG dimensions so the outer element controls the rendered size regardless
  // of the natural dimensions each DiceBear style produces.
  const resized = rawSvg
    .replace(/\swidth="[^"]*"/, ' width="100%"')
    .replace(/\sheight="[^"]*"/, ' height="100%"');
  return namespaceSvgIds(resized, hashToken(`${styleKey}:${variantValue ?? ''}:${displayName}:${uniqueToken}`));
}
