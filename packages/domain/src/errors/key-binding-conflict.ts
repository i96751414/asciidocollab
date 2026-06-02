import { DomainError } from './domain-error';

/** Thrown when a key combo is already bound to another action in the same namespace. */
export class KeyBindingConflictError extends DomainError {
  readonly name = 'KeyBindingConflictError';

  /** Creates a KeyBindingConflictError identifying the new action and the existing conflicting action. */
  constructor(
    public readonly action: string,
    public readonly conflictingAction: string,
  ) {
    super('Key binding conflict');
  }
}
