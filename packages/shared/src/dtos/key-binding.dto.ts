/** DTO for a user key binding returned to API clients. */
export interface KeyBindingDto {
  /** The action identifier this binding applies to (e.g., 'file-tree:rename'). */
  action: string;
  /** The active key combination string for this action. */
  keyCombo: string;
  /** True if the user has not customized this binding and the default is in use. */
  isDefault: boolean;
}
