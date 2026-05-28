import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

async function httpsRedirectPlugin(app: FastifyInstance): Promise<void> {
  if (!app.config.api.httpsRedirect) {
    return;
  }

  const trustProxy = app.config.api.trustProxy;

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const forwardedProto = request.headers['x-forwarded-proto'];
    const proto = trustProxy
      ? (typeof forwardedProto === 'string' ? forwardedProto : request.protocol)
      : request.protocol;
    if (proto === 'http') {
      const hostHeader = request.headers.host;
      const host = (typeof hostHeader === 'string' ? hostHeader : null) ?? request.hostname;
      const url = request.url;
      reply.redirect(`https://${host}${url}`, 301);
    }
  });
}

export const httpsRedirectPluginWrapped = fp(httpsRedirectPlugin, {
  name: 'https-redirect-plugin',
});
