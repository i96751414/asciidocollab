'use client';

import { cn } from '@/lib/utilities';

/** Which rendering a preview panel shows: styled HTML or the paginated PDF. */
export type PreviewMode = 'html' | 'pdf';

/** Presentational contract for the HTML/PDF preview-mode switch. */
export interface PreviewModeToggleProperties {
  /** The currently selected preview mode. */
  mode: PreviewMode;
  /**
   * Called when the user picks a different preview mode.
   *
   * @param mode - The newly selected preview mode.
   */
  onModeChange: (mode: PreviewMode) => void;
}

/**
 * A small segmented control that switches the shared preview panel between its HTML and PDF
 * renderings. Both preview surfaces render this in their header so the choice reads the same on
 * either side, and the active mode is reflected via `aria-pressed` for assistive technology.
 *
 * @param properties - The current mode and the change handler.
 * @returns The two-button segmented toggle.
 */
export function PreviewModeToggle({ mode, onModeChange }: PreviewModeToggleProperties) {
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Preview mode">
      <button
        type="button"
        aria-pressed={mode === 'html'}
        data-testid="preview-mode-html"
        onClick={() => onModeChange('html')}
        className={cn(
          'rounded px-2 py-0.5 text-xs font-medium transition-colors',
          mode === 'html' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        HTML
      </button>
      <button
        type="button"
        aria-pressed={mode === 'pdf'}
        data-testid="preview-mode-pdf"
        onClick={() => onModeChange('pdf')}
        className={cn(
          'rounded px-2 py-0.5 text-xs font-medium transition-colors',
          mode === 'pdf' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        PDF
      </button>
    </div>
  );
}
