'use client';

import { createAvatar } from '@dicebear/core';
import { DICEBEAR_STYLES, DEFAULT_AVATAR_STYLE } from '@/lib/avatars';

interface AvatarProperties {
  avatarKey: string | null;
  displayName: string;
  size?: number;
  className?: string;
}

/** Renders a DiceBear avatar SVG. The avatarKey may be "style" or "style:seed". */
export function Avatar({ avatarKey, displayName, size = 32, className }: AvatarProperties) {
  const colonIndex = avatarKey ? avatarKey.indexOf(':') : -1;
  const styleKey = colonIndex === -1 ? (avatarKey ?? DEFAULT_AVATAR_STYLE) : avatarKey!.slice(0, colonIndex);
  const seed = colonIndex === -1 ? displayName : avatarKey!.slice(colonIndex + 1);
  const entry = DICEBEAR_STYLES[styleKey] ?? DICEBEAR_STYLES[DEFAULT_AVATAR_STYLE];
  const rawSvg = createAvatar(entry.style, { seed, ...entry.options }).toString();
  // Override SVG dimensions so the outer span controls the rendered size regardless
  // of the natural dimensions each DiceBear style produces.
  const svg = rawSvg
    .replace(/\swidth="[^"]*"/, ' width="100%"')
    .replace(/\sheight="[^"]*"/, ' height="100%"');

  return (
    <span
      className={className}
      style={{ display: 'inline-block', width: size, height: size, flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
