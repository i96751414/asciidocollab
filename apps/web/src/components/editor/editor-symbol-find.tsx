'use client';

import React from 'react';
import type { SymbolUsage, RenameSymbolKind } from '@/lib/api/projects';

/** Props for {@link EditorSymbolFind}. */
interface EditorSymbolFindProperties {
  /** The selected symbol kind. */
  kind: RenameSymbolKind;
  /** The symbol name being searched. */
  name: string;
  /** Whether a find is in flight. */
  loading: boolean;
  /** The current usages, or `null` when no search has resolved yet. */
  usages: SymbolUsage[] | null;
  /** A find/rename error to surface, or `null`. */
  error: string | null;
  // Updates the selected symbol kind.
  onKindChange: (kind: RenameSymbolKind) => void;
  // Updates the symbol name.
  onNameChange: (name: string) => void;
  // Runs a find for the given name.
  onFind: (name: string) => void;
  // Navigates to a usage (file + offset range).
  onNavigate: (usage: SymbolUsage) => void;
  // Closes the dialog (Escape from the name input).
  onClose: () => void;
}

/** Renders the find-usages list body (loading / empty / prompt / results). */
function renderUsages(
  loading: boolean,
  usages: SymbolUsage[] | null,
  onNavigate: (usage: SymbolUsage) => void,
) {
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
}

/**
 * Find-usages section of the symbol-refactor dialog: the kind/name
 * toolbar and the cross-file usages list. Purely presentational; all state and
 * the network call live in the container.
 */
export function EditorSymbolFind({
  kind,
  name,
  loading,
  usages,
  error,
  onKindChange,
  onNameChange,
  onFind,
  onNavigate,
  onClose,
}: EditorSymbolFindProperties) {
  return (
    <>
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <select
          aria-label="Symbol kind"
          value={kind}
          onChange={(event) => onKindChange(event.target.value === 'attribute' ? 'attribute' : 'anchor')}
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
          onChange={(event) => onNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onFind(name);
            if (event.key === 'Escape') onClose();
          }}
          className="flex-1 rounded border bg-transparent px-2 py-1 text-sm outline-none"
        />
        <button
          type="button"
          onClick={() => onFind(name)}
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
        {renderUsages(loading, usages, onNavigate)}
      </ul>
    </>
  );
}
