/**
 * A subtle, on-demand indicator that some of the open document's inherited inputs are resolved from
 * last-saved content rather than a collaborator's live session — shown when a reachable related file's
 * current content could not be obtained live (a fetch failure or a dropped SSE delivery).
 *
 * Deliberately quiet: design-token styled (correct in light and dark), no disruptive warning colour,
 * and it renders nothing when everything is live. It carries an accessible label and a tooltip
 * explaining the state rather than shouting an error.
 */
interface NonLiveIndicatorProperties {
  /** Whether some inherited inputs are currently from last-saved (non-live) content. */
  active: boolean;
}

/** Renders the subtle non-live indicator, or nothing when all inputs are live. */
export function NonLiveIndicator({ active }: NonLiveIndicatorProperties): React.JSX.Element | null {
  if (!active) return null;
  return (
    <span
      role="status"
      aria-live="polite"
      title="Some related content is from the last save, not a live session. It refreshes automatically when the connection recovers."
      className="inline-flex items-center gap-1 text-xs text-muted-foreground select-none"
      data-testid="non-live-indicator"
    >
      <span aria-hidden className="inline-block size-1.5 rounded-full bg-muted-foreground/60" />
      Last-saved
    </span>
  );
}
