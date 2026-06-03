'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { FileTreeNode } from './file-tree-node';
import { DragDropZone } from './drag-drop-zone';
import { useFileTreeEvents } from '@/hooks/use-file-tree-events';
import { useKeyBindings } from '@/hooks/use-key-bindings';
import { useFileTreeKeyHandler } from '@/hooks/use-file-tree-key-handler';
import type { FileTreeNode as FileTreeNodeType } from './types';
import type { FileTreeEventDto } from '@asciidocollab/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Properties {
  projectId: string;
  isOwner: boolean;
  onSelectFile: (nodeId: string, nodeName: string, nodePath: string, nodeType: 'file' | 'folder') => void;
  selectedNodeId: string | null;
}

function applyEvent(tree: FileTreeNodeType | null, event: FileTreeEventDto): FileTreeNodeType | null {
  if (!tree) return tree;

  if (event.type === 'created') {
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
        return { ...node, children: [...node.children, newNode] };
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
      return { ...node, children: node.children.map(renameNode) };
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
          return { ...node, children: [...node.children, movedNode!] };
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
export function FileTree({ projectId, isOwner, onSelectFile, selectedNodeId }: Properties) {
  const [tree, setTree] = useState<FileTreeNodeType | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const containerReference = useRef<HTMLDivElement>(null);

  const fetchTree = useCallback(async () => {
    try {
      setFetchError(false);
      const response = await fetch(`${API_BASE}/projects/${projectId}/files`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setTree(data);
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

  const bindings = useKeyBindings('file-tree');
  useFileTreeKeyHandler(containerReference, selectedNodeId, bindings, {
    onRename: useCallback(() => {}, []),
    onDelete: useCallback(() => {}, []),
    onNewFile: useCallback(() => {}, []),
    onNewFolder: useCallback(() => {}, []),
  });

  if (fetchError) return (
    <div className="p-4 text-sm text-muted-foreground">
      <p>Failed to load files.</p>
      <button onClick={fetchTree} className="underline" aria-label="retry">Retry</button>
    </div>
  );

  if (!tree) return <div className="p-4 text-sm text-muted-foreground">Loading...</div>;

  const rootId = tree.id;

  return (
    <div ref={containerReference} tabIndex={0} className="outline-none">
      <DragDropZone targetFolderId={rootId} projectId={projectId}>
        {tree.children.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No files yet. Create your first file.</p>
        ) : (
          tree.children.map((node) => (
            <FileTreeNode
              key={node.id}
              node={node}
              depth={0}
              projectId={projectId}
              isOwner={isOwner}
              selectedNodeId={selectedNodeId}
              onSelect={onSelectFile}
              onContextMenu={() => {}}
            />
          ))
        )}
      </DragDropZone>
    </div>
  );
}
