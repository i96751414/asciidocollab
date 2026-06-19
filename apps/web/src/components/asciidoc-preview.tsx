'use client';
// The generated, scoped Asciidoctor stylesheet is imported first so the brand stylesheet
// (asciidoc-preview.css) wins on equal specificity for the few rules we deliberately override.
import '../styles/asciidoctor-style.generated.css';
import '../styles/asciidoc-preview.css';
import { useEffect, useMemo, useRef } from 'react';
import { ArrowUpDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utilities';
import type { PreviewState, ScrollRequest } from '@/hooks/use-asciidoc-preview';
import { useAsciidocPreview } from '@/hooks/use-asciidoc-preview';
import { PreviewStyleControl, type PreviewStyleValue } from '@/components/preview-style-control';
// Re-exported for back-compat: the AsciiDoc file-name rule now lives in lib/asciidoc/file-name
// (single presentation copy of the domain rule), but existing callers import it from here.
export { isAsciiDocumentFile as isAsciiDocFile } from '@/lib/asciidoc/file-name';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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
  /** When set with {@link getFiles}, render the assembled main document with includes inlined (FR-068). */
  mainPath?: string;
  /** Returns the path→content snapshot for include assembly; read lazily at render time. */
  getFiles?: () => Record<string, string>;
  /**
   * Project main-file path (root) for cross-document attribute resolution (US1/FR-002a). When set
   * with {@link openFilePath} and {@link getFiles}, the open file's `{name}` references resolve to the
   * value in effect at its include-point under this root. Null/unset ⇒ standalone resolution.
   */
  rootFilePath?: string | null;
  /** Project-relative path of the previewed open file, whose inherited attribute scope is seeded. */
  openFilePath?: string;
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
  mainPath,
  getFiles,
  rootFilePath,
  openFilePath,
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
  const { html, state, error, previewRef, mathPresent } = useAsciidocPreview({
    content,
    isEnabled,
    scrollToLine,
    imagesDir: imagesDirectory,
    mainPath,
    getFiles,
    rootFileId: rootFilePath,
    openFileId: openFilePath,
  });

  // Ref to the rendered-output container — the scoped `.asciidoc-preview-content` element whose
  // sanitized HTML may carry STEM delimiters MathJax typesets in place (US15).
  const outputReference = useRef<HTMLDivElement | null>(null);

  // Stable `dangerouslySetInnerHTML` payload, keyed on `html`. A fresh `{ __html }` object literal
  // every render would make React treat the prop as changed and RE-APPLY innerHTML on every re-render
  // (even an unrelated one, e.g. an editor click), wiping the client-typeset math (`<math>`/
  // `mjx-container`) that `renderMath` inserted — and since `[html, mathPresent]` are unchanged the
  // typeset effect would not re-run, leaving the raw `\$…\$` delimiters on screen. Memoizing keeps the
  // object referentially stable while `html` is unchanged, so React only re-applies innerHTML (and the
  // effect re-typesets) when the rendered HTML actually changes.
  const htmlMarkup = useMemo(() => (html === null ? null : { __html: html }), [html]);

  // Render math client-side AFTER the sanitized HTML is committed to the DOM, and only when the
  // worker flagged in-effect STEM (resolved `:stem:` + stem markup). MathJax is lazy-imported inside
  // `renderMath`, so its bundle cost is paid only on a math-bearing preview (FR-021d; R5). Re-runs on
  // html/mathPresent change; `renderMath` clears prior typeset state so re-renders don't double-render.
  // Output stays within the scoped container (Constitution VI) — we only ever typeset that node.
  useEffect(() => {
    if (!mathPresent || html === null) return;
    const container = outputReference.current;
    if (!container) return;
    let cancelled = false;
    void import('@/components/math/render-math').then(({ renderMath }) => {
      if (cancelled) return;
      void renderMath(container);
    });
    return () => {
      cancelled = true;
    };
  }, [html, mathPresent]);

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
              ref={outputReference}
              data-testid="asciidoc-output"
              className="asciidoc-preview-content"
              data-preview-style={previewStyle}
              // dangerouslySetInnerHTML is intentional: content is sanitized by DOMPurify in
              // useAsciidocPreview. The payload is the memoized `htmlMarkup` (stable while `html` is
              // unchanged) so React does not re-apply innerHTML — and wipe client-typeset math — on
              // unrelated re-renders. `html !== null` here, so `htmlMarkup` is non-null.
              dangerouslySetInnerHTML={htmlMarkup ?? undefined}
            />
          )
        )}
      </div>
    </div>
  );
}
