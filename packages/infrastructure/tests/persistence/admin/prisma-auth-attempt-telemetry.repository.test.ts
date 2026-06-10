import { PrismaClient } from '@prisma/client';
import {
  AuthAttemptTelemetryRepository,
  AUTH_ATTEMPT_FAILED_SIGN_IN,
  AUTH_ATTEMPT_PASSWORD_RESET_REQUEST,
} from '@asciidocollab/domain';
import { PrismaAuthAttemptTelemetryRepository } from '../../../src/persistence/admin/prisma-auth-attempt-telemetry.repository';
import { startTestContainer, stopTestContainer, TestContainer } from '../../helpers/prisma-test-container';

const WINDOW = new Date('2026-06-10T12:00:00.000Z');
const LATER_WINDOW = new Date('2026-06-10T13:00:00.000Z');

describe('PrismaAuthAttemptTelemetryRepository', () => {
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

  it('coalesces repeated failures for the same (identifier, ip, window) into one bucket', async () => {
    for (let index = 0; index < 4; index++) {
      await repo.record({
        eventType: AUTH_ATTEMPT_FAILED_SIGN_IN,
        identifier: 'user@example.com',
        ipAddress: '203.0.113.7',
        userAgent: 'agent',
        windowStart: WINDOW,
        now: new Date(WINDOW.getTime() + index * 1000),
      });
    }
    const all = await repo.findAll();
    expect(all).toHaveLength(1);
    expect(all[0].attemptCount).toBe(4);
    expect(all[0].firstAttemptAt.getTime()).toBe(WINDOW.getTime());
    expect(all[0].lastAttemptAt.getTime()).toBe(WINDOW.getTime() + 3000);
  });

  it('coalesces equally when the IP is the "unknown" sentinel', async () => {
    for (let index = 0; index < 3; index++) {
      await repo.record({ eventType: AUTH_ATTEMPT_FAILED_SIGN_IN, identifier: 'user@example.com', ipAddress: 'unknown', userAgent: null, windowStart: WINDOW, now: WINDOW });
    }
    const all = await repo.findAll();
    expect(all).toHaveLength(1);
    expect(all[0].attemptCount).toBe(3);
    expect(all[0].ipAddress).toBe('unknown');
  });

  it('keeps distinct buckets per identifier, ip, and window', async () => {
    await repo.record({ eventType: AUTH_ATTEMPT_FAILED_SIGN_IN, identifier: 'a@x.com', ipAddress: '1.1.1.1', userAgent: null, windowStart: WINDOW, now: WINDOW });
    await repo.record({ eventType: AUTH_ATTEMPT_FAILED_SIGN_IN, identifier: 'b@x.com', ipAddress: '1.1.1.1', userAgent: null, windowStart: WINDOW, now: WINDOW });
    await repo.record({ eventType: AUTH_ATTEMPT_FAILED_SIGN_IN, identifier: 'a@x.com', ipAddress: '1.1.1.1', userAgent: null, windowStart: LATER_WINDOW, now: LATER_WINDOW });
    expect(await repo.findAll()).toHaveLength(3);
  });

  it('deleteOlderThan removes only buckets older than the cutoff and returns the count', async () => {
    await repo.record({ eventType: AUTH_ATTEMPT_FAILED_SIGN_IN, identifier: 'a@x.com', ipAddress: '1.1.1.1', userAgent: null, windowStart: WINDOW, now: WINDOW });
    await repo.record({ eventType: AUTH_ATTEMPT_FAILED_SIGN_IN, identifier: 'a@x.com', ipAddress: '1.1.1.1', userAgent: null, windowStart: LATER_WINDOW, now: LATER_WINDOW });
    const deleted = await repo.deleteOlderThan(new Date('2026-06-10T12:30:00.000Z'));
    expect(deleted).toBe(1);
    const remaining = await repo.findAll();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].windowStart.getTime()).toBe(LATER_WINDOW.getTime());
  });

  it('keeps distinct buckets per eventType even for the same identifier/ip/window', async () => {
    await repo.record({ eventType: AUTH_ATTEMPT_FAILED_SIGN_IN, identifier: 'a@x.com', ipAddress: '1.1.1.1', userAgent: null, windowStart: WINDOW, now: WINDOW });
    await repo.record({ eventType: AUTH_ATTEMPT_PASSWORD_RESET_REQUEST, identifier: 'a@x.com', ipAddress: '1.1.1.1', userAgent: null, windowStart: WINDOW, now: WINDOW });
    expect(await repo.findAll()).toHaveLength(2);
  });

  it('findWithFilters can restrict to a single eventType', async () => {
    await repo.record({ eventType: AUTH_ATTEMPT_FAILED_SIGN_IN, identifier: 'a@x.com', ipAddress: '1.1.1.1', userAgent: null, windowStart: WINDOW, now: WINDOW });
    await repo.record({ eventType: AUTH_ATTEMPT_PASSWORD_RESET_REQUEST, identifier: 'a@x.com', ipAddress: '1.1.1.1', userAgent: null, windowStart: WINDOW, now: WINDOW });

    const resets = await repo.findWithFilters({ eventType: AUTH_ATTEMPT_PASSWORD_RESET_REQUEST }, { page: 1, limit: 50 });
    expect(resets.total).toBe(1);
    expect(resets.items[0].eventType).toBe(AUTH_ATTEMPT_PASSWORD_RESET_REQUEST);
  });

  it('findWithFilters filters by identifier and paginates', async () => {
    await repo.record({ eventType: AUTH_ATTEMPT_FAILED_SIGN_IN, identifier: 'a@x.com', ipAddress: '1.1.1.1', userAgent: null, windowStart: WINDOW, now: WINDOW });
    await repo.record({ eventType: AUTH_ATTEMPT_FAILED_SIGN_IN, identifier: 'b@x.com', ipAddress: '1.1.1.1', userAgent: null, windowStart: WINDOW, now: WINDOW });

    const filtered = await repo.findWithFilters({ identifier: 'a@x.com' }, { page: 1, limit: 50 });
    expect(filtered.total).toBe(1);
    expect(filtered.items[0].identifier).toBe('a@x.com');

    const page1 = await repo.findWithFilters({}, { page: 1, limit: 1 });
    expect(page1.total).toBe(2);
    expect(page1.items).toHaveLength(1);
  });
});
