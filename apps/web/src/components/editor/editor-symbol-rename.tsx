'use client';

import React from 'react';
import type { RenameSymbolResult } from '@/lib/api/projects';

/** Props for {@link EditorSymbolRename}. */
interface EditorSymbolRenameProperties {
  /** The current symbol name (the rename source). */
  name: string;
  /** The desired new name. */
  newName: string;
  /** Whether a find or rename is in flight. */
  loading: boolean;
  /** The outcome of the last rename, or `null` before one runs. */
  result: RenameSymbolResult | null;
  // Updates the desired new name.
  onNewNameChange: (newName: string) => void;
  // Submits the rename.
  onRename: () => void;
  // Closes the dialog (Escape from the new-name input).
  onClose: () => void;
}

/** Builds the human-readable summary of a completed rename. */
function summarize(result: RenameSymbolResult): string {
  const files = `${result.rewrittenFiles} file${result.rewrittenFiles === 1 ? '' : 's'}`;
  const occurrences = `${result.updatedReferences} occurrence${result.updatedReferences === 1 ? '' : 's'}`;
  const warnings = result.warnings.length > 0 ? ` ${result.warnings.length} warning(s).` : '';
  return `Renamed across ${files} (${occurrences}).${warnings}`;
}

/**
 * Rename section of the symbol-refactor dialog: the new-name input,
 * the Rename button, and the result summary. Purely presentational; gating to
 * editors/owners and the network call live in the container.
 */
export function EditorSymbolRename({
  name,
  newName,
  loading,
  result,
  onNewNameChange,
  onRename,
  onClose,
}: EditorSymbolRenameProperties) {
  const disabled = loading || name.trim() === '' || newName.trim() === '' || newName.trim() === name.trim();
  return (
    <>
      <div className="flex items-center gap-2 border-t px-4 py-3">
        <input
          type="text"
          aria-label="New name"
          placeholder="rename to…"
          value={newName}
          onChange={(event) => onNewNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onRename();
            if (event.key === 'Escape') onClose();
          }}
          className="flex-1 rounded border bg-transparent px-2 py-1 text-sm outline-none"
        />
        <button
          type="button"
          onClick={onRename}
          disabled={disabled}
          className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
        >
          Rename
        </button>
      </div>

      {result && <p className="border-t px-4 py-2 text-sm text-muted-foreground">{summarize(result)}</p>}
    </>
  );
}
