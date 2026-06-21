import type { FastifyReply } from 'fastify';

/**
 * Copies Fastify-managed headers (e.g., CORS set by onRequest hooks) to reply.raw.
 * Required before bypassing Fastify's normal send path (e.g., piping directly to reply.raw).
 * Fastify stores headers in its own kReplyHeaders map and never flushes them to the socket automatically.
 */
export function flushFastifyHeadersToRaw(reply: FastifyReply): void {
  for (const [name, value] of Object.entries(reply.getHeaders())) {
    if (value !== undefined) {
      reply.raw.setHeader(name, Array.isArray(value) ? value.map(String) : String(value));
    }
  }
}
