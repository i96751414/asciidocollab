import React from 'react';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';

interface EditorSectionOutlineProperties {
  entries: SectionOutlineEntry[];
  onHeadingClick: (entry: SectionOutlineEntry) => void;
}

/** Renders a hierarchical section outline for the current AsciiDoc document.
 *  Wrapped in React.memo so cursor-move re-renders of the parent editor do not
 *  cascade here when entries and the callback are referentially stable. */
export const EditorSectionOutline = React.memo(function EditorSectionOutline({ entries, onHeadingClick }: EditorSectionOutlineProperties) {
  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-xs px-3 py-2">No headings found.</p>
    );
  }

  return (
    <nav aria-label="Section outline" className="overflow-y-auto">
      <ul className="py-1">
        {entries.map((entry, index) => (
          <li key={`${entry.line}-${index}`} data-level={entry.level}>
            <button
              type="button"
              className="w-full text-left text-xs py-0.5 hover:bg-muted rounded truncate"
              style={{ paddingLeft: `${(entry.level - 1) * 12 + 8}px` }}
              onClick={() => onHeadingClick(entry)}
              tabIndex={0}
            >
              {entry.title}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
});
