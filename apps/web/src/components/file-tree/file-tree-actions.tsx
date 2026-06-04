'use client';
import { useState } from 'react';
import {
  MoreHorizontal,
  Search,
  FilePlus,
  FolderPlus,
  Pencil,
  Trash2,
  FoldVertical,
  UnfoldVertical,
  LocateFixed,
} from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmationDialog } from '@/components/confirmation-dialog';
import { createFolder, createFileNode, renameFileNode, deleteFileNode, FileTreeApiError } from '@/lib/api/file-tree';

type DialogKind =
  | { type: 'rename'; currentName: string }
  | { type: 'delete' }
  | { type: 'create-file' }
  | { type: 'create-folder' }
  | null;

interface Properties {
  projectId: string;
  fileNodeId: string;
  parentId: string;
  nodeType: 'file' | 'folder';
  nodeName: string;
  hasChildren: boolean;
  onUpdate?: () => void;
  onError?: (message: string | null) => void;
  /** When true, hides Rename and Delete — used for the root folder. */
  isRoot?: boolean;
  /** When true, shows New File and New Folder — pass only for owners. */
  canCreate?: boolean;
  /** When provided, shows a "Find File…" item at the top of the menu. */
  onFind?: () => void;
  /** When provided, shows a "Collapse All" item. */
  onCollapseAll?: () => void;
  /** When provided, shows an "Expand All" item. */
  onExpandAll?: () => void;
  /** When provided, shows a "Reveal in Tree" item. */
  onRevealInTree?: () => void;
  /** Controls whether "Reveal in Tree" is enabled (requires a selected file). */
  hasSelection?: boolean;
}

/** Renders the context-menu action buttons (create, rename, delete, tree navigation) for a file tree node. */
export function FileTreeActions({
  projectId, fileNodeId, nodeType, nodeName, hasChildren,
  onUpdate, onError, isRoot = false, canCreate = false,
  onFind, onCollapseAll, onExpandAll, onRevealInTree, hasSelection = false,
}: Properties) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [inputValue, setInputValue] = useState('');

  const handleAction = async (action: () => Promise<void>): Promise<boolean> => {
    try {
      onError?.(null);
      await action();
      onUpdate?.();
      return true;
    } catch (error_) {
      if (error_ instanceof FileTreeApiError && error_.status === 409) {
        onError?.('A file or folder with that name already exists.');
      } else {
        onError?.(error_ instanceof Error ? error_.message : 'An error occurred.');
      }
      return false;
    }
  };

  const openDialog = (kind: NonNullable<DialogKind>) => {
    if (kind.type === 'rename') setInputValue(kind.currentName);
    if (kind.type === 'create-file') setInputValue('new-document.adoc');
    if (kind.type === 'create-folder') setInputValue('New Folder');
    setDialog(kind);
  };

  const closeDialog = () => setDialog(null);

  const handleConfirm = async () => {
    if (!dialog) return;
    let ok = false;
    switch (dialog.type) {
    case 'rename': {
      ok = await handleAction(() => renameFileNode(projectId, fileNodeId, inputValue));

    break;
    }
    case 'create-file': {
      ok = await handleAction(async () => { await createFileNode(projectId, fileNodeId, inputValue); });

    break;
    }
    case 'create-folder': {
      ok = await handleAction(async () => { await createFolder(projectId, fileNodeId, inputValue); });

    break;
    }
    // No default
    }
    if (ok) closeDialog();
  };

  const isInputDialog = dialog?.type === 'rename' || dialog?.type === 'create-file' || dialog?.type === 'create-folder';
  const isDeleteDialog = dialog?.type === 'delete';

  const hasNavActions = !!(onFind || onCollapseAll || onExpandAll || onRevealInTree);
  const hasMutationActions = (canCreate && nodeType === 'folder') || !isRoot;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label="actions" className="h-6 w-6 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Navigation actions */}
          {onFind && (
            <DropdownMenuItem onSelect={onFind}>
              <Search className="h-4 w-4 mr-2 shrink-0" />
              Find File…
            </DropdownMenuItem>
          )}
          {onCollapseAll && (
            <DropdownMenuItem onSelect={onCollapseAll}>
              <FoldVertical className="h-4 w-4 mr-2 shrink-0" />
              Collapse All
            </DropdownMenuItem>
          )}
          {onExpandAll && (
            <DropdownMenuItem onSelect={onExpandAll}>
              <UnfoldVertical className="h-4 w-4 mr-2 shrink-0" />
              Expand All
            </DropdownMenuItem>
          )}
          {onRevealInTree && (
            <DropdownMenuItem onSelect={onRevealInTree} disabled={!hasSelection}>
              <LocateFixed className="h-4 w-4 mr-2 shrink-0" />
              Reveal in Tree
            </DropdownMenuItem>
          )}

          {/* Separator between navigation and mutation groups */}
          {hasNavActions && hasMutationActions && <DropdownMenuSeparator />}

          {/* File / folder creation */}
          {canCreate && nodeType === 'folder' && (
            <DropdownMenuItem onSelect={() => openDialog({ type: 'create-file' })}>
              <FilePlus className="h-4 w-4 mr-2 shrink-0" />
              New File
            </DropdownMenuItem>
          )}
          {canCreate && nodeType === 'folder' && (
            <DropdownMenuItem onSelect={() => openDialog({ type: 'create-folder' })}>
              <FolderPlus className="h-4 w-4 mr-2 shrink-0" />
              New Folder
            </DropdownMenuItem>
          )}

          {/* Node-level actions (hidden for root) */}
          {!isRoot && (
            <DropdownMenuItem onSelect={() => openDialog({ type: 'rename', currentName: nodeName })}>
              <Pencil className="h-4 w-4 mr-2 shrink-0" />
              Rename
            </DropdownMenuItem>
          )}
          {!isRoot && (
            <DropdownMenuItem
              className="text-destructive"
              onSelect={() => openDialog({ type: 'delete' })}
            >
              <Trash2 className="h-4 w-4 mr-2 shrink-0" />
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Rename / Create dialog */}
      <Dialog.Root open={isInputDialog} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-lg bg-background p-6 shadow-lg">
            <Dialog.Title className="text-lg font-semibold mb-4">
              {dialog?.type === 'rename' && 'Rename'}
              {dialog?.type === 'create-file' && 'New File'}
              {dialog?.type === 'create-folder' && 'New Folder'}
            </Dialog.Title>
            <Input
              value={inputValue}
              onChange={(event_) => setInputValue(event_.target.value)}
              onKeyDown={(event_) => { if (event_.key === 'Enter') handleConfirm(); }}
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-3">
              <Button variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button onClick={handleConfirm}>Confirm</Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete confirmation */}
      <ConfirmationDialog
        open={isDeleteDialog}
        onOpenChange={(open) => { if (!open) closeDialog(); }}
        title={`Delete ${nodeName}?`}
        description={
          nodeType === 'folder' && hasChildren
            ? 'This will also delete all files inside.'
            : `Are you sure you want to delete "${nodeName}"?`
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={async () => {
          const ok = await handleAction(() => deleteFileNode(projectId, fileNodeId));
          if (ok) closeDialog();
        }}
      />

    </>
  );
}
