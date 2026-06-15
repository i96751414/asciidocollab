import { DomainError } from '../domain-error';

/**
 * Thrown when the caller does not have the required permissions for an operation.
 */
export class PermissionDeniedError extends DomainError {
  readonly name = 'PermissionDeniedError';

  /**
   * @param message - Optional custom message (defaults to "Permission denied").
   * @param resourceType - Optional kind of resource the actor was denied (e.g. `FileNode`).
   * @param resourceId - Optional identity of the resource the actor was denied.
   * @param reason - Optional machine-friendly reason for the denial.
   */
  constructor(
    message = 'Permission denied',
    public readonly resourceType?: string,
    public readonly resourceId?: string,
    public readonly reason?: string,
  ) {
    super(message);
  }
}
