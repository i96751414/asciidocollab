'use client';

import { createAvatar } from '@dicebear/core';
import { DICEBEAR_STYLES, DEFAULT_AVATAR_STYLE } from '@/lib/avatars';

interface AvatarProperties {
  avatarKey: string | null;
  displayName: string;
  size?: number;
  className?: string;
}

/** Renders a DiceBear avatar SVG or a fallback initials circle. */
export function Avatar({ avatarKey, displayName, size = 32, className }: AvatarProperties) {
  const entry = (avatarKey && DICEBEAR_STYLES[avatarKey]) ? DICEBEAR_STYLES[avatarKey] : DICEBEAR_STYLES[DEFAULT_AVATAR_STYLE];
  const svg = createAvatar(entry.style, { seed: displayName, size }).toString();

  return (
    <span
      className={className}
      style={{ display: 'inline-block', width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
