/** Definition of a registerable key binding action. */
export interface KeyBindingDefinition {
  /** The namespace grouping for this action (e.g., 'file-tree'). */
  namespace: string;
  /** Human-readable label for this action. */
  label: string;
  /** Default key combination string for this action. */
  defaultCombo: string;
}

/** Registry of all known key binding actions with their defaults. */
export const DEFAULT_KEY_BINDINGS: Record<string, KeyBindingDefinition> = {
  'file-tree:rename': { namespace: 'file-tree', label: 'Rename', defaultCombo: 'F2' },
  'file-tree:delete': { namespace: 'file-tree', label: 'Delete', defaultCombo: 'Delete' },
  'file-tree:new-file': { namespace: 'file-tree', label: 'New File', defaultCombo: 'Ctrl+N' },
  'file-tree:new-folder': { namespace: 'file-tree', label: 'New Folder', defaultCombo: 'Ctrl+Shift+N' },
};

/**
 * Browser-reserved combos that must not be remapped.
 * Note: Alt+F4 is listed defensively — browsers typically cannot intercept this
 * OS-level shortcut; entry serves as documentation intent rather than a runtime guard.
 */
export const RESERVED_KEY_COMBOS: string[] = [
  'Ctrl+W',
  'Ctrl+T',
  'Ctrl+R',
  'F5',
  'F11',
  'Alt+F4',
];
