'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ChevronLeft } from 'lucide-react';
import { FileTreeNode } from './file-tree-node';
import { FileTreeActions } from './file-tree-actions';
import { DragDropZone } from './drag-drop-zone';
import { FindPanel } from './find-panel';
import { Button } from '@/components/ui/button';
import { useFileTreeEvents } from '@/hooks/use-file-tree-events';
import { useKeyBindings } from '@/hooks/use-key-bindings';
import { useFileTreeKeyHandler } from '@/hooks/use-file-tree-key-handler';
import { useFileTreeUIState } from '@/hooks/use-file-tree-ui-state';
import type { FileTreeNode as FileTreeNodeType } from './types';
import type { FileTreeEventDto } from '@asciidocollab/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const sortComparator = (a: FileTreeNodeType, b: FileTreeNodeType) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

function sortChildren(node: FileTreeNodeType): FileTreeNodeType {
  return {
    ...node,
    children: node.children.toSorted(sortComparator).map(sortChildren),
  };
}

interface Properties {
  projectId: string;
  canEdit: boolean;
  onSelectFile: (nodeId: string, nodeName: string, nodePath: string, nodeType: 'file' | 'folder') => void;
  selectedNodeId: string | null;
  /** When provided, renders a collapse button in the header and calls this on click. */
  onCollapse?: () => void;
}

function applyEvent(tree: FileTreeNodeType | null, event: FileTreeEventDto): FileTreeNodeType | null {
  if (!tree) return tree;

  if (event.type === 'created') {
    // Idempotency: skip if the node already exists (e.g., fetchTree beat SSE delivery)
    const hasNode = (node: FileTreeNodeType): boolean =>
      node.id === event.fileNodeId || node.children.some(hasNode);
    if (hasNode(tree)) return tree;

    const addNode = (node: FileTreeNodeType): FileTreeNodeType => {
      if (node.id === event.parentId) {
        const newNode: FileTreeNodeType = {
          id: event.fileNodeId,
          name: event.name,
          type: event.nodeType,
          path: event.path,
          parentId: event.parentId,
          children: [],
        };
        const updated = { ...node, children: [...node.children, newNode] };
        return { ...updated, children: updated.children.toSorted(sortComparator) };
      }
      return { ...node, children: node.children.map(addNode) };
    };
    return addNode(tree);
  }

  if (event.type === 'deleted') {
    const removeNode = (node: FileTreeNodeType): FileTreeNodeType => ({
      ...node,
      children: node.children
        .filter((c) => c.id !== event.fileNodeId)
        .map(removeNode),
    });
    return removeNode(tree);
  }

  if (event.type === 'renamed') {
    const renameNode = (node: FileTreeNodeType): FileTreeNodeType => {
      if (node.id === event.fileNodeId) {
        return { ...node, name: event.name, path: event.path };
      }
      const mapped = node.children.map(renameNode);
      const hasChange = mapped.some((c, index) => c !== node.children[index]);
      if (!hasChange) return node;
      return { ...node, children: mapped.toSorted(sortComparator) };
    };
    return renameNode(tree);
  }

  if (event.type === 'moved') {
    let movedNode: FileTreeNodeType | null = null;
    const removeNode = (node: FileTreeNodeType): FileTreeNodeType => ({
      ...node,
      children: node.children
        .filter((c) => {
          if (c.id === event.fileNodeId) { movedNode = { ...c, parentId: event.parentId, path: event.path }; return false; }
          return true;
        })
        .map(removeNode),
    });
    let result = removeNode(tree);
    if (movedNode) {
      const addNode = (node: FileTreeNodeType): FileTreeNodeType => {
        if (node.id === event.parentId) {
          const children = [...node.children, movedNode!].toSorted(sortComparator);
          return { ...node, children };
        }
        return { ...node, children: node.children.map(addNode) };
      };
      result = addNode(result);
    }
    return result;
  }

  return tree;
}

/** Renders the full file tree for a project, with real-time SSE updates and keyboard shortcut support. */
export function FileTree({ projectId, canEdit, onSelectFile, selectedNodeId, onCollapse }: Properties) {
  const [tree, setTree] = useState<FileTreeNodeType | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const containerReference = useRef<HTMLDivElement>(null);

  const userBindings = useKeyBindings('file-tree');
  const bindings = useMemo(() => new Map(userBindings), [userBindings]);

  const {
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
  } = useFileTreeUIState(tree, onSelectFile, bindings);

  const handleRevealFile = useCallback(() => {
    if (!selectedNodeId) return;
    revealSelected(selectedNodeId);
    setTimeout(() => {
      const element = containerReference.current?.querySelector(`[data-node-id="${selectedNodeId}"]`);
      element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 0);
  }, [selectedNodeId, revealSelected]);

  const fetchTree = useCallback(async () => {
    try {
      setFetchError(false);
      const response = await fetch(`${API_BASE}/projects/${projectId}/files`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setTree(sortChildren(data));
      } else {
        setFetchError(true);
      }
    } catch {
      setFetchError(true);
    }
  }, [projectId]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  const onEvent = useCallback((event: FileTreeEventDto) => {
    setTree((previous) => applyEvent(previous, event));
  }, []);

  const onReconnect = useCallback(() => {
    fetchTree();
  }, [fetchTree]);

  useFileTreeEvents(projectId, onEvent, onReconnect);

  const keyCallbacks = useMemo(() => ({
    'file-tree:rename': selectedNodeId ? () => {} : undefined,
    'file-tree:delete': selectedNodeId ? () => {} : undefined,
    'file-tree:new-file': selectedNodeId ? () => {} : undefined,
    'file-tree:new-folder': selectedNodeId ? () => {} : undefined,
    'file-tree:find': openFind,
  }), [selectedNodeId, openFind]);

  useFileTreeKeyHandler(containerReference, bindings, keyCallbacks);

  return (
    <div ref={containerReference} tabIndex={0} className="outline-none" onKeyDown={handleKeyDown}>
      {/* Header row: Files label + root actions (owner-only) + optional collapse button */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Files</span>
        <div className="flex items-center gap-0.5">
          {tree && canEdit && (
            <span data-testid="tree-root-actions">
              <FileTreeActions
                projectId={projectId}
                fileNodeId={tree.id}
                parentId=""
                nodeType="folder"
                nodeName="root"
                hasChildren={tree.children.length > 0}
                isRoot
                canCreate={canEdit}
                onUpdate={fetchTree}
                onError={setOperationError}
                onFind={openFind}
                onCollapseAll={collapseAll}
                onExpandAll={expandAll}
                onRevealInTree={handleRevealFile}
                hasSelection={!!selectedNodeId}
              />
            </span>
          )}
          {onCollapse && (
            <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="collapse sidebar" onClick={onCollapse}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {fetchError && (
        <div className="p-4 text-sm text-muted-foreground">
          <p>Failed to load files.</p>
          <button onClick={fetchTree} className="underline" aria-label="retry">Retry</button>
        </div>
      )}

      {!fetchError && !tree && (
        <div className="p-4 text-sm text-muted-foreground">Loading...</div>
      )}

      {tree && (
        <>
          {findOpen && (
            <FindPanel
              query={find.query}
              onQueryChange={handleQueryChange}
              matchCount={find.matchCount}
              currentMatchIndex={find.currentMatchIndex}
              onNext={handleNext}
              onPrev={handlePrevious}
              onDismiss={handleDismissFind}
            />
          )}
          {operationError && (
            <div role="alert" className="flex items-center justify-between px-2 py-1 text-xs text-destructive border-b bg-destructive/10">
              <span>{operationError}</span>
              <button onClick={() => setOperationError(null)} aria-label="dismiss error" className="ml-2 underline">Dismiss</button>
            </div>
          )}
          <DragDropZone targetFolderId={tree.id} projectId={projectId} onComplete={fetchTree} data-testid="file-tree-drop-zone">
            {tree.children.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No files yet. Create your first file.</p>
            ) : (
              tree.children.map((node) => (
                <FileTreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  projectId={projectId}
                  canEdit={canEdit}
                  selectedNodeId={selectedNodeId}
                  onSelect={onSelectFile}
                  onContextMenu={() => {}}
                  onUpdate={fetchTree}
                  onError={setOperationError}
                  isExpanded={expandedState.get(node.id) ?? false}
                  onToggle={toggleExpand}
                  expandedState={expandedState}
                />
              ))
            )}
          </DragDropZone>
        </>
      )}
    </div>
  );
}
