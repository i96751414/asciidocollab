'use client';

import { cn } from '@/lib/utilities';

/** Supported preview style token values (lowercase, as stored/transported). */
export type PreviewStyleValue = 'asciidocollab' | 'asciidoctor';

/** Display labels for each token. Labels are display-only and never stored. */
export const PREVIEW_STYLE_LABELS: Record<PreviewStyleValue, string> = {
  asciidocollab: 'Asciidocollab',
  asciidoctor: 'Asciidoctor',
};

const OPTIONS: readonly PreviewStyleValue[] = ['asciidocollab', 'asciidoctor'];
// Same list, widened to string[] so the guard can test an arbitrary string without a cast.
const OPTION_TOKENS: readonly string[] = OPTIONS;

/** Returns true when `value` is a recognised preview style token. The single web-side source of truth. */
export function isPreviewStyleValue(value: string): value is PreviewStyleValue {
  return OPTION_TOKENS.includes(value);
}

interface PreviewStyleControlProperties {
  /** Currently active style token. */
  value: PreviewStyleValue;
  /**
   * Called when the user picks an option.
   *
   * @param value - The newly selected style token.
   */
  onChange: (value: PreviewStyleValue) => void;
  /** Renders a denser variant for the preview header row. */
  compact?: boolean;
  /** Optional id-friendly label for the surrounding group (accessibility). */
  ariaLabel?: string;
}

/** Two-option segmented control for choosing the preview rendering style. */
export function PreviewStyleControl({
  value,
  onChange,
  compact = false,
  ariaLabel = 'Preview style',
}: PreviewStyleControlProperties) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('inline-flex rounded-md border border-border', compact ? 'h-6' : 'h-9')}
    >
      {OPTIONS.map((option, index) => {
        const isActive = value === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option)}
            data-testid={`preview-style-${option}`}
            className={cn(
              'transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              compact ? 'px-2 text-xs' : 'px-3 text-sm',
              index === 0 ? 'rounded-l-[5px]' : 'rounded-r-[5px] border-l border-border',
              isActive
                ? 'bg-accent font-medium text-foreground'
                : 'text-muted-foreground hover:bg-accent/50',
            )}
          >
            {PREVIEW_STYLE_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}
