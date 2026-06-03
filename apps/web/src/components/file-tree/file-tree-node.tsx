'use client';
import { useState } from 'react';
import { ChevronRight, ChevronDown, File, Folder } from 'lucide-react';
import { cn } from '@/lib/utilities';
import { DragDropZone } from './drag-drop-zone';
import { FileTreeActions } from './file-tree-actions';
import type { FileTreeNode as FileTreeNodeType } from './types';

interface Properties {
  node: FileTreeNodeType;
  depth: number;
  projectId: string;
  isOwner: boolean;
  selectedNodeId: string | null;
  onSelect: (nodeId: string, nodeName: string, nodePath: string, nodeType: 'file' | 'folder') => void;
  onContextMenu: (event: React.MouseEvent, nodeId: string) => void;
}

/** Renders a single file or folder node in the file tree, with expand/collapse and drag-drop support. */
export function FileTreeNode({ node, depth, projectId, isOwner, selectedNodeId, onSelect, onContextMenu }: Properties) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleClick = () => {
    if (node.type === 'folder') {
      setIsExpanded((previous) => !previous);
    }
    onSelect(node.id, node.name, node.path, node.type);
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    onContextMenu(event, node.id);
  };

  const isSelected = node.id === selectedNodeId;
  const hasChildren = node.children.length > 0;

  const nodeContent = (
    <div
      className={cn(
        'flex items-center gap-1 py-0.5 px-2 cursor-pointer hover:bg-accent rounded-sm select-none',
        isSelected && 'bg-accent',
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {node.type === 'folder' ? (
        <>
          {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          <Folder className="h-4 w-4 shrink-0 text-primary" />
        </>
      ) : (
        <>
          <span className="w-3" />
          <File className="h-4 w-4 shrink-0 text-muted-foreground" />
        </>
      )}
      <span className="truncate text-sm flex-1">{node.name}</span>
      {isOwner && (
        <FileTreeActions
          projectId={projectId}
          fileNodeId={node.id}
          parentId={node.parentId ?? ''}
          nodeType={node.type}
          nodeName={node.name}
          hasChildren={hasChildren}
          onUpdate={() => {}}
        />
      )}
    </div>
  );

  if (node.type === 'folder') {
    return (
      <DragDropZone targetFolderId={node.id} projectId={projectId}>
        {nodeContent}
        {isExpanded && node.children.map((child) => (
          <FileTreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            projectId={projectId}
            isOwner={isOwner}
            selectedNodeId={selectedNodeId}
            onSelect={onSelect}
            onContextMenu={onContextMenu}
          />
        ))}
      </DragDropZone>
    );
  }

  return nodeContent;
}
