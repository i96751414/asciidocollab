'use client';
import { useState } from 'react';
import { ChevronRight, ChevronDown, File, Folder } from 'lucide-react';
import { cn } from '@/lib/utilities';
import { DragDropZone } from './drag-drop-zone';
import type { FileTreeNode as FileTreeNodeType } from './types';

interface Properties {
  node: FileTreeNodeType;
  depth: number;
  projectId: string;
  onSelect: (nodeId: string) => void;
  onContextMenu: (event: React.MouseEvent, nodeId: string) => void;
}

/** Renders a single file or folder node in the file tree, with expand/collapse and drag-drop support. */
export function FileTreeNode({ node, depth, projectId, onSelect, onContextMenu }: Properties) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleClick = () => {
    if (node.type === 'folder') {
      setIsExpanded((previous) => !previous);
    }
    onSelect(node.id);
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    onContextMenu(event, node.id);
  };

  const nodeContent = (
    <div
      className={cn(
        'flex items-center gap-1 py-0.5 px-2 cursor-pointer hover:bg-accent rounded-sm select-none',
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
      <span className="truncate text-sm">{node.name}</span>
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
            onSelect={onSelect}
            onContextMenu={onContextMenu}
          />
        ))}
      </DragDropZone>
    );
  }

  return nodeContent;
}
