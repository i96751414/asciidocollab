import type { FastifyRequest } from 'fastify';
import type { Logger } from '@asciidocollab/domain';

/**
 * Adapts the per-request Fastify logger to the domain {@link Logger} port, so
 * a best-effort audit/telemetry write that fails inside a domain use case stays
 * observable in the request log (FR-021) instead of being silently swallowed.
 *
 * @param request - The current Fastify request.
 * @returns A domain Logger backed by `request.log`.
 */
export function requestLogger(request: FastifyRequest): Logger {
  return {
    warn: (message, meta) => request.log.warn(meta ?? {}, message),
  };
}
