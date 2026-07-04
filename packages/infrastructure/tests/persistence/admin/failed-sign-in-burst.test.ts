import { PrismaClient } from '@prisma/client';
import { AuthAttemptTelemetryRepository, AUTH_ATTEMPT_FAILED_SIGN_IN } from '@asciidocollab/domain';
import { PrismaAuthAttemptTelemetryRepository } from '../../../src/persistence/admin/prisma-auth-attempt-telemetry.repository';
import { startTestContainer, stopTestContainer, TestContainer } from '../../helpers/prisma-test-container';

const WINDOW = new Date('2026-06-10T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Under a simulated distributed failed-login burst, stored rows grow
 * sub-linearly (coalescing), and records older than the retention window are
 * absent after a purge cycle.
 */
describe('AuthAttemptTelemetry burst & retention', () => {
  let container: TestContainer;
  let client: PrismaClient;
  let repo: AuthAttemptTelemetryRepository;

  beforeAll(async () => {
    container = await startTestContainer();
    client = container.client;
    repo = new PrismaAuthAttemptTelemetryRepository(client);
  });

  afterAll(async () => {
    await stopTestContainer(container);
  });

  beforeEach(async () => {
    await client.authAttemptTelemetry.deleteMany();
  });

  it('grows sub-linearly: 500 attempts across 10 accounts × 5 IPs in one window ⇒ 50 rows', async () => {
    const accounts = Array.from({ length: 10 }, (_, index) => `user${index}@example.com`);
    const ips = Array.from({ length: 5 }, (_, index) => `203.0.113.${index}`);
    let attempts = 0;
    for (let round = 0; round < 10; round++) {
      for (const identifier of accounts) {
        for (const ipAddress of ips) {
          await repo.record({ eventType: AUTH_ATTEMPT_FAILED_SIGN_IN, identifier, ipAddress, userAgent: null, windowStart: WINDOW, now: WINDOW });
          attempts++;
        }
      }
    }
    expect(attempts).toBe(500);
    const all = await repo.findAll();
    // 10 accounts × 5 IPs = 50 distinct buckets, regardless of the 500 attempts.
    expect(all).toHaveLength(50);
    expect(all.every((a) => a.attemptCount === 10)).toBe(true);
  });

  it('coalesces unknown-IP attempts into a single bucket (no per-attempt rows)', async () => {
    for (let index = 0; index < 25; index++) {
      await repo.record({ eventType: AUTH_ATTEMPT_FAILED_SIGN_IN, identifier: 'spray@example.com', ipAddress: 'unknown', userAgent: null, windowStart: WINDOW, now: WINDOW });
    }
    const all = await repo.findAll();
    expect(all).toHaveLength(1);
    expect(all[0].attemptCount).toBe(25);
  });

  it('purge removes buckets older than the retention window', async () => {
    const now = new Date('2026-09-10T00:00:00.000Z');
    const old = new Date(now.getTime() - 100 * DAY_MS);
    const recent = new Date(now.getTime() - 10 * DAY_MS);
    await repo.record({ eventType: AUTH_ATTEMPT_FAILED_SIGN_IN, identifier: 'old@x.com', ipAddress: '1.1.1.1', userAgent: null, windowStart: old, now: old });
    await repo.record({ eventType: AUTH_ATTEMPT_FAILED_SIGN_IN, identifier: 'recent@x.com', ipAddress: '1.1.1.1', userAgent: null, windowStart: recent, now: recent });

    const deleted = await repo.deleteOlderThan(new Date(now.getTime() - 90 * DAY_MS));
    expect(deleted).toBe(1);
    const remaining = await repo.findAll();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].identifier).toBe('recent@x.com');
  });
});
