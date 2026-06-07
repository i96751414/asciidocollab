'use client';
import { ChevronRight, ChevronDown, File, Folder } from 'lucide-react';
import { cn } from '@/lib/utilities';
import { DragDropZone } from './drag-drop-zone';
import { FileTreeActions } from './file-tree-actions';
import type { FileTreeNode as FileTreeNodeType } from './types';

interface Properties {
  node: FileTreeNodeType;
  depth: number;
  projectId: string;
  canEdit: boolean;
  selectedNodeId: string | null;
  onSelect: (nodeId: string, nodeName: string, nodePath: string, nodeType: 'file' | 'folder') => void;
  onContextMenu: (event: React.MouseEvent, nodeId: string) => void;
  onUpdate?: () => void;
  onError?: (message: string | null) => void;
  isExpanded?: boolean;
  onToggle?: (nodeId: string) => void;
  expandedState?: Map<string, boolean>;
}

/** Renders a single file or folder node in the file tree, with expand/collapse and drag-drop support. */
export function FileTreeNode({ node, depth, projectId, canEdit, selectedNodeId, onSelect, onContextMenu, onUpdate, onError, isExpanded = false, onToggle, expandedState }: Properties) {
  const handleClick = () => {
    if (node.type === 'folder') {
      onToggle?.(node.id);
    } else {
      onSelect(node.id, node.name, node.path, node.type);
    }
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    onContextMenu(event, node.id);
  };

  const isSelected = node.id === selectedNodeId;
  const hasChildren = node.children.length > 0;

  const nodeContent = (
    <div
      data-testid={`tree-node-${node.name}`}
      data-node-id={node.id}
      className={cn(
        'group flex items-center gap-1 py-0.5 px-2 cursor-pointer hover:bg-accent rounded-sm select-none',
        isSelected && 'bg-accent',
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {node.type === 'folder' ? (
        <>
          {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <Folder className="h-4 w-4 shrink-0 text-primary" />
        </>
      ) : (
        <>
          <span className="w-4" />
          <File className="h-4 w-4 shrink-0 text-muted-foreground" />
        </>
      )}
      <span className="truncate text-sm flex-1">{node.name}</span>
      {canEdit && (
        <span className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 shrink-0">
          <FileTreeActions
            projectId={projectId}
            fileNodeId={node.id}
            parentId={node.parentId ?? ''}
            nodeType={node.type}
            nodeName={node.name}
            hasChildren={hasChildren}
            canCreate={node.type === 'folder'}
            onUpdate={onUpdate}
            onError={onError}
          />
        </span>
      )}
    </div>
  );

  if (node.type === 'folder') {
    return (
      <DragDropZone targetFolderId={node.id} projectId={projectId} onComplete={onUpdate}>
        {nodeContent}
        {isExpanded && node.children.map((child) => (
          <FileTreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            projectId={projectId}
            canEdit={canEdit}
            selectedNodeId={selectedNodeId}
            onSelect={onSelect}
            onContextMenu={onContextMenu}
            onUpdate={onUpdate}
            onError={onError}
            isExpanded={expandedState?.get(child.id) ?? false}
            onToggle={onToggle}
            expandedState={expandedState}
          />
        ))}
      </DragDropZone>
    );
  }

  return nodeContent;
}
