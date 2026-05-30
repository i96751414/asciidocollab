import { DomainError } from './domain-error';

/** Thrown when a registration attempt is made after the first user already exists. */
export class RegistrationClosedError extends DomainError {
  readonly name = 'RegistrationClosedError';

  /** Creates a new RegistrationClosedError. */
  constructor() {
    super('Registration is closed');
  }
}
