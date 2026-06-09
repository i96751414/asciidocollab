import { DomainError } from './domain-error';

/** Reason a collaboration connection was denied — surfaced at the boundary for audit logging. */
export type CollabConnectionDenialReason = 'document_not_found' | 'cross_project' | 'not_a_member';

/**
 * Raised when a user may not open a collaboration connection to a document: the document does not
 * exist, it belongs to a different project than the one claimed in the room name, or the user is
 * not a member of the project. The `reason` lets the delivery layer log a precise audit reason.
 */
export class CollabConnectionDeniedError extends DomainError {
  readonly name = 'CollabConnectionDeniedError';

  /**
   * @param reason - The machine-readable denial reason for audit logging.
   */
  constructor(public readonly reason: CollabConnectionDenialReason) {
    super(`Collaboration connection denied: ${reason}`);
  }
}
