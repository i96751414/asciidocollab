'use client';

import { createAvatar } from '@dicebear/core';
import { DICEBEAR_STYLES, DEFAULT_AVATAR_STYLE } from '@/lib/avatars';

interface AvatarProperties {
  avatarKey: string | null;
  displayName: string;
  size?: number;
  className?: string;
}

/** Renders a DiceBear avatar SVG. avatarKey may be "style" or "style:seed". */
export function Avatar({ avatarKey, displayName, size = 32, className }: AvatarProperties) {
  const colonIdx = avatarKey ? avatarKey.indexOf(':') : -1;
  const styleKey = colonIdx === -1 ? (avatarKey ?? DEFAULT_AVATAR_STYLE) : avatarKey!.slice(0, colonIdx);
  const seed = colonIdx === -1 ? displayName : avatarKey!.slice(colonIdx + 1);
  const entry = DICEBEAR_STYLES[styleKey] ?? DICEBEAR_STYLES[DEFAULT_AVATAR_STYLE];
  const svg = createAvatar(entry.style, { seed, size, ...(entry.options ?? {}) }).toString();

  return (
    <span
      className={className}
      style={{ display: 'inline-block', width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
