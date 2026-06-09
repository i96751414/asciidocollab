import type { Logger } from 'pino';

/** Structured details of a collaboration connection denial — actor (if known), resource, reason. */
export interface CollabConnectionDenial {
  /** The authenticated user id, omitted when the denial happens before authentication. */
  actor?: string;
  /** The room/document the connection targeted. */
  resource: string;
  /** A short machine-readable reason, such as `origin_not_allowed` or `max_connections_exceeded`. */
  reason: string;
}

/**
 * Audits a collaboration WebSocket connection denial (Security Constitution §Audit / SEC4) in one
 * consistent shape, never logging the session cookie or other secrets. `actor` is dropped from the
 * output when undefined, such as origin/auth failures that occur before the user is authenticated.
 */
export function logCollabConnectionDenial(logger: Logger, denial: CollabConnectionDenial): void {
  logger.warn({ actor: denial.actor, resource: denial.resource, reason: denial.reason }, 'collab connection rejected');
}
