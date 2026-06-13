import { DomainError } from './domain-error';

/**
 * Raised when the node designated as a project's main file does not exist or
 * does not belong to the project (FR-045). Maps to HTTP 404.
 */
export class MainFileNotFoundError extends DomainError {
  readonly name = 'MainFileNotFoundError';
  /** @param nodeId - The missing node id. */
  constructor(nodeId: string) {
    super(`Main file node not found in project: ${nodeId}`);
  }
}
