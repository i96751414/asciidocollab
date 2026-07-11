/**
 * Pure anchor-resolution helper shared by {@link useReviewItems}: turns each review thread's root
 * anchor into a live document offset range via {@link resolveAnchor}. Kept free of React and the
 * network layer so it stays independently unit-testable against a real `Y.Doc`/`Y.Text`.
 */

import * as Y from 'yjs';
import type { AnchorState, ThreadDto } from '@asciidocollab/shared';
import type { ReviewAnchorRange } from '@/lib/codemirror/review-decorations';
import { resolveAnchor, resolveAnchorWithDegradation, type DegradationOptions } from './anchor';

/** One thread's id paired with its resolved passage range, or `null` when it cannot be resolved. */
export interface ThreadRange {
  /** The root review item id. */
  id: string;
  /** The resolved `[from, to)` offsets, or `null` when the anchor is absent/unresolvable. */
  range: { from: number; to: number } | null;
}

/** A thread's resolved range together with the degradation {@link AnchorState} that produced it (T040). */
export interface ThreadAnchor extends ThreadRange {
  /** How the range resolved: `located` (passage), `section` (structural), `detached` (lost). */
  state: AnchorState;
}

/**
 * Resolves each thread's root anchor against the live `ytext`/`ydoc`, returning a parallel entry per
 * thread whose `range` is `null` when the root carries no anchor or its relative position no longer
 * resolves. Order matches the input `threads`. This is the primary-path resolver; use
 * {@link resolveThreadAnchors} when the caller also needs the per-thread {@link AnchorState}.
 */
export function resolveThreadRanges(threads: ThreadDto[], ytext: Y.Text, ydoc: Y.Doc): ThreadRange[] {
  return threads.map((thread) => {
    const anchor = thread.root.anchor;
    const range = anchor ? resolveAnchor(anchor, ytext, ydoc) : null;
    return { id: thread.root.id, range };
  });
}

/**
 * Resolves each thread's root anchor with graceful degradation via
 * {@link resolveAnchorWithDegradation}, surfacing both the live range and its
 * {@link AnchorState} (`located` / `section` / `detached`, T040). A root with no anchor is treated
 * as `detached` with a `null` range. `options` supplies the optional text-quote (`documentText`)
 * and section (`findSectionRange`) fallback tiers. Order matches the input `threads`.
 */
export function resolveThreadAnchors(
  threads: ThreadDto[],
  ytext: Y.Text,
  ydoc: Y.Doc,
  options: DegradationOptions = {},
): ThreadAnchor[] {
  return threads.map((thread): ThreadAnchor => {
    const anchor = thread.root.anchor;
    if (!anchor) return { id: thread.root.id, range: null, state: 'detached' };
    const resolution = resolveAnchorWithDegradation(anchor, ytext, ydoc, options);
    return { id: thread.root.id, range: resolution.range, state: resolution.state };
  });
}

/** Projects the resolved thread ranges to the decoration layer's {@link ReviewAnchorRange} list (nulls dropped). */
export function toReviewAnchorRanges(threadRanges: ThreadRange[]): ReviewAnchorRange[] {
  const ranges: ReviewAnchorRange[] = [];
  for (const { id, range } of threadRanges) {
    if (range) ranges.push({ id, from: range.from, to: range.to });
  }
  return ranges;
}
