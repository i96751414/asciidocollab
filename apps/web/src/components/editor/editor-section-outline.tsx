import React from 'react';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';

interface EditorSectionOutlineProperties {
  entries: SectionOutlineEntry[];
  // Index of the row containing the cursor (current section); -1 or undefined marks none (028/US2).
  currentIndex?: number;
  // Called with the clicked heading entry so the parent can navigate the editor.
  onHeadingClick: (entry: SectionOutlineEntry) => void;
}

/**
 * Renders a hierarchical section outline for the current AsciiDoc document.
 *  Wrapped in React.memo so cursor-move re-renders of the parent editor do not
 *  cascade here when entries and the callback are referentially stable.
 */
export const EditorSectionOutline = React.memo(function EditorSectionOutline({ entries, currentIndex = -1, onHeadingClick }: EditorSectionOutlineProperties) {
  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-xs px-3 py-2">No headings found.</p>
    );
  }

  return (
    <nav aria-label="Section outline" className="overflow-y-auto">
      <ul className="py-1">
        {entries.map((entry, index) => {
          const isCurrent = index === currentIndex;
          return (
            <li key={`${entry.line}-${index}`} data-level={entry.level}>
              <button
                type="button"
                aria-current={isCurrent ? 'true' : undefined}
                className={`w-full text-left text-xs py-0.5 rounded truncate border-l-2 ${
                  isCurrent
                    ? 'bg-primary/10 text-primary border-primary'
                    : 'border-transparent hover:bg-accent'
                }`}
                style={{ paddingLeft: `${entry.level * 12 + 8}px` }}
                onClick={() => onHeadingClick(entry)}
                tabIndex={0}
              >
                {entry.title}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
});
