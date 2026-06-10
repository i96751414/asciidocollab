import { RequestContext } from '../types/request-context';

/**
 * Folds request origin (IP / user-agent) into audit metadata under a stable
 * `origin` key (FR-017), without mutating the input. Omits `origin` entirely
 * when no context (or an empty context) is provided — e.g. Background/system
 * actions. Centralized so every audit write produces the same origin shape.
 *
 * @param metadata - Event-specific metadata (e.g. Before/after values).
 * @param context - Optional request origin.
 * @returns A new metadata object, with `origin` added when available.
 */
export function withOrigin(
  metadata: Record<string, unknown>,
  context?: RequestContext,
): Record<string, unknown> {
  if (context && (context.ipAddress !== undefined || context.userAgent !== undefined)) {
    return { ...metadata, origin: { ipAddress: context.ipAddress, userAgent: context.userAgent } };
  }
  return { ...metadata };
}
