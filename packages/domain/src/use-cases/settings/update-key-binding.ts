import { KeyBindingRepository } from '../../ports/user/key-binding.repository';
import { DEFAULT_KEY_BINDINGS, RESERVED_KEY_COMBOS } from '../../constants/key-bindings';
import { KeyBindingConflictError } from '../../errors/editor/key-binding-conflict';
import { ValidationError } from '../../errors/common/validation-error';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';

/** Updates a single key binding for a user. */
export class UpdateKeyBindingUseCase {
  /** Initializes the use case with the key binding repository. */
  constructor(private readonly keyBindingRepo: KeyBindingRepository) {}

  /** Validates the action, checks for reserved combos and namespace conflicts, then persists the new binding. */
  async execute(userId: string, action: string, keyCombo: string): Promise<Result<void, DomainError>> {
    const definition = DEFAULT_KEY_BINDINGS[action];
    if (!definition) {
      return { success: false, error: new ValidationError(`Unknown action: ${action}`) };
    }

    if (RESERVED_KEY_COMBOS.includes(keyCombo)) {
      return { success: false, error: new ValidationError(`Key combo '${keyCombo}' is reserved`) };
    }

    const existingBindings = await this.keyBindingRepo.findAll(userId);
    const namespace = definition.namespace;

    for (const binding of existingBindings) {
      if (binding.action === action) continue;
      const bindingDefinition = DEFAULT_KEY_BINDINGS[binding.action];
      if (bindingDefinition?.namespace === namespace && binding.keyCombo === keyCombo) {
        return { success: false, error: new KeyBindingConflictError(action, binding.action) };
      }
    }

    // Also check default combos in the same namespace for conflict
    for (const [existingAction, existingDefinition] of Object.entries(DEFAULT_KEY_BINDINGS)) {
      if (existingAction === action) continue;
      if (existingDefinition.namespace !== namespace) continue;
      // Only conflict if this action doesn't have a custom binding
      const hasCustom = existingBindings.some((b) => b.action === existingAction);
      if (!hasCustom && existingDefinition.defaultCombo === keyCombo) {
        return { success: false, error: new KeyBindingConflictError(action, existingAction) };
      }
    }

    await this.keyBindingRepo.upsert(userId, action, keyCombo);
    return { success: true, value: undefined };
  }
}
