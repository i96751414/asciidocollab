import type { FastifyInstance } from 'fastify';

/**
 * Registers the health check route.
 *
 * @param app - The Fastify instance to register the route on.
 */
export async function healthRoute(app: FastifyInstance): Promise<void> {
  app.get('/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
          },
        },
      },
    },
  }, async () => {
    return { status: 'ok' };
  });
}
