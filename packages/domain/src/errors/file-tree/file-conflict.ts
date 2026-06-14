import { DomainError } from '../domain-error';

/**
 * Thrown when a file operation fails due to a naming or content conflict.
 * When the conflicting entity is known, `existingId` carries its identifier
 * so callers can locate and reuse it instead of creating a duplicate.
 */
export class FileConflictError extends DomainError {
  readonly name = 'FileConflictError';

  /**
   * @param message - Description of the conflict.
   * @param existingId - ID of the already-existing entity, if known.
   */
  constructor(message: string, public readonly existingId?: string) {
    super(message);
  }
}
