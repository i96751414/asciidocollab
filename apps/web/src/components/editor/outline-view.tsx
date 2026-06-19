'use client';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';
import { EditorSectionOutline } from './editor-section-outline';
import { currentHeadingIndex } from '@/lib/editor/current-heading';

interface OutlineViewProperties {
  entries: SectionOutlineEntry[];
  currentLine: number | null;
  // True when an AsciiDoc document is open; false drives the "open a document" empty state.
  hasDocument: boolean;
  // Called with the clicked heading so the layout can navigate the editor (reuses the line-click seam).
  onHeadingClick: (entry: SectionOutlineEntry) => void;
}

/**
 * The left-panel Outline view (028): an "OUTLINE" header over the live section list, with friendly
 * empty states when no document is open or the open document has no headings. The list itself is the
 * existing {@link EditorSectionOutline}; the current section is derived from the cursor line.
 */
export function OutlineView({ entries, currentLine, hasDocument, onHeadingClick }: OutlineViewProperties) {
  const currentIndex = currentHeadingIndex(entries, currentLine);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header mirrors the file tree's header (fixed h-9, same padding/border/typography) so the two
          left-panel views line up exactly. */}
      <div className="flex items-center px-2 border-b shrink-0 h-9">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Outline</span>
      </div>
      {hasDocument && entries.length > 0 ? (
        <EditorSectionOutline entries={entries} currentIndex={currentIndex} onHeadingClick={onHeadingClick} />
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
