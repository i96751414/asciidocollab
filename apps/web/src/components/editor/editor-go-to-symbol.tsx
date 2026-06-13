import React from 'react';
import { useState, useMemo, useEffect, useRef } from 'react';
import type { ProjectSymbol } from '@asciidocollab/shared';

interface EditorGoToSymbolProperties {
  /** Whether the palette is open. */
  open: boolean;
  /** All project symbols; the palette shows only sections and anchors (FR-061). */
  symbols: ProjectSymbol[];
  // Maps a symbol's file id to its project-relative path (shown as the row detail).
  pathOf: (fileId: string) => string | null;
  // Called with the chosen symbol when the user activates a row.
  onSelect: (symbol: ProjectSymbol) => void;
  // Called when the palette should close (Escape or backdrop click).
  onClose: () => void;
}

/**
 * Project-wide "Go to Symbol" command palette (US8/FR-061): a filterable list of every section
 * heading and block anchor across the document tree. Arrow keys move the highlight, Enter jumps,
 * Escape closes. Navigation itself is delegated to `onSelect`, so it works the same in-file and
 * cross-file. Token-themed (Constitution V).
 */
export function EditorGoToSymbol({ open, symbols, pathOf, onSelect, onClose }: EditorGoToSymbolProperties) {
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputReference = useRef<HTMLInputElement>(null);

  const candidates = useMemo(
    () => symbols.filter((symbol) => symbol.kind === 'section' || symbol.kind === 'anchor'),
    [symbols],
  );

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === '') return candidates;
    return candidates.filter((symbol) => {
      const path = pathOf(symbol.fileId) ?? '';
      return symbol.name.toLowerCase().includes(needle) || path.toLowerCase().includes(needle);
    });
  }, [candidates, pathOf, query]);

  // Reset the query/highlight and focus the input whenever the palette opens.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setHighlight(0);
    inputReference.current?.focus();
  }, [open]);

  // Keep the highlight within the current match list as it shrinks.
  useEffect(() => {
    setHighlight((current) => (current >= matches.length ? Math.max(0, matches.length - 1) : current));
  }, [matches.length]);

  if (!open) return null;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((current) => Math.min(current + 1, matches.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const chosen = matches[highlight];
      if (chosen) onSelect(chosen);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh]"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-label="Go to symbol"
        className="w-full max-w-lg rounded-lg border bg-background shadow-lg"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={inputReference}
          type="text"
          aria-label="Go to symbol"
          placeholder="Go to symbol…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent px-4 py-3 text-sm outline-none border-b"
        />
        <ul className="max-h-80 overflow-y-auto py-1">
          {matches.length === 0 ? (
            <li className="px-4 py-2 text-sm text-muted-foreground">No matching symbols.</li>
          ) : (
            matches.map((symbol, index) => (
              <li key={`${symbol.fileId}:${symbol.kind}:${symbol.name}:${symbol.range.from}`}>
                <button
                  type="button"
                  className={`flex w-full items-baseline justify-between gap-3 px-4 py-1.5 text-left text-sm ${
                    index === highlight ? 'bg-accent' : 'hover:bg-muted'
                  }`}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => onSelect(symbol)}
                >
                  <span className="truncate">
                    <span className="font-medium">{symbol.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{symbol.kind}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground truncate">{pathOf(symbol.fileId) ?? ''}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
