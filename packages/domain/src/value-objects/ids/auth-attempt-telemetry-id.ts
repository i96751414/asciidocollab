import { Uuid, validateUuid } from './uuid';

/** Unique identifier for a {@link AuthAttemptTelemetry} telemetry record. */
export class AuthAttemptTelemetryId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  /**
   * Creates a validated AuthAttemptTelemetryId.
   *
   * @param value - A UUID v4 string.
   * @returns A new AuthAttemptTelemetryId.
   * @throws {ValidationError} If the value is not a valid UUID v4.
   */
  static create(value: string): AuthAttemptTelemetryId {
    validateUuid(value, 'AuthAttemptTelemetryId');
    return new AuthAttemptTelemetryId(value);
  }
}
