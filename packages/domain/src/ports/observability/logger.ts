/**
 * Minimal observability port for best-effort side-effects (e.g. Audit writes)
 * that must never fail the surrounding operation but must remain observable
 * (audit-write failures must not be silently discarded).
 *
 * Infrastructure/delivery provides an adapter (e.g. Over the request logger);
 * the domain depends only on this interface. It is intentionally optional at
 * call sites — a missing logger degrades to silence, never to a crash.
 */
export interface Logger {
  /**
   * Records a non-fatal warning with optional structured context.
   *
   * @param message - Human-readable description of the non-fatal failure.
   * @param meta - Optional structured context (e.g. `{ error, action }`).
   */
  warn(message: string, meta?: Record<string, unknown>): void;
}
