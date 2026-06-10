import { RecordFailedSignInUseCase, UNKNOWN_IP } from '../../../src/use-cases/auth/record-failed-sign-in';
import { InMemoryAuthAttemptTelemetryRepository } from '../../ports/admin/in-memory-auth-attempt-telemetry.repository';
import { Email } from '../../../src/value-objects/email';

const WINDOW_MS = 60 * 60 * 1000; // 1 hour

describe('RecordFailedSignInUseCase', () => {
  let repo: InMemoryAuthAttemptTelemetryRepository;
  let useCase: RecordFailedSignInUseCase;

  beforeEach(() => {
    repo = new InMemoryAuthAttemptTelemetryRepository();
    useCase = new RecordFailedSignInUseCase(repo);
  });

  test('INV-1: failures within the same window coalesce into one bucket', async () => {
    const base = new Date('2026-06-10T12:05:00.000Z');
    await useCase.execute({ identifier: Email.create('user@example.com'), context: { ipAddress: '1.1.1.1' }, now: base, windowSizeMs: WINDOW_MS });
    await useCase.execute({ identifier: Email.create('user@example.com'), context: { ipAddress: '1.1.1.1' }, now: new Date('2026-06-10T12:55:00.000Z'), windowSizeMs: WINDOW_MS });

    const all = await repo.findAll();
    expect(all).toHaveLength(1);
    expect(all[0].attemptCount).toBe(2);
    // Window floored to the hour.
    expect(all[0].windowStart.toISOString()).toBe('2026-06-10T12:00:00.000Z');
  });

  test('INV-2: record shape is identical regardless of account existence (no user lookup performed)', async () => {
    const now = new Date('2026-06-10T12:00:00.000Z');
    await useCase.execute({ identifier: Email.create('exists@example.com'), context: { ipAddress: '1.1.1.1' }, now, windowSizeMs: WINDOW_MS });
    await useCase.execute({ identifier: Email.create('ghost@example.com'), context: { ipAddress: '1.1.1.1' }, now, windowSizeMs: WINDOW_MS });

    const all = await repo.findAll();
    const a = all.find((x) => x.identifier === 'exists@example.com')!;
    const b = all.find((x) => x.identifier === 'ghost@example.com')!;
    expect(Object.keys({ ...a })).toEqual(Object.keys({ ...b }));
    expect(a.attemptCount).toBe(b.attemptCount);
  });

  test('INV-3: identifier is the validated email; no secret is part of the input', async () => {
    const now = new Date('2026-06-10T12:00:00.000Z');
    await useCase.execute({ identifier: Email.create('User@Example.com'), context: {}, now, windowSizeMs: WINDOW_MS });
    const all = await repo.findAll();
    // Email is normalized; nothing resembling a password is stored.
    expect(all[0].identifier).toBe('user@example.com');
  });

  test('stores the "unknown" sentinel when no IP is available', async () => {
    const now = new Date('2026-06-10T12:00:00.000Z');
    await useCase.execute({ identifier: Email.create('user@example.com'), context: {}, now, windowSizeMs: WINDOW_MS });
    const all = await repo.findAll();
    expect(all[0].ipAddress).toBe(UNKNOWN_IP);
  });

  test('rejects a non-positive windowSizeMs instead of producing an Invalid Date (silent telemetry loss)', async () => {
    const now = new Date('2026-06-10T12:00:00.000Z');
    await expect(
      useCase.execute({ identifier: Email.create('user@example.com'), context: {}, now, windowSizeMs: 0 }),
    ).rejects.toThrow();
    expect(await repo.findAll()).toHaveLength(0);
  });
});
