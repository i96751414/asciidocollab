'use client';
import { useMemo } from 'react';
import { Files, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';
import { EditorSectionOutline } from './editor-section-outline';
import { currentHeadingIndex } from '@/lib/editor/current-heading';
import type { OutlineScope } from '@/hooks/use-editor-preferences';
import type { ParticipantPresence } from '@/hooks/use-collab-presence';

interface OutlineViewProperties {
  entries: SectionOutlineEntry[];
  currentLine: number | null;
  // True when an AsciiDoc document is open; false drives the "open a document" empty state.
  hasDocument: boolean;
  // Called with the clicked heading so the layout can navigate the editor (reuses the line-click seam).
  onHeadingClick: (entry: SectionOutlineEntry) => void;
  // Full-document scope: when 'full', current-section tracking is restricted to open-file entries
  // (FR-011) — the cursor has no position in a foreign file.
  effectiveScope?: 'full' | 'current';
  // Persisted user preference (FR-003/FR-004/FR-012); when provided along with onScopeChange,
  // a toggle button is rendered. Absent ⇒ no toggle (e.g. no main document / fallback mode).
  outlineScope?: OutlineScope;
  // Called when the user clicks the scope toggle; receives the NEW scope value.
  onScopeChange?: (scope: OutlineScope) => void;
  // Keyed by `${sourceFileId}:${sourceLine}` — from mapOutlinePresence (FR-021/FR-022).
  outlinePresence?: ReadonlyMap<string, ParticipantPresence[]>;
}

/**
 * The left-panel Outline view (028): an "OUTLINE" header over the live section list, with friendly
 * empty states when no document is open or the open document has no headings. The list itself is the
 * existing {@link EditorSectionOutline}; the current section is derived from the cursor line.
 *
 * When `outlineScope` + `onScopeChange` are both provided, a toggle button switches between the
 * full assembled document outline and the open file's headings only (FR-003/FR-004/FR-012).
 */
export function OutlineView({ entries, currentLine, hasDocument, onHeadingClick, effectiveScope, outlineScope, onScopeChange, outlinePresence }: OutlineViewProperties) {
  // When the user has chosen 'current' scope, filter to only open-file entries before rendering.
  const visibleEntries = useMemo(() => {
    if (outlineScope === 'current') {
      return entries.filter((entry) => entry.isOpenFile !== false);
    }
    return entries;
  }, [entries, outlineScope]);

  // The layout re-renders this view on every cursor move (currentLine) and every edit (entries), so
  // memoise the O(n) current-section scan over only its real inputs. In full-document scope the
  // cursor only has a position within open-file entries (FR-011); foreign-file entries are skipped.
  const currentIndex = useMemo(() => {
    if (effectiveScope === 'full') {
      const openOnly = visibleEntries.filter((entry) => entry.isOpenFile !== false);
      const indexInOpen = currentHeadingIndex(openOnly, currentLine);
      if (indexInOpen < 0) return -1;
      // Map the open-only index back to the full entries index (same predicate as the filter above).
      let openCount = -1;
      for (const [index, entry] of visibleEntries.entries()) {
        if (entry.isOpenFile !== false) openCount++;
        if (openCount === indexInOpen) return index;
      }
      return -1;
    }
    return currentHeadingIndex(visibleEntries, currentLine);
  }, [visibleEntries, currentLine, effectiveScope]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header mirrors the file tree's header (fixed h-9, same padding/border/typography) so the two
          left-panel views line up exactly. */}
      <div className="flex items-center px-2 border-b shrink-0 h-9">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Outline</span>
        {onScopeChange && outlineScope !== undefined && (
          // Icon-only toggle matching the rail/header icon buttons: the glyph shows the CURRENT scope
          // (stacked files = full document, single file = current file); the accessible name + tooltip
          // describe the action (switch to the other scope).
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ml-auto h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => onScopeChange(outlineScope === 'full' ? 'current' : 'full')}
            aria-label={outlineScope === 'full' ? 'Current file' : 'Full document'}
            title={
              outlineScope === 'full'
                ? 'Showing the full document — switch to the current file only'
                : 'Showing the current file — switch to the full document'
            }
          >
            {outlineScope === 'full' ? <Files className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          </Button>
        )}
      </div>
      {hasDocument && visibleEntries.length > 0 ? (
        <EditorSectionOutline entries={visibleEntries} currentIndex={currentIndex} onHeadingClick={onHeadingClick} outlinePresence={outlinePresence} />
      ) : (
        <p className="text-muted-foreground text-xs px-3 py-4">
          {hasDocument
            ? 'No headings yet — add a section title (=, ==, …).'
            : 'Open a document to see its outline.'}
        </p>
      )}
    </div>
  );
}
