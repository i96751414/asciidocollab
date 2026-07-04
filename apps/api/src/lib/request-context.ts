import type { FastifyRequest } from 'fastify';
import type { RequestContext } from '@asciidocollab/domain';

/**
 * Builds a {@link RequestContext} from a Fastify request, capturing the request
 * origin (source IP and user-agent) for audit metadata.
 *
 * `request.ip` already reflects the configured proxy / `X-Forwarded-For` trust.
 *
 * @param request - The incoming Fastify request.
 * @returns The request origin context.
 */
export function requestContextFrom(request: FastifyRequest): RequestContext {
  return {
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  };
}
