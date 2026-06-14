'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { SymbolUsage, RenameSymbolKind, RenameSymbolResult } from '@/lib/api/projects';
import { EditorSymbolFind } from '@/components/editor/editor-symbol-find';
import { EditorSymbolRename } from '@/components/editor/editor-symbol-rename';

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
  // Guards against a slow in-flight find overwriting the results of a newer one.
  const findToken = useRef(0);

  const runFind = useCallback(
    async (target: string) => {
      if (target.trim() === '') return;
      findToken.current += 1;
      const token = findToken.current;
      setLoading(true);
      setError(null);
      try {
        const found = await findUsages(projectId, target.trim());
        if (token !== findToken.current) return;
        setUsages(found);
      } catch (error_) {
        if (token !== findToken.current) return;
        setError(error_ instanceof Error ? error_.message : 'Failed to find usages');
        setUsages(null);
      } finally {
        if (token === findToken.current) setLoading(false);
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
        <EditorSymbolFind
          kind={kind}
          name={name}
          loading={loading}
          usages={usages}
          error={error}
          onKindChange={setKind}
          onNameChange={setName}
          onFind={(target) => void runFind(target)}
          onNavigate={onNavigate}
          onClose={onClose}
        />

        {canEdit && (
          <EditorSymbolRename
            name={name}
            newName={newName}
            loading={loading}
            result={result}
            onNewNameChange={setNewName}
            onRename={() => void handleRename()}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}
