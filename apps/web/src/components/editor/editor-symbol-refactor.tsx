'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { SymbolUsage, RenameSymbolKind, RenameSymbolResult } from '@/lib/api/projects';

/** Props for {@link EditorSymbolRefactor}. */
interface EditorSymbolRefactorProperties {
  /** Whether the dialog is open. */
  open: boolean;
  /** The project being refactored. */
  projectId: string;
  /** Whether the current user may rename (editor/owner). Viewers can still find usages. */
  canEdit: boolean;
  /** Pre-fills the target from the symbol at the cursor; blank when opened cold. */
  initial?: { kind: RenameSymbolKind; name: string } | null;
  // Lists every cross-file usage of a symbol name (FR-065).
  findUsages: (projectId: string, name: string) => Promise<SymbolUsage[]>;
  // Renames the symbol across the project (FR-064).
  renameSymbol: (
    projectId: string,
    input: { symbolKind: RenameSymbolKind; oldName: string; newName: string },
  ) => Promise<RenameSymbolResult>;
  // Navigates to a usage (file + offset range).
  onNavigate: (usage: SymbolUsage) => void;
  // Called after a successful rename so the parent can refresh the index/open file.
  onRenamed: (result: RenameSymbolResult, kind: RenameSymbolKind, oldName: string, newName: string) => void;
  // Called when the dialog should close (Escape / backdrop / Done).
  onClose: () => void;
}

/**
 * Cross-file refactoring dialog (US12): find-usages (FR-065) and rename
 * id/anchor/attribute (FR-064) for a project symbol. Find-usages is available to
 * any member; rename is gated to editors/owners (`canEdit`) and the actual
 * permission is re-checked server-side. Network calls are injected so the dialog
 * is presentational and unit-testable. Token-themed (Constitution V).
 */
export function EditorSymbolRefactor({
  open,
  projectId,
  canEdit,
  initial,
  findUsages,
  renameSymbol,
  onNavigate,
  onRenamed,
  onClose,
}: EditorSymbolRefactorProperties) {
  const [kind, setKind] = useState<RenameSymbolKind>('anchor');
  const [name, setName] = useState('');
  const [newName, setNewName] = useState('');
  const [usages, setUsages] = useState<SymbolUsage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RenameSymbolResult | null>(null);

  const runFind = useCallback(
    async (target: string) => {
      if (target.trim() === '') return;
      setLoading(true);
      setError(null);
      try {
        setUsages(await findUsages(projectId, target.trim()));
      } catch (error_) {
        setError(error_ instanceof Error ? error_.message : 'Failed to find usages');
        setUsages(null);
      } finally {
        setLoading(false);
      }
    },
    [findUsages, projectId],
  );

  // Seed from the cursor symbol and auto-list its usages each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setKind(initial?.kind ?? 'anchor');
    setName(initial?.name ?? '');
    setNewName(initial?.name ?? '');
    setUsages(null);
    setError(null);
    setResult(null);
    if (initial?.name) void runFind(initial.name);
  }, [open, initial, runFind]);

  if (!open) return null;

  const renderUsages = () => {
    if (loading && usages === null) {
      return <li className="px-4 py-2 text-sm text-muted-foreground">Searching…</li>;
    }
    if (usages === null) {
      return <li className="px-4 py-2 text-sm text-muted-foreground">Find usages to list references.</li>;
    }
    if (usages.length === 0) {
      return <li className="px-4 py-2 text-sm text-muted-foreground">No usages found.</li>;
    }
    return usages.map((usage) => (
      <li key={`${usage.fileNodeId}:${usage.range.from}`}>
        <button
          type="button"
          className="flex w-full items-baseline justify-between gap-3 px-4 py-1.5 text-left text-sm hover:bg-muted"
          onClick={() => onNavigate(usage)}
        >
          <span className="truncate font-medium">{usage.path}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{usage.kind}</span>
        </button>
      </li>
    ));
  };

  const handleRename = async () => {
    const oldName = name.trim();
    const target = newName.trim();
    if (oldName === '' || target === '') return;
    setLoading(true);
    setError(null);
    try {
      const renameResult = await renameSymbol(projectId, { symbolKind: kind, oldName, newName: target });
      setResult(renameResult);
      onRenamed(renameResult, kind, oldName, target);
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : 'Rename failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Refactor symbol"
        className="w-full max-w-lg rounded-lg border bg-background shadow-lg"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <select
            aria-label="Symbol kind"
            value={kind}
            onChange={(event) => setKind(event.target.value === 'attribute' ? 'attribute' : 'anchor')}
            className="rounded border bg-transparent px-2 py-1 text-sm"
          >
            <option value="anchor">id / anchor</option>
            <option value="attribute">attribute</option>
          </select>
          <input
            type="text"
            aria-label="Symbol name"
            placeholder="symbol name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void runFind(name);
              if (event.key === 'Escape') onClose();
            }}
            className="flex-1 rounded border bg-transparent px-2 py-1 text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => void runFind(name)}
            className="rounded border px-2 py-1 text-sm hover:bg-muted"
          >
            Find usages
          </button>
        </div>

        {error && (
          <p role="alert" className="px-4 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <ul className="max-h-60 overflow-y-auto py-1" aria-label="Usages">
          {renderUsages()}
        </ul>

        {canEdit && (
          <div className="flex items-center gap-2 border-t px-4 py-3">
            <input
              type="text"
              aria-label="New name"
              placeholder="rename to…"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleRename();
                if (event.key === 'Escape') onClose();
              }}
              className="flex-1 rounded border bg-transparent px-2 py-1 text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => void handleRename()}
              disabled={loading || name.trim() === '' || newName.trim() === '' || newName.trim() === name.trim()}
              className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
            >
              Rename
            </button>
          </div>
        )}

        {result && (
          <p className="border-t px-4 py-2 text-sm text-muted-foreground">
            Renamed across {result.rewrittenFiles} file{result.rewrittenFiles === 1 ? '' : 's'} (
            {result.updatedReferences} occurrence{result.updatedReferences === 1 ? '' : 's'}).
            {result.warnings.length > 0 && ` ${result.warnings.length} warning(s).`}
          </p>
        )}
      </div>
    </div>
  );
}
