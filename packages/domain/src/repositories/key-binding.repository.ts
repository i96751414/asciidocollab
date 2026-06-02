import type { KeyBinding } from '../entities/key-binding';

/** Repository for user key binding persistence. */
export interface KeyBindingRepository {
  /**
   * Returns all stored key bindings for the given user.
   *
   * @param userId - The user whose bindings to retrieve.
   */
  findAll(userId: string): Promise<KeyBinding[]>;
  /**
   * Inserts or updates the key binding for the given user action.
   *
   * @param userId - The user who owns the binding.
   * @param action - The action identifier to bind.
   * @param keyCombo - The key combination string to associate with the action.
   */
  upsert(userId: string, action: string, keyCombo: string): Promise<void>;
  /**
   * Removes the custom key binding for the given user action.
   *
   * @param userId - The user who owns the binding.
   * @param action - The action identifier whose custom binding should be removed.
   */
  delete(userId: string, action: string): Promise<void>;
}
