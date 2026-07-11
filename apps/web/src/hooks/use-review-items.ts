'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import type { AnchorState, ThreadDto } from '@asciidocollab/shared';
import { listDocumentReviewItems } from '@/lib/api/review';
import { useFileTreeEvents } from '@/hooks/use-file-tree-events';
import { COLLAB_YTEXT_KEY } from '@/components/editor/editor-collab-extensions';
import type { ReviewAnchorRange } from '@/lib/codemirror/review-decorations';
import { resolveThreadAnchors, toReviewAnchorRanges, type ThreadAnchor } from '@/lib/review/thread-ranges';

/** True when two decoration-range lists are identical (id/from/to), so React state can be skipped. */
function rangesEqual(a: ReviewAnchorRange[], b: ReviewAnchorRange[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((range, index) => range.id === b[index].id && range.from === b[index].from && range.to === b[index].to);
}

/** True when a resolved-anchor list yields the same per-root state map as `previous`. */
function anchorStatesEqual(previous: Map<string, AnchorState>, anchors: ThreadAnchor[]): boolean {
  if (previous.size !== anchors.length) return false;
  return anchors.every((anchor) => previous.get(anchor.id) === anchor.state);
}

/** Inputs for {@link useReviewItems}. */
export interface UseReviewItemsOptions {
  /** The owning project id. */
  projectId: string;
  /** The document whose review threads to load. */
  documentId: string;
  /** The live shared Y.Doc backing the editor, or null before the collab doc is ready. */
  ydoc: Y.Doc | null;
  /** When false, the hook fetches nothing and resolves no ranges (defaults to true). */
  enabled?: boolean;
  /**
   * Initial value for whether resolved items are fetched (defaults to false). The layout's shared
   * instance passes true so the editor has anchor ranges for resolved passages — otherwise navigating
   * to a resolved thread (reachable via the rail's "All"/"Tasks" filter and the Reopen affordance)
   * would set the active id but find no range to scroll to.
   */
  includeResolved?: boolean;
  /**
   * Optional structural fallback: resolves a section symbol id to its live offset range so an item
   * whose passage was deleted can degrade to `section` rather than `detached` (T040). Left undefined
   * by default; the editor-wiring task injects the document's section resolver.
   *
   * @param sectionId - The enclosing section symbol id stored on the anchor.
   * @returns The section's live `[from, to)` offsets, or null when it no longer exists.
   */
  findSectionRange?: (sectionId: string) => { from: number; to: number } | null;
}

/** The live review state for a document: threads, their resolved decoration ranges, and controls. */
export interface UseReviewItemsResult {
  /** The document's review threads (root + replies) as loaded from the server. */
  threads: ThreadDto[];
  /** The resolved decoration ranges (unresolvable anchors are omitted) for the highlight layer. */
  ranges: ReviewAnchorRange[];
  /**
   * Per-thread anchor {@link AnchorState}, keyed by the root item id (T040). A `located` item sits in
   * the rail with a highlight, a `section` item shows an "on this section" indicator, and a
   * `detached` item surfaces in the {@link DetachedTray}. A missing key (for example, before the doc
   * is ready) means the item has not been resolved yet.
   */
  anchorStates: Map<string, AnchorState>;
  /** True while a fetch is in flight. */
  loading: boolean;
  /** The last fetch error, or null. */
  error: Error | null;
  /** Re-fetches the document's threads (for example, after a mutation). */
  refetch: () => void;
  /** Whether resolved items are included in the fetched threads. */
  includeResolved: boolean;
  /**
   * Toggles inclusion of resolved items (triggers a re-fetch).
   *
   * @param value - True to include resolved items in the fetched threads.
   */
  setIncludeResolved: (value: boolean) => void;
}

/**
 * Loads a document's review threads and keeps their anchor-resolved ranges in sync with the live
 * document. It fetches via {@link listDocumentReviewItems}, resolves each root anchor against the
 * shared `Y.Text` with {@link resolveThreadRanges}, re-fetches when a `review-items-changed` SSE
 * signal for THIS document arrives (via {@link useFileTreeEvents}), and re-resolves the ranges on
 * every Yjs transaction so highlights follow collaborators' edits between fetches.
 *
 * @param options - The project/document ids, the live Y.Doc, and an optional `enabled` gate.
 * @returns The live threads, decoration ranges, loading/error state, and re-fetch/filter controls.
 */
export function useReviewItems(options: UseReviewItemsOptions): UseReviewItemsResult {
  const { projectId, documentId, ydoc, enabled = true, findSectionRange } = options;

  // Ref-held so the fetch reads it live without re-subscribing; seeds the includeResolved state below.
  const initialIncludeResolvedReference = useRef(options.includeResolved ?? false);

  const [threads, setThreads] = useState<ThreadDto[]>([]);
  const [ranges, setRanges] = useState<ReviewAnchorRange[]>([]);
  const [anchorStates, setAnchorStates] = useState<Map<string, AnchorState>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [includeResolved, setIncludeResolved] = useState(initialIncludeResolvedReference.current);

  // The latest threads, read by the Yjs observer without re-subscribing on every fetch.
  const threadsReference = useRef<ThreadDto[]>([]);
  // The last pushed ranges, so an unchanged recompute (editing far from any anchor) skips setState —
  // avoiding a re-render and a redundant decoration-effect dispatch on every keystroke.
  const rangesReference = useRef<ReviewAnchorRange[]>([]);
  // Monotonic request id so a slow in-flight fetch never overwrites a newer one.
  const requestIdReference = useRef(0);

  /**
   * Resolves `list`'s anchors against the current doc (with quote/section degradation) and pushes
   * both the decoration ranges and the per-thread {@link AnchorState} map to state — but only when
   * they actually changed, so a keystroke away from any passage is a cheap no-op.
   */
  const recomputeRanges = useCallback(
    (list: ThreadDto[]) => {
      if (!ydoc) {
        if (rangesReference.current.length > 0) {
          rangesReference.current = [];
          setRanges([]);
          setAnchorStates(new Map());
        }
        return;
      }
      const ytext = ydoc.getText(COLLAB_YTEXT_KEY);
      const anchors = resolveThreadAnchors(list, ytext, ydoc, {
        documentText: ytext.toString(),
        findSectionRange,
      });
      const nextRanges = toReviewAnchorRanges(anchors);
      if (!rangesEqual(rangesReference.current, nextRanges)) {
        rangesReference.current = nextRanges;
        setRanges(nextRanges);
      }
      setAnchorStates((previous) =>
        anchorStatesEqual(previous, anchors) ? previous : new Map(anchors.map((anchor) => [anchor.id, anchor.state])),
      );
    },
    [ydoc, findSectionRange],
  );

  const fetchThreads = useCallback(async () => {
    if (!enabled || !projectId || !documentId) return;
    const requestId = ++requestIdReference.current;
    setLoading(true);
    setError(null);
    try {
      const result = await listDocumentReviewItems(projectId, documentId, { includeResolved });
      if (requestId !== requestIdReference.current) return; // A newer fetch superseded this one.
      threadsReference.current = result;
      setThreads(result);
      recomputeRanges(result);
    } catch (error_) {
      if (requestId !== requestIdReference.current) return;
      setError(error_ instanceof Error ? error_ : new Error('Failed to load review items'));
    } finally {
      if (requestId === requestIdReference.current) setLoading(false);
    }
  }, [enabled, projectId, documentId, includeResolved, recomputeRanges]);

  // On a document (or project) switch, immediately drop the previous document's threads/ranges so its
  // anchors are never painted against the newly-opened document while the fresh fetch is in flight.
  useEffect(() => {
    threadsReference.current = [];
    rangesReference.current = [];
    setThreads([]);
    setRanges([]);
    setAnchorStates(new Map());
  }, [projectId, documentId]);

  // Initial load and re-load whenever the identity/filter/gate changes.
  useEffect(() => {
    void fetchThreads();
  }, [fetchThreads]);

  // Re-fetch when this document's review items change on the SSE stream.
  useFileTreeEvents(projectId, {
    onReviewItemsChanged: (event) => {
      // A null documentId is a project-wide broadcast (e.g. the owner cleared every document); refetch
      // on that as well as on a change to THIS document.
      if (event.documentId === null || event.documentId === documentId) void fetchThreads();
    },
  });

  // Re-resolve anchors as the document changes so highlights track live edits between fetches.
  // Coalesced with requestAnimationFrame so a burst of transactions (fast typing, a remote paste)
  // triggers at most one re-resolve per frame instead of one per keystroke.
  useEffect(() => {
    if (!enabled || !ydoc) return;
    const ytext = ydoc.getText(COLLAB_YTEXT_KEY);
    let frame: number | null = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        recomputeRanges(threadsReference.current);
      });
    };
    ytext.observe(schedule);
    recomputeRanges(threadsReference.current); // Resolve against the doc as it stands now.
    return () => {
      ytext.unobserve(schedule);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [enabled, ydoc, recomputeRanges]);

  const refetch = useCallback(() => {
    void fetchThreads();
  }, [fetchThreads]);

  return { threads, ranges, anchorStates, loading, error, refetch, includeResolved, setIncludeResolved };
}
