'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { FileTreeNode } from '@/components/file-tree/types';

interface FindMatch {
  node: FileTreeNode;
  ancestorIds: string[];
}

function buildMatchList(tree: FileTreeNode | null, query: string): FindMatch[] {
  if (!tree || !query) return [];

  const matches: FindMatch[] = [];
  const lowerQuery = query.toLowerCase();
  const rootId = tree.id;

  function dfs(node: FileTreeNode, ancestors: string[]): void {
    if (node.type === 'file' && node.name.toLowerCase().includes(lowerQuery)) {
      matches.push({ node, ancestorIds: ancestors });
    }
    for (const child of node.children) {
      dfs(child, node.type === 'folder' && node.id !== rootId ? [...ancestors, node.id] : ancestors);
    }
  }

  // Start DFS from root's children so root itself isn't a "match" candidate
  for (const child of tree.children) {
    dfs(child, []);
  }

  return matches;
}

interface UseFindInTreeReturn {
  query: string;
  setQuery: (q: string) => void;
  matchCount: number;
  currentMatchIndex: number;
  currentMatch: FileTreeNode | null;
  /** Advances to the next match and returns its node — callers must use the return value for onSelectFile. */
  nextMatch: () => FileTreeNode | null;
  /** Advances to the previous match and returns its node — callers must use the return value for onSelectFile. */
  prevMatch: () => FileTreeNode | null;
  dismiss: () => void;
}

/**
 * Owns find-session state: query, match list, current index, and pre-search expand snapshot.
 * The hook holds full write access to expandedState during an active find session.
 */
export function useFindInTree(
  tree: FileTreeNode | null,
  expandedState: Map<string, boolean>,
  setExpandedState: (s: Map<string, boolean>) => void,
): UseFindInTreeReturn {
  const [query, setQueryState] = useState('');
  const [matches, setMatches] = useState<FindMatch[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const preSearchSnapshot = useRef<Map<string, boolean> | null>(null);

  // Refs keep callbacks and state current without causing useEffect dep-array instability
  const expandedStateReference = useRef(expandedState);
  expandedStateReference.current = expandedState;

  const setExpandedStateReference = useRef(setExpandedState);
  setExpandedStateReference.current = setExpandedState;

  const expandAncestors = useCallback((ancestorIds: string[]) => {
    if (ancestorIds.length === 0) return;
    const newEntries: Array<[string, boolean]> = ancestorIds.map((id) => [id, true]);
    setExpandedStateReference.current(new Map([...expandedStateReference.current, ...newEntries]));
  }, []); // stable: reads current values via refs, no prop closures

  // Rebuild match list when tree or query changes
  useEffect(() => {
    if (!query) {
      setMatches([]);
      setCurrentIndex(-1);
      return;
    }
    const newMatches = buildMatchList(tree, query);
    setMatches(newMatches);

    if (newMatches.length === 0) {
      setCurrentIndex(-1);
      return;
    }

    // If the current match still exists in the new list, stay on it; otherwise go to index 0
    const currentMatch = matches[currentIndex];
    const stillExistsAt = currentMatch
      ? newMatches.findIndex((m) => m.node.id === currentMatch.node.id)
      : -1;
    const nextIndex = Math.max(stillExistsAt, 0);
    setCurrentIndex(nextIndex);
    expandAncestors(newMatches[nextIndex].ancestorIds);
  }, [tree, query, expandAncestors]); // matches/currentIndex intentionally omitted to avoid rebuild loops

  const setQuery = useCallback((q: string) => {
    if (q && !preSearchSnapshot.current) {
      preSearchSnapshot.current = new Map(expandedStateReference.current);
    }
    // Snapshot is intentionally kept when query is cleared so that dismiss() can still restore.
    setQueryState(q);
  }, []);

  const nextMatch = useCallback((): FileTreeNode | null => {
    if (matches.length === 0) return null;
    const nextIndex = (currentIndex + 1) % matches.length;
    setCurrentIndex(nextIndex);
    expandAncestors(matches[nextIndex].ancestorIds);
    return matches[nextIndex].node;
  }, [matches, currentIndex, expandAncestors]);

  const previousMatch = useCallback((): FileTreeNode | null => {
    if (matches.length === 0) return null;
    const previousIndex = (currentIndex - 1 + matches.length) % matches.length;
    setCurrentIndex(previousIndex);
    expandAncestors(matches[previousIndex].ancestorIds);
    return matches[previousIndex].node;
  }, [matches, currentIndex, expandAncestors]);

  const dismiss = useCallback(() => {
    if (preSearchSnapshot.current) {
      setExpandedStateReference.current(new Map(preSearchSnapshot.current));
      preSearchSnapshot.current = null;
    }
    setQueryState('');
    setMatches([]);
    setCurrentIndex(-1);
  }, []);

  return {
    query,
    setQuery,
    matchCount: matches.length,
    currentMatchIndex: currentIndex,
    currentMatch: matches[currentIndex]?.node ?? null,
    nextMatch,
    prevMatch: previousMatch,
    dismiss,
  };
}
