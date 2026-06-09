'use client';

import { Avatar as DiceBearAvatar } from '@dicebear/core';
import { DICEBEAR_STYLES, DEFAULT_AVATAR_STYLE } from '@/lib/avatars';

interface AvatarProperties {
  avatarKey: string | null;
  displayName: string;
  size?: number;
  className?: string;
}

/** Small deterministic hash (djb2) used to namespace SVG element ids. */
function hashToken(input: string): string {
  let hash = 5381;
  for (const character of input) {
    hash = (Math.imul(hash, 33) + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  return hash.toString(36);
}

/**
 * DiceBear derives SVG element ids from the seed, so two avatars sharing a seed
 * emit colliding ids — every Initial Face tile in the picker uses the same name,
 * for example. On one page the browser then resolves every `url(#id)` and
 * `href="#id"` to the first match, making all such avatars render identically.
 * Suffix every id and reference with a token unique to this avatar's inputs to
 * keep them isolated. The token is deterministic, so server and client markup stay in sync.
 */
function namespaceSvgIds(svg: string, token: string): string {
  return svg
    .replaceAll(/ id="([^"]+)"/g, ` id="$1-${token}"`)
    .replaceAll(/href="#([^"]+)"/g, `href="#$1-${token}"`)
    .replaceAll(/url\(#([^"]+)\)/g, `url(#$1-${token})`);
}

/**
 * Renders a DiceBear avatar SVG. The avatarKey may be "style" or "style:variant".
 * For seed-varied styles the variant is the seed; for "Initial Face" the variant
 * selects the eyes while the seed stays the display name so the initials persist.
 */
export function Avatar({ avatarKey, displayName, size = 32, className }: AvatarProperties) {
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
  // Override SVG dimensions so the outer span controls the rendered size regardless
  // of the natural dimensions each DiceBear style produces.
  const resized = rawSvg
    .replace(/\swidth="[^"]*"/, ' width="100%"')
    .replace(/\sheight="[^"]*"/, ' height="100%"');
  // Isolate this avatar's ids so multiple same-seed avatars on a page don't collide.
  const svg = namespaceSvgIds(resized, hashToken(`${styleKey}:${variantValue ?? ''}:${displayName}`));

  return (
    <span
      className={className}
      style={{ display: 'inline-block', width: size, height: size, flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
