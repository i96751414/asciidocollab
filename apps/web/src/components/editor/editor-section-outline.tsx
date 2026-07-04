'use client';
import React from 'react';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';
import type { ParticipantPresence } from '@/hooks/use-collab-presence';
import { OpenByOthersMarker } from '@/components/file-tree/open-by-others-marker';

interface EditorSectionOutlineProperties {
  entries: SectionOutlineEntry[];
  // Index of the row containing the cursor (current section); -1 or undefined marks none (028).
  currentIndex?: number;
  // Called with the clicked heading entry so the parent can navigate the editor.
  onHeadingClick: (entry: SectionOutlineEntry) => void;
  // Keyed by `${sourceFileId}:${sourceLine}` — the result of mapOutlinePresence.
  outlinePresence?: ReadonlyMap<string, ParticipantPresence[]>;
}

/**
 * Renders a hierarchical section outline for the current AsciiDoc document.
 *  Wrapped in React.memo so cursor-move re-renders of the parent editor do not
 *  cascade here when entries and the callback are referentially stable.
 */
export const EditorSectionOutline = React.memo(function EditorSectionOutline({ entries, currentIndex = -1, onHeadingClick, outlinePresence }: EditorSectionOutlineProperties) {
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
          const presenceKey =
            entry.sourceFileId != null && entry.sourceLine != null
              ? `${entry.sourceFileId}:${entry.sourceLine}`
              : null;
          const participants = presenceKey ? (outlinePresence?.get(presenceKey) ?? []) : [];
          return (
            <li key={`${entry.line}-${index}`} data-level={entry.level} className="flex items-center">
              <button
                type="button"
                aria-current={isCurrent ? 'true' : undefined}
                className={`flex-1 min-w-0 text-left text-xs py-0.5 rounded truncate border-l-2 ${
                  isCurrent
                    ? 'bg-primary/10 text-primary border-primary'
                    : 'border-transparent hover:bg-accent'
                }`}
                style={{ paddingLeft: `${entry.level * 12 + 8}px` }}
                data-open-file={entry.isOpenFile ? 'true' : undefined}
                onClick={() => onHeadingClick(entry)}
                tabIndex={0}
              >
                {entry.title}
              </button>
              <OpenByOthersMarker participants={participants} />
            </li>
          );
        })}
      </ul>
    </nav>
  );
});
