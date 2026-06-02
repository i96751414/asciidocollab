import { KeyBindingRepository } from '../repositories/key-binding.repository';
import { DEFAULT_KEY_BINDINGS } from '../constants/key-bindings';
import { ValidationError } from '../errors/validation-error';
import { DomainError } from '../errors/domain-error';
import { Result } from '../types/result';

/** Resets a user's key binding to the system default. */
export class ResetKeyBindingUseCase {
  /** Initializes the use case with the key binding repository. */
  constructor(private readonly keyBindingRepo: KeyBindingRepository) {}

  /** Validates that the action exists, then deletes the custom binding so the default takes effect. */
  async execute(userId: string, action: string): Promise<Result<void, DomainError>> {
    if (!DEFAULT_KEY_BINDINGS[action]) {
      return { success: false, error: new ValidationError(`Unknown action: ${action}`) };
    }

    await this.keyBindingRepo.delete(userId, action);
    return { success: true, value: undefined };
  }
}
