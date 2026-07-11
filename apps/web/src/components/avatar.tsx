'use client';

import { useId, useMemo } from 'react';
import { cn } from '@/lib/utilities';
import { buildAvatarSvg } from '@/lib/avatar-svg';

interface AvatarProperties {
  avatarKey: string | null;
  displayName: string;
  size?: number;
  className?: string;
}

/**
 * Renders a DiceBear avatar SVG. The avatarKey may be "style" or "style:variant".
 * For seed-varied styles the variant is the seed; for "Initial Face" the variant
 * selects the eyes while the seed stays the display name so the initials persist.
 *
 * The SVG element ids are namespaced per instance (via {@link buildAvatarSvg}) so the *same* user's
 * avatar — which shows up in the file tree, outline, presence bar, editor caret, and their review
 * comments all at once — never collides ids with its other copies. A collision makes the browser
 * resolve every `url(#id)` to the first match, so later copies render with the wrong or missing mask
 * (a robot's sunglasses lenses coming out hollow, for example).
 */
export function Avatar({ avatarKey, displayName, size = 32, className }: AvatarProperties) {
  // Stable per-instance id (identical across a server render and its hydration) so two renders of the
  // same avatar on one page get distinct SVG element ids instead of colliding.
  const instanceId = useId();
  // Generating the DiceBear SVG (constructor + 5 regex passes + hash) is pure in its inputs, so memoize
  // it. Avatars render per review card/reply/assignee, and a single rail hover re-renders the whole
  // list — without this, every avatar's SVG is rebuilt on the main thread on each hover.
  const svg = useMemo(() => buildAvatarSvg(avatarKey, displayName, instanceId), [avatarKey, displayName, instanceId]);

  // The circular crop lives here — not at each call site — so every avatar (review comments, presence
  // bar, file-tree/outline markers, account menu) renders as the same clipped circle. Callers pass
  // only context-specific extras via `className`, such as an overlap ring.
  return (
    <span
      className={cn('inline-block shrink-0 overflow-hidden rounded-full', className)}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={/* nosemgrep: react-dangerouslysetinnerhtml -- SVG is DiceBear-generated from a fixed first-party style registry, not user HTML */ { __html: svg }}
    />
  );
}
