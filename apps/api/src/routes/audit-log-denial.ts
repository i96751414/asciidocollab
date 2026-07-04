import type { FastifyBaseLogger } from 'fastify';

/** Structured details of an authorization denial — actor, resource, reason; never secrets. */
export interface AuthorizationDenial {
  /** The authenticated user id that was denied, or undefined when unknown. */
  actor: string | undefined;
  /** The resource the actor was denied, such as a room name or `projects/:id/files/:id`. */
  resource: string;
  /** A short machine-readable reason, such as `not_a_member` or `cross_project`. */
  reason: string;
}

/**
 * Audits an authorization denial (Security Constitution §Audit): logs the actor, resource,
 * and reason in one consistent shape and never includes the session cookie or other secrets.
 * Centralized so the audit contract is enforced identically everywhere it is emitted.
 */
export function logAuthorizationDenial(log: FastifyBaseLogger, denial: AuthorizationDenial): void {
  log.warn({ actor: denial.actor, resource: denial.resource, reason: denial.reason }, 'collab authorization denied');
}
