import {
  AuthAttemptTelemetry,
  AUTH_ATTEMPT_FAILED_SIGN_IN,
} from '../../src/entities/auth-attempt-telemetry';
import { AuthAttemptTelemetryId } from '../../src/value-objects/auth-attempt-telemetry-id';
import { ValidationError } from '../../src/errors/validation-error';
import { randomUUID } from 'crypto';

function makeAttempt(attemptCount: number): AuthAttemptTelemetry {
  const now = new Date('2026-06-10T12:00:00.000Z');
  return new AuthAttemptTelemetry(
    AuthAttemptTelemetryId.create(randomUUID()),
    AUTH_ATTEMPT_FAILED_SIGN_IN,
    'user@example.com',
    '203.0.113.7',
    'Mozilla/5.0',
    now,
    attemptCount,
    now,
    now,
  );
}

describe('AuthAttemptTelemetry', () => {
  test('holds its fields as readonly data', () => {
    const a = makeAttempt(3);
    expect(a.eventType).toBe(AUTH_ATTEMPT_FAILED_SIGN_IN);
    expect(a.identifier).toBe('user@example.com');
    expect(a.ipAddress).toBe('203.0.113.7');
    expect(a.attemptCount).toBe(3);
  });

  test('rejects attemptCount below 1', () => {
    expect(() => makeAttempt(0)).toThrow(ValidationError);
  });

  test('rejects a non-integer attemptCount', () => {
    expect(() => makeAttempt(1.5)).toThrow(ValidationError);
  });
});
