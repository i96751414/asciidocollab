'use client';
import { useState, useCallback } from 'react';
import type React from 'react';
import { useFindInTree } from './use-find-in-tree';
import type { FileTreeNode } from '@/components/file-tree/types';

const EMPTY_BINDINGS = new Map<string, string>();

function matchKeyCombo(event: React.KeyboardEvent, combo: string): boolean {
  const parts = combo.split('+');
  const key = parts.at(-1) ?? '';
  return event.key.toLowerCase() === key.toLowerCase()
    && event.ctrlKey === parts.includes('Ctrl')
    && event.metaKey === parts.includes('Meta')
    && event.shiftKey === parts.includes('Shift')
    && event.altKey === parts.includes('Alt');
}

function collectFolderIds(node: FileTreeNode): string[] {
  return node.children.flatMap((child) =>
    child.type === 'folder' ? [child.id, ...collectFolderIds(child)] : [],
  );
}

function findAncestors(node: FileTreeNode, targetId: string): string[] | null {
  for (const child of node.children) {
    if (child.id === targetId) return [];
    if (child.type === 'folder') {
      const result = findAncestors(child, targetId);
      if (result !== null) return [child.id, ...result];
    }
  }
  return null;
}

interface FileTreeUIState {
  expandedState: Map<string, boolean>;
  toggleExpand: (nodeId: string) => void;
  collapseAll: () => void;
  expandAll: () => void;
  revealSelected: (nodeId: string) => void;
  operationError: string | null;
  setOperationError: (error: string | null) => void;
  findOpen: boolean;
  openFind: () => void;
  find: ReturnType<typeof useFindInTree>;
  handleKeyDown: (event: React.KeyboardEvent) => void;
  handleDismissFind: () => void;
  handleNext: () => void;
  handlePrevious: () => void;
  handleQueryChange: (q: string) => void;
}

/**
 * Encapsulates all UI interaction state for the file tree panel:
 * expand/collapse, operation errors, and the find session.
 * Extracted from FileTree to keep the component focused on fetch + render.
 */
export function useFileTreeUIState(
  tree: FileTreeNode | null,
  onSelectFile: (nodeId: string, nodeName: string, nodePath: string, nodeType: 'file' | 'folder') => void,
  bindings: Map<string, string> = EMPTY_BINDINGS,
): FileTreeUIState {
  const [expandedState, setExpandedStateRaw] = useState<Map<string, boolean>>(new Map());
  const [operationError, setOperationError] = useState<string | null>(null);
  const [findOpen, setFindOpen] = useState(false);

  const toggleExpand = useCallback((nodeId: string) => {
    setExpandedStateRaw((previous) => {
      const next = new Map(previous);
      next.set(nodeId, !previous.get(nodeId));
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedStateRaw(new Map());
  }, []);

  const expandAll = useCallback(() => {
    if (!tree) return;
    const folderIds = collectFolderIds(tree);
    setExpandedStateRaw(new Map(folderIds.map((nodeId) => [nodeId, true])));
  }, [tree]);

  const revealSelected = useCallback((nodeId: string) => {
    if (!tree) return;
    const ancestors = findAncestors(tree, nodeId) ?? [];
    // Root-level nodes have no ancestors to expand; callers are still responsible for scrolling.
    if (ancestors.length === 0) return;
    setExpandedStateRaw((previous) => {
      const next = new Map(previous);
      for (const ancestorId of ancestors) next.set(ancestorId, true);
      return next;
    });
  }, [tree]);

  const find = useFindInTree(tree, expandedState, setExpandedStateRaw);

  const openFind = useCallback(() => setFindOpen(true), []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    const customFindCombo = bindings.get('file-tree:find');
    const isFind = customFindCombo
      ? matchKeyCombo(event, customFindCombo)
      : (event.ctrlKey || event.metaKey) && event.key === 'f';
    if (isFind) {
      event.preventDefault();
      setFindOpen(true);
    }
    if (event.key === 'Escape' && findOpen) {
      find.dismiss();
      setFindOpen(false);
    }
  }, [bindings, findOpen, find]);

  const handleDismissFind = useCallback(() => {
    find.dismiss();
    setFindOpen(false);
  }, [find]);

  const handleNext = useCallback(() => {
    const node = find.nextMatch();
    if (node) {
      onSelectFile(node.id, node.name, node.path, node.type);
    }
  }, [find, onSelectFile]);

  const handlePrevious = useCallback(() => {
    const node = find.prevMatch();
    if (node) {
      onSelectFile(node.id, node.name, node.path, node.type);
    }
  }, [find, onSelectFile]);

  // Updating the query does not auto-open a file; use next/prev navigation for that.
  const handleQueryChange = useCallback((q: string) => {
    find.setQuery(q);
  }, [find]);

  return {
    expandedState,
    toggleExpand,
    collapseAll,
    expandAll,
    revealSelected,
    operationError,
    setOperationError,
    findOpen,
    openFind,
    find,
    handleKeyDown,
    handleDismissFind,
    handleNext,
    handlePrevious,
    handleQueryChange,
  };
}
