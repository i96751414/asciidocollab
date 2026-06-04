import { KeyBindingRepository } from '../../ports/user/key-binding.repository';
import { DEFAULT_KEY_BINDINGS } from '../../constants/key-bindings';

/** Represents a resolved key binding with its current combo and whether it is the default. */
export interface KeyBindingResult {
  /** The action identifier for this binding (e.g., 'file-tree:rename'). */
  action: string;
  /** Human-readable label for this action (e.g., 'Rename'). */
  label: string;
  /** The active key combination, either the user's custom value or the system default. */
  keyCombo: string;
  /** True if no custom binding has been saved and the default combo is in use. */
  isDefault: boolean;
}

/** Returns all key bindings for a user, merged with defaults. */
export class GetKeyBindingsUseCase {
  /** Initializes the use case with the key binding repository. */
  constructor(private readonly keyBindingRepo: KeyBindingRepository) {}

  /** Loads stored bindings for the user and merges them with defaults, optionally filtered by namespace. */
  async execute(userId: string, namespace?: string): Promise<KeyBindingResult[]> {
    const storedBindings = await this.keyBindingRepo.findAll(userId);
    const storedMap = new Map(storedBindings.map((b) => [b.action, b.keyCombo]));

    const entries = Object.entries(DEFAULT_KEY_BINDINGS);
    const filtered = namespace
      ? entries.filter(([, definition]) => definition.namespace === namespace)
      : entries;

    return filtered.map(([action, definition]) => {
      const stored = storedMap.get(action);
      return {
        action,
        label: definition.label,
        keyCombo: stored ?? definition.defaultCombo,
        isDefault: stored === undefined,
      };
    });
  }
}
