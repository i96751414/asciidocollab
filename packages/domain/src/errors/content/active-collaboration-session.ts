import { DomainError } from '../domain-error';
import { DocumentId } from '../../value-objects/ids/document-id';

/** Returned when an operation is attempted on a document with an active collaboration room. */
export class ActiveCollaborationSessionError extends DomainError {
  readonly name = 'ActiveCollaborationSessionError';

  /** Creates an error indicating the given document has an active collaboration room. */
  constructor(documentId: DocumentId) {
    super(`Document ${documentId.value} has an active collaboration session`);
  }
}
