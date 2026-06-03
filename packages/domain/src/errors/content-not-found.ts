import { DomainError } from './domain-error';

/** Thrown when a DB record exists but its corresponding filesystem file is missing. */
export class ContentNotFoundError extends DomainError {
  readonly name = 'ContentNotFoundError';

  /** Stores the internal path for server-side logging only — never sent to clients. */
  readonly internalPath: string;

  /** Creates a ContentNotFoundError recording the missing file path for server-side diagnostics. */
  constructor(path: string) {
    super('Content not found');
    this.internalPath = path;
  }
}
