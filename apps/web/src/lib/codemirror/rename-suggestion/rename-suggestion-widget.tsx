import { WidgetType, type EditorView } from '@codemirror/view';
import type { StateEffect } from '@codemirror/state';
import type { SymbolKind } from './types';
import { applyRequestEffect, dismissRequestEffect, undoRequestEffect } from './rename-suggestion-effects';

/**
 * The inline rename-suggestion widget (033, FR-009/FR-012/FR-017/FR-020/FR-022).
 *
 * A CodeMirror block widget rendered just below the renamed definition. It is plain DOM (not React)
 * so it can live inside the editor's decoration layer, and it is provided from a StateField (block
 * widgets may not come from a plugin). Buttons dispatch request effects through the view — the
 * plugin, which holds the API config, performs the async work. All colours come from design tokens
 * via the `cm-ad-rename-suggestion*` classes in `editor-themes.css` (Principle V, light/dark).
 */

/** The visible data driving the widget — everything that affects rendering, for `eq()` reuse. */
export interface RenameSuggestionWidgetData {
  /** The name being rewritten from. */
  oldName: string;
  /** The name being rewritten to. */
  newName: string;
  /** The kind of symbol being renamed. */
  kind: SymbolKind;
  /** Number of references/occurrences that would be rewritten. */
  usageCount: number;
  /** Number of files affected. */
  fileCount: number;
  /** New name collides with an existing same-kind symbol → apply blocked (FR-022). */
  collision: boolean;
  /** The rename has been applied → show the undo affordance (FR-020). */
  applied: boolean;
}

/**
 * Pluralise a count with its noun.
 *
 * @param n - The count.
 * @param noun - The singular noun.
 * @returns The count followed by the correctly pluralised noun.
 */
const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** The block widget rendered below a renamed definition offering the project-wide refactor. */
export class RenameSuggestionWidget extends WidgetType {
  /**
   * @param data - The visible data driving the widget's rendering.
   */
  constructor(private readonly data: RenameSuggestionWidgetData) {
    super();
  }

  /** Two widgets are equal (and the DOM is reused) only when the visible data matches. */
  eq(other: RenameSuggestionWidget): boolean {
    const a = this.data;
    const b = other.data;
    return (
      a.oldName === b.oldName &&
      a.newName === b.newName &&
      a.kind === b.kind &&
      a.usageCount === b.usageCount &&
      a.fileCount === b.fileCount &&
      a.collision === b.collision &&
      a.applied === b.applied
    );
  }

  /**
   * Build the widget DOM for the current state (offer, collision, or applied/undo).
   *
   * @param view - The editor view, used to dispatch button request effects.
   * @returns The widget's root element.
   */
  toDOM(view: EditorView): HTMLElement {
    const root = document.createElement('div');
    root.className = 'cm-ad-rename-suggestion';
    root.dataset.testid = 'rename-suggestion';
    root.dataset.collision = String(this.data.collision);
    root.setAttribute('role', 'status');

    const message = document.createElement('span');
    message.className = 'cm-ad-rename-suggestion-msg';

    const button = (label: string, testid: string, variant: string, effect: StateEffect<null>): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `cm-ad-rename-suggestion-btn cm-ad-rename-suggestion-btn-${variant}`;
      b.dataset.testid = testid;
      b.textContent = label;
      b.addEventListener('click', (event) => {
        event.preventDefault();
        view.dispatch({ effects: effect });
      });
      return b;
    };

    if (this.data.applied) {
      message.textContent = `Renamed ${this.data.oldName} → ${this.data.newName}`;
      root.append(
        message,
        button('Undo', 'rename-suggestion-undo', 'primary', undoRequestEffect.of(null)),
        button('Dismiss', 'rename-suggestion-dismiss', 'ghost', dismissRequestEffect.of(null)),
      );
      return root;
    }

    if (this.data.collision) {
      message.textContent = `“${this.data.newName}” already exists — choose a different name to rename ${this.data.oldName}.`;
      root.append(message, button('Dismiss', 'rename-suggestion-dismiss', 'ghost', dismissRequestEffect.of(null)));
      return root;
    }

    message.textContent = `Rename ${this.data.oldName} → ${this.data.newName} in ${plural(
      this.data.usageCount,
      'reference',
    )} across ${plural(this.data.fileCount, 'file')}?`;
    root.append(
      message,
      button('Apply', 'rename-suggestion-apply', 'primary', applyRequestEffect.of(null)),
      button('Dismiss', 'rename-suggestion-dismiss', 'ghost', dismissRequestEffect.of(null)),
    );
    return root;
  }

  /** Buttons manage their own clicks; keep other DOM events from bubbling into the editor. */
  ignoreEvent(): boolean {
    return true;
  }
}
