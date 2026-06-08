import pino from 'pino';
import { compositionRoot } from './composition-root';
import { startOrphanedRoomWatchdog } from './watchdog';

const logger = pino({
  redact: ['req.headers.cookie', 'req.headers.Cookie'],
});

async function main() {
  const root = await compositionRoot();
  const { server, prisma, collaborationSessionRepo, config } = root;

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
