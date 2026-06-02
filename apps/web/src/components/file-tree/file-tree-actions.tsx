'use client';
import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createFolder, createFileNode, renameFileNode, moveFileNode, deleteFileNode, FileTreeApiError } from '@/lib/api/file-tree';

interface Properties {
  projectId: string;
  fileNodeId: string;
  parentId: string;
  nodeType: 'file' | 'folder';
  nodeName: string;
  onUpdate: () => void;
}

/** Renders the context-menu action buttons (create, rename, move, delete) for a file tree node. */
export function FileTreeActions({ projectId, fileNodeId, parentId, nodeType: _nodeType, nodeName, onUpdate }: Properties) {
  const [error, setError] = useState<string | null>(null);

  const handleAction = async (action: () => Promise<void>) => {
    try {
      setError(null);
      await action();
      onUpdate();
    } catch (error_) {
      if (error_ instanceof FileTreeApiError && error_.status === 409) {
        setError('A file or folder with that name already exists.');
      } else {
        setError(error_ instanceof Error ? error_.message : 'An error occurred.');
      }
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label="actions" className="h-6 w-6 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => handleAction(async () => { await createFileNode(projectId, fileNodeId, 'new-document.adoc'); })}>
            New File
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => handleAction(async () => { await createFolder(projectId, fileNodeId, 'New Folder'); })}>
            New Folder
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => {}}>
            Upload File
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => {
            const newName = globalThis.prompt('Rename to:', nodeName);
            if (newName && newName !== nodeName) {
              handleAction(() => renameFileNode(projectId, fileNodeId, newName));
            }
          }}>
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => {
            const newParentId = globalThis.prompt('New parent folder ID:', parentId);
            if (newParentId && newParentId !== parentId) {
              handleAction(() => moveFileNode(projectId, fileNodeId, newParentId));
            }
          }}>
            Move
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onSelect={() => handleAction(() => deleteFileNode(projectId, fileNodeId))}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </>
  );
}
