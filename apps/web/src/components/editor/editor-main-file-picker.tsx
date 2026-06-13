'use client';

import React, { useEffect, useId, useState } from 'react';
import type { FileTreeNode } from '@/components/file-tree/types';
import { fetchProjectFileTree } from '@/lib/api/file-tree';
import { setProjectMainFile } from '@/lib/api/projects';

/** A selectable AsciiDoc file in the project tree. */
interface AsciiDocFile {
  /** File node id. */
  nodeId: string;
  /** Project-relative path (used as the option label). */
  path: string;
}

/** Props for {@link EditorMainFilePicker}. */
interface EditorMainFilePickerProperties {
  /** The project being configured. */
  projectId: string;
  /** Whether the current user may change the main file (editor/owner). Viewers see nothing. */
  canEdit: boolean;
  /** The currently configured main-file node id, or null when unset. */
  currentMainFileNodeId: string | null;
  // Called with the new main-file node id (or null) after a successful save.
  onChange?: (mainFileNodeId: string | null) => void;
}

/** Recursively collect `.adoc` file nodes from a file tree. */
function collectAsciiDocFiles(node: FileTreeNode, into: AsciiDocFile[]): void {
  if (node.type === 'file' && node.name.endsWith('.adoc')) into.push({ nodeId: node.id, path: node.path });
  for (const child of node.children) collectAsciiDocFiles(child, into);
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Project main-file picker (US8/FR-045): lists the project's `.adoc` files and
 * persists the selection via `setProjectMainFile`; the main file scopes cross-file
 * resolution (include graph, symbols, diagnostics, heading levels). Rendered only
 * for editors/owners — viewers configure nothing and fall back to current-file scope.
 */
export function EditorMainFilePicker({
  projectId,
  canEdit,
  currentMainFileNodeId,
  onChange,
}: EditorMainFilePickerProperties): React.JSX.Element | null {
  const selectId = useId();
  const [files, setFiles] = useState<AsciiDocFile[]>([]);
  const [selected, setSelected] = useState<string>(currentMainFileNodeId ?? '');
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Reflect an externally-changed main file (e.g. cleared by a move/rename, US12).
  useEffect(() => {
    setSelected(currentMainFileNodeId ?? '');
  }, [currentMainFileNodeId]);

  useEffect(() => {
    if (!canEdit) return;
    let cancelled = false;
    fetchProjectFileTree(projectId)
      .then((root) => {
        if (cancelled) return;
        const list: AsciiDocFile[] = [];
        collectAsciiDocFiles(root, list);
        list.sort((a, b) => a.path.localeCompare(b.path));
        setFiles(list);
      })
      .catch(() => {
        /* Tree load failure leaves the picker with only the clear option. */
      });
    return () => {
      cancelled = true;
    };
  }, [canEdit, projectId]);

  if (!canEdit) return null;

  const handleChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value; // '' ⇒ clear (current-file-only resolution)
    const previous = selected;
    setSelected(next);
    setStatus('saving');
    setErrorMessage('');
    const nodeId = next === '' ? null : next;
    try {
      await setProjectMainFile(projectId, nodeId);
      setStatus('saved');
      onChange?.(nodeId);
    } catch (error) {
      setSelected(previous); // revert the optimistic selection on failure
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to set the main file');
    }
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      <label htmlFor={selectId} className="text-muted-foreground">
        Main file
      </label>
      <select
        id={selectId}
        value={selected}
        onChange={handleChange}
        disabled={status === 'saving'}
        className="rounded border border-input bg-background px-2 py-1 text-xs"
      >
        <option value="">(none — current file only)</option>
        {files.map((file) => (
          <option key={file.nodeId} value={file.nodeId}>
            {file.path}
          </option>
        ))}
      </select>
      {status === 'saving' && <span className="text-muted-foreground">Saving…</span>}
      {status === 'saved' && <span className="text-muted-foreground">Saved</span>}
      {status === 'error' && (
        <span className="text-destructive" role="alert">
          {errorMessage}
        </span>
      )}
    </div>
  );
}
