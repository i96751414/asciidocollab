import { DomainError } from './domain-error';

/** Thrown when a notification delivery attempt fails (e.g. SMTP error). */
export class NotificationDeliveryError extends DomainError {
  readonly name = 'NotificationDeliveryError';

  /** Creates a new NotificationDeliveryError, optionally wrapping the underlying cause. */
  constructor(cause?: Error) {
    super('Notification delivery failed');
    if (cause) this.cause = cause;
  }
}
