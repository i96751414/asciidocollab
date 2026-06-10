'use client';
// The generated, scoped Asciidoctor stylesheet is imported first so the brand stylesheet
// (asciidoc-preview.css) wins on equal specificity for the few rules we deliberately override.
import '../styles/asciidoctor-style.generated.css';
import '../styles/asciidoc-preview.css';
import { ArrowUpDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utilities';
import type { PreviewState, ScrollRequest } from '@/hooks/use-asciidoc-preview';
import { useAsciidocPreview } from '@/hooks/use-asciidoc-preview';
import { PreviewStyleControl, type PreviewStyleValue } from '@/components/preview-style-control';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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
  /** Project id, used to resolve the base path for image macros in the preview. */
  projectId: string;
  scrollToLine?: ScrollRequest | null;
  /** When provided, a collapse button is rendered in the header. */
  onCollapse?: () => void;
  /** Whether the preview scrolls to match editor scroll position. */
  scrollSyncEnabled?: boolean;
  /** Called when the user toggles the scroll sync option. */
  onToggleScrollSync?: () => void;
  /** Currently selected preview rendering style. Defaults to the brand look. */
  previewStyle?: PreviewStyleValue;
  /**
   * Called when the user picks a different preview style in the header control.
   *
   * @param style - The newly selected style token.
   */
  onPreviewStyleChange?: (style: PreviewStyleValue) => void;
}

/** Live preview panel that renders AsciiDoc source as styled HTML via a Web Worker. */
export function AsciiDocPreview({
  content,
  isEnabled,
  projectId,
  scrollToLine = null,
  onCollapse,
  scrollSyncEnabled = false,
  onToggleScrollSync,
  previewStyle = 'asciidocollab',
  onPreviewStyleChange,
}: AsciiDocPreviewProperties) {
  // Default image base path: AsciiDoc image macros reference files by path, so point Asciidoctor's
  // `imagesdir` at the project's image endpoint (see GET /projects/:id/images/*).
  const imagesDirectory = `${API_BASE}/projects/${projectId}/images`;
  const { html, state, error, previewRef } = useAsciidocPreview({ content, isEnabled, scrollToLine, imagesDir: imagesDirectory });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Preview</span>
        <div className="flex items-center gap-1">
          {onPreviewStyleChange && (
            <PreviewStyleControl value={previewStyle} onChange={onPreviewStyleChange} compact />
          )}
          <SyncIndicator state={state} isEnabled={isEnabled} />
          {onToggleScrollSync && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onToggleScrollSync}
              className={cn('h-6 w-6 text-muted-foreground', scrollSyncEnabled && 'bg-accent text-foreground')}
              aria-label={scrollSyncEnabled ? 'disable scroll sync' : 'enable scroll sync'}
              aria-pressed={scrollSyncEnabled}
              title="Scroll preview with editor"
              data-testid="scroll-sync-toggle"
            >
              <ArrowUpDown className="h-4 w-4" />
            </Button>
          )}
          {onCollapse && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label="collapse preview"
              onClick={onCollapse}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
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
              data-preview-style={previewStyle}
              // dangerouslySetInnerHTML is intentional: content is sanitized by DOMPurify in useAsciidocPreview.
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )
        )}
      </div>
    </div>
  );
}
