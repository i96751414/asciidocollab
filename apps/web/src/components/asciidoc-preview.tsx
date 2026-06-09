'use client';
import '../styles/asciidoc-preview.css';
import type { PreviewState, ScrollRequest } from '@/hooks/use-asciidoc-preview';
import { useAsciidocPreview } from '@/hooks/use-asciidoc-preview';

const ASCIIDOC_EXTENSIONS = new Set(['.adoc', '.asciidoc', '.asc']);

/** Returns true if the file name has an AsciiDoc extension (.adoc, .asciidoc, .asc). */
export function isAsciiDocFile(nodeName: string): boolean {
  const dotIndex = nodeName.lastIndexOf('.');
  if (dotIndex <= 0) return false;
  const extension = nodeName.slice(dotIndex).toLowerCase();
  return ASCIIDOC_EXTENSIONS.has(extension);
}

function SyncIndicator({ state, isEnabled }: { state: PreviewState; isEnabled: boolean }) {
  if (!isEnabled || state === 'idle') {
    return <span className="text-xs text-muted-foreground" aria-label="not available">–</span>;
  }
  if (state === 'up-to-date') {
    return <span className="text-xs text-[hsl(var(--success))]" aria-label="up to date">✓</span>;
  }
  if (state === 'error') {
    return <span className="text-xs text-destructive" aria-label="preview error">⚠ Preview error</span>;
  }
  return (
    <span data-testid="sync-indicator" className="text-xs text-muted-foreground animate-pulse" aria-label="rendering">
      ●
    </span>
  );
}

interface AsciiDocPreviewProperties {
  content: string;
  isEnabled: boolean;
  scrollToLine?: ScrollRequest | null;
  /** When provided, a collapse button is rendered in the header. */
  onCollapse?: () => void;
  /** Whether the preview scrolls to match editor scroll position. */
  scrollSyncEnabled?: boolean;
  /** Called when the user toggles the scroll sync option. */
  onToggleScrollSync?: () => void;
}

/** Live preview panel that renders AsciiDoc source as styled HTML via a Web Worker. */
export function AsciiDocPreview({
  content,
  isEnabled,
  scrollToLine = null,
  onCollapse,
  scrollSyncEnabled = false,
  onToggleScrollSync,
}: AsciiDocPreviewProperties) {
  const { html, state, error, previewRef } = useAsciidocPreview({ content, isEnabled, scrollToLine });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Preview</span>
        <div className="flex items-center gap-1">
          <SyncIndicator state={state} isEnabled={isEnabled} />
          {onToggleScrollSync && (
            <button
              type="button"
              onClick={onToggleScrollSync}
              className={`cursor-pointer rounded p-0.5 text-xs ${scrollSyncEnabled ? 'text-foreground' : 'text-muted-foreground'} hover:bg-accent hover:text-foreground`}
              aria-label={scrollSyncEnabled ? 'disable scroll sync' : 'enable scroll sync'}
              aria-pressed={scrollSyncEnabled}
              title="Scroll preview with editor"
              data-testid="scroll-sync-toggle"
            >
              ↕
            </button>
          )}
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="collapse preview"
            >
              ›
            </button>
          )}
        </div>
      </div>

      {/* Error callout — shown below header, preserves previous html underneath */}
      {state === 'error' && error && (
        <div className="px-3 py-1.5 text-xs text-destructive border-b bg-destructive/10 shrink-0">
          {error}
        </div>
      )}

      <div ref={previewRef} className="flex-1 overflow-auto p-4" data-testid="preview-scroll-container">
        {!isEnabled || state === 'idle' ? (
          <p className="text-muted-foreground text-sm">Preview not available for this file type</p>
        ) : (
          html !== null && (
            <div
              data-testid="asciidoc-output"
              className="asciidoc-preview-content"
              // dangerouslySetInnerHTML is intentional: content is sanitized by DOMPurify in useAsciidocPreview.
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )
        )}
      </div>
    </div>
  );
}
