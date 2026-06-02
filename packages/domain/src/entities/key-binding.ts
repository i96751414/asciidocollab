/** Represents a user-defined keyboard binding for a named action. */
export interface KeyBinding {
  /** Identifier of the user who owns this binding. */
  userId: string;
  /** The action identifier this binding applies to (e.g., 'file-tree:rename'). */
  action: string;
  /** The key combination string for this binding (e.g., 'Ctrl+R'). */
  keyCombo: string;
}
