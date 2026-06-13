import { DomainError } from './domain-error';

/**
 * Raised when the node designated as a project's main file is not an AsciiDoc
 * file (folder or non-`.adoc` extension) (FR-045). Maps to HTTP 400.
 */
export class MainFileNotAsciidocError extends DomainError {
  readonly name = 'MainFileNotAsciidocError';
  /** @param nodeId - The offending node id. */
  constructor(nodeId: string) {
    super(`Main file node is not an AsciiDoc file: ${nodeId}`);
  }
}
