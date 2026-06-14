import { readFileSync } from 'node:fs';
import pino from 'pino';
import { compositionRoot } from './composition-root.js';
import { startOrphanedRoomWatchdog } from './watchdog.js';
import { verifySharedStorage } from './storage-probe.js';
import { startInternalEditServer } from './internal-edit-server.js';

const logger = pino({
  redact: ['req.headers.cookie', 'req.headers.Cookie'],
});

async function main() {
  const root = await compositionRoot();
  const { server, prisma, collaborationSessionRepo, config } = root;

  // Refuse to start unless we share a physical storage root with the API. Running with
  // divergent storage silently loses collaborative edits and lets the two sides overwrite
  // each other, so this is a hard precondition rather than a warning (throws → exit 1 below).
  await verifySharedStorage({
    storagePath: config.get('storagePath'),
    apiInternalUrl: config.get('apiInternalUrl'),
    timeoutMs: config.get('authTimeoutMs'),
    ...(root.mtlsFetch && { fetch: root.mtlsFetch }),
    logger,
  });

  await collaborationSessionRepo.closeAll();

  const watchdogIntervalMs = config.get('watchdogIntervalMs');
  // v4: the live-document map lives on the inner Hocuspocus instance, not the Server wrapper.
  const watchdogInterval = startOrphanedRoomWatchdog(
    server.hocuspocus,
    root.documentRepository,
    watchdogIntervalMs,
  );

  await server.listen();

  const port = config.get('port');
  logger.info({ port }, 'Collab server listening');

  // Internal endpoint that lets the API apply cross-file reference rewrites to LIVE documents via
  // the Yjs source of truth (avoids the clobber where a direct file-store write is reverted by the
  // next writeback). Bound to loopback; secret-gated when configured.
  const editSecret = config.get('internalEditSecret');
  const editTlsCert = config.get('internalEditTls.cert');
  const editTlsKey = config.get('internalEditTls.key');
  const editTlsClientCa = config.get('internalEditTls.clientCa');
  const editTls = editTlsCert && editTlsKey && editTlsClientCa
    ? { cert: readFileSync(editTlsCert), key: readFileSync(editTlsKey), clientCa: readFileSync(editTlsClientCa) }
    : undefined;
  const internalEditServer = startInternalEditServer({
    hocuspocus: server.hocuspocus,
    yjsStateStore: root.yjsStateStore,
    host: config.get('internalEditHost'),
    port: config.get('internalEditPort'),
    ...(editSecret ? { secret: editSecret } : {}),
    ...(editTls ? { tls: editTls } : {}),
    logger,
  });

  async function shutdown() {
    logger.info('Shutting down collab server…');
    try {
      clearInterval(watchdogInterval);
      await new Promise<void>((resolve) => internalEditServer.close(() => resolve()));
      await server.destroy();
      await collaborationSessionRepo.closeAll();
      await prisma.$disconnect();
      logger.info('Shutdown complete');
    } catch (error) {
      logger.error({ err: error }, 'Error during shutdown');
      process.exit(1);
    }
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  logger.error({ err: error }, 'Fatal error during startup');
  process.exit(1);
});
