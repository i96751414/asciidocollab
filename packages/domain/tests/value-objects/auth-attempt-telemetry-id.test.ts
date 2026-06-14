import { AuthAttemptTelemetryId } from '../../src/value-objects/ids/auth-attempt-telemetry-id';
import { ValidationError } from '../../src/errors/common/validation-error';
import { randomUUID } from 'crypto';

describe('AuthAttemptTelemetryId', () => {
  test('creates from a valid UUID v4', () => {
    const uuid = randomUUID();
    const id = AuthAttemptTelemetryId.create(uuid);
    expect(id.value).toBe(uuid);
  });

  test('rejects an invalid UUID', () => {
    expect(() => AuthAttemptTelemetryId.create('not-a-uuid')).toThrow(ValidationError);
  });

  test('equality is type- and value-sensitive', () => {
    const uuid = randomUUID();
    expect(AuthAttemptTelemetryId.create(uuid).equals(AuthAttemptTelemetryId.create(uuid))).toBe(true);
    expect(AuthAttemptTelemetryId.create(uuid).equals(AuthAttemptTelemetryId.create(randomUUID()))).toBe(false);
  });
});
