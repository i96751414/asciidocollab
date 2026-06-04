'use client';
import { useRef, useEffect } from 'react';
import { ChevronUp, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Properties {
  query: string;
  onQueryChange: (q: string) => void;
  matchCount: number;
  currentMatchIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onDismiss: () => void;
}

/** Renders the find-in-tree search input with navigation buttons and match counter. */
export function FindPanel({ query, onQueryChange, matchCount, currentMatchIndex, onNext, onPrev, onDismiss }: Properties) {
  const inputReference = useRef<HTMLInputElement>(null);
  const hasQuery = query.length > 0;
  const hasMatches = matchCount > 0;

  useEffect(() => {
    // setTimeout defers past Radix UI's focus-restoration on dropdown close
    const id = setTimeout(() => inputReference.current?.focus(), 0);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b bg-muted/40">
      <input
        ref={inputReference}
        type="text"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') onNext(); }}
        placeholder="Find file…"
        className="flex-1 bg-transparent text-sm outline-none min-w-0"
      />
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {hasQuery && !hasMatches && 'no matches'}
        {hasMatches && `${currentMatchIndex + 1} of ${matchCount}`}
      </span>
      <Button variant="ghost" size="icon" className="h-5 w-5" aria-label="previous match" onClick={onPrev}>
        <ChevronUp className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="icon" className="h-5 w-5" aria-label="next match" onClick={onNext}>
        <ChevronDown className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="icon" className="h-5 w-5" aria-label="dismiss" onClick={onDismiss}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
