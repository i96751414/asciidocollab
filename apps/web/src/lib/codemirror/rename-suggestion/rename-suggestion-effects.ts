import { StateEffect } from '@codemirror/state';
import type { RenameSuggestion } from './types';

/**
 * Shared state effects for the rename suggestion (033). Kept in their own module so the widget
 * (which dispatches request effects through the view) and the state field / plugin (which produce
 * and consume them) can both import them without a circular dependency.
 */

/** Set (or clear, with null) the suggestion shown in the editor. Dispatched by the plugin. */
export const setSuggestionEffect = StateEffect.define<RenameSuggestion | null>();

/** The widget's Apply button was pressed. The plugin performs the async rewrite. */
export const applyRequestEffect = StateEffect.define<null>();

/** The widget's Dismiss button was pressed. */
export const dismissRequestEffect = StateEffect.define<null>();

/** The widget's Undo button was pressed (after an apply). The plugin runs the inverse rename. */
export const undoRequestEffect = StateEffect.define<null>();
