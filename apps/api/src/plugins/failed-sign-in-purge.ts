import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { PurgeAuthAttemptTelemetryUseCase } from '@asciidocollab/domain';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Runs a single purge pass of expired failed sign-in telemetry and logs the
 * deleted count (observability). Exported for deterministic testing.
 *
 * @param app - The Fastify instance (provides config + repos).
 * @returns The number of telemetry buckets purged.
 */
export async function runFailedSignInPurge(app: FastifyInstance): Promise<number> {
  const retentionWindowMs = app.config.failedSignIn.retentionDays * DAY_MS;
  const useCase = new PurgeAuthAttemptTelemetryUseCase(app.repos.authAttemptTelemetry);
  const result = await useCase.execute({ now: new Date(), retentionWindowMs });
  if (!result.success) return 0;
  app.log.info({ deleted: result.value.deleted }, 'purged expired account-security telemetry');
  return result.value.deleted;
}

/**
 * Schedules the failed sign-in telemetry purge on a fixed interval. The
 * timer is unref'd so it never keeps the process alive, and cleared on close.
 */
async function plugin(app: FastifyInstance): Promise<void> {
  const intervalMs = app.config.failedSignIn.purgeIntervalHours * HOUR_MS;
  const timer = setInterval(() => {
    void runFailedSignInPurge(app).catch((error) =>
      app.log.warn({ err: error }, 'failed sign-in telemetry purge failed'),
    );
  }, intervalMs);
  timer.unref();

  app.addHook('onClose', (_instance, done) => {
    clearInterval(timer);
    done();
  });
}

/** Fastify plugin that runs the scheduled failed sign-in telemetry purge. */
export const failedSignInPurge = fp(plugin, { name: 'failed-sign-in-purge' });
