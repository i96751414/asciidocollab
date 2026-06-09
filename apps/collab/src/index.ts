import pino from 'pino';
import { compositionRoot } from './composition-root';
import { startOrphanedRoomWatchdog } from './watchdog';
import { verifySharedStorage } from './storage-probe';

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
  const watchdogInterval = startOrphanedRoomWatchdog(
    server,
    root.documentRepository,
    watchdogIntervalMs,
  );

  await server.listen();

  const port = config.get('port');
  logger.info({ port }, 'Collab server listening');

  async function shutdown() {
    logger.info('Shutting down collab server…');
    try {
      clearInterval(watchdogInterval);
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
