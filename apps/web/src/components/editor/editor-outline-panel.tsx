'use client';
import { useState } from 'react';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';
import { EditorSectionOutline } from './editor-section-outline';
import { ResizeHandle } from '@/components/ui/resize-handle';
import { usePanelResize } from '@/hooks/use-panel-resize';

interface EditorOutlinePanelProperties {
  entries: SectionOutlineEntry[];
  onHeadingClick: (entry: SectionOutlineEntry) => void;
}

/**
 * The right-hand section outline sidebar: a resizable panel with its own collapsed/expanded
 * state and a slim rail to re-open it. Owns the resize and open state so the parent editor
 * stays a thin orchestrator. Rendered only for AsciiDoc files.
 */
export function EditorOutlinePanel({ entries, onHeadingClick }: EditorOutlinePanelProperties) {
  const [outlineOpen, setOutlineOpen] = useState(true);
  const outlineResize = usePanelResize({
    initialWidth: 208, min: 140, max: 400, side: 'end', storageKey: 'asciidoc-outline-width',
  });

  if (!outlineOpen) {
    return (
      <button
        type="button"
        aria-label="Expand outline panel"
        className="w-5 shrink-0 border-l flex items-center justify-center text-muted-foreground hover:text-foreground text-xs"
        onClick={() => setOutlineOpen(true)}
      >
        ≡
      </button>
    );
  }

  return (
    <>
      <ResizeHandle
        ariaLabel="Resize outline"
        onPointerDown={outlineResize.onPointerDown}
        onKeyDown={outlineResize.onKeyDown}
        isResizing={outlineResize.isResizing}
      />
      <div style={{ width: outlineResize.width }} className="shrink-0 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-2 py-1 border-b text-xs text-muted-foreground">
          <span>Outline</span>
          <button
            type="button"
            aria-label="Collapse outline panel"
            className="hover:text-foreground"
            onClick={() => setOutlineOpen(false)}
          >
            ×
          </button>
        </div>
        <EditorSectionOutline entries={entries} onHeadingClick={onHeadingClick} />
      </div>
    </>
  );
}
