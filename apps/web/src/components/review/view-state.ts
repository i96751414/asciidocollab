'use client';

import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * The tiny shared view-state that links the comment rail to the editor's review
 * decorations. Two independent signals drive FR-028 (hover emphasis) and FR-005
 * (active-thread focus): the id of the item currently hovered anywhere in the
 * review UI, and the id of the thread the user has focused. Both are `null` when
 * nothing is hovered/active. This module is presentational plumbing only — it owns
 * no data and performs no fetching.
 */
export interface ReviewViewState {
  /** The item id currently hovered (rail card or editor highlight), or null. */
  hoveredItemId: string | null;
  /**
   * Sets (or clears with null) the hovered item id.
   *
   * @param id - The item id to mark hovered, or null to clear it.
   */
  setHoveredItemId: (id: string | null) => void;
  /** The root id of the focused thread, or null when none is active. */
  activeThreadId: string | null;
  /**
   * Sets (or clears with null) the active thread's root id.
   *
   * @param id - The thread root id to activate, or null to clear it.
   */
  setActiveThreadId: (id: string | null) => void;
}

const ReviewViewStateContext = createContext<ReviewViewState | null>(null);

/**
 * Provides a live {@link ReviewViewState} to its subtree. Mount this ABOVE both the
 * comment rail and the editor so hovering a card can emphasise the matching editor
 * highlight and vice-versa. Self-contained: it owns the hovered/active state itself.
 */
export function ReviewViewStateProvider({ children }: { children: ReactNode }) {
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const value = useMemo<ReviewViewState>(
    () => ({ hoveredItemId, setHoveredItemId, activeThreadId, setActiveThreadId }),
    [hoveredItemId, activeThreadId],
  );
  return createElement(ReviewViewStateContext.Provider, { value }, children);
}

/**
 * Reads the ambient {@link ReviewViewState}, throwing when no
 * {@link ReviewViewStateProvider} is mounted above. Use this from components that
 * are always rendered inside the provider.
 */
export function useReviewViewState(): ReviewViewState {
  const context = useContext(ReviewViewStateContext);
  if (!context) {
    throw new Error('useReviewViewState must be used within a ReviewViewStateProvider');
  }
  return context;
}

/**
 * Reads the ambient {@link ReviewViewState}, returning `null` (instead of throwing)
 * when no provider is mounted. The comment rail uses this so it can pick up
 * editor-linked view-state when present but still render standalone (for example,
 * in tests or before the wiring task mounts the provider).
 */
export function useReviewViewStateOptional(): ReviewViewState | null {
  return useContext(ReviewViewStateContext);
}
