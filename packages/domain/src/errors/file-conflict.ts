import { DomainError } from './domain-error';

/**
 * Thrown when a file operation fails due to a naming or content conflict.
 * When the conflicting entity is known, `existingId` carries its identifier
 * so callers can locate and reuse it instead of creating a duplicate.
 */
export class FileConflictError extends DomainError {
  readonly name = 'FileConflictError';

  constructor(message: string, public readonly existingId?: string) {
    super(message);
  }
}
