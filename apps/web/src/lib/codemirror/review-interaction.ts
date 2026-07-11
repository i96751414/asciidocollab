import { EditorView, keymap, type Command, type KeyBinding } from '@codemirror/view';
import type { EditorState, Extension } from '@codemirror/state';

/**
 * Editor-side review interactivity for feature 038: clicking a review highlight/gutter marker focuses
 * its thread, and a keyboard shortcut starts a new thread on the current selection (or the current
 * line when the selection is collapsed). The gutter "add comment" affordance lives with the gutter
 * itself in `review-decorations.ts`; this module owns the click/hover handlers and the shortcut. All
 * of it is presentational CM6 wiring driven by live getter callbacks, so the host component can swap
 * handlers without recreating the editor.
 *
 * The comment affordance reports raw `[from, to)` offsets; capturing the Yjs anchor (which needs the
 * shared `Y.Text`) is left to the host so this module stays free of collaboration concerns.
 */

/** Reads the current review-marker click handler, or null when clicks should be ignored. */
export type ReviewMarkerClickAccessor = () => ((id: string) => void) | null | undefined;
/** Reads the current review-marker hover handler, or null when hover reporting is off. */
export type ReviewMarkerHoverAccessor = () => ((id: string | null) => void) | null | undefined;
/** Reads the current comment-from-selection handler, or null to disable the comment affordances. */
export type CommentFromSelectionAccessor = () => ((from: number, to: number) => void) | null | undefined;

/**
 * The review item id of the nearest ancestor carrying `data-review-id` at a DOM event's target, or
 * null. Shared by the click and hover handlers so both resolve the marker the same way.
 */
export function reviewIdFromEventTarget(target: EventTarget | null): string | null {
  const marked = target instanceof Element ? target.closest('[data-review-id]') : null;
  return marked instanceof HTMLElement ? (marked.dataset.reviewId ?? null) : null;
}

/**
 * A DOM click handler that maps a click on a review highlight or gutter marker (carrying
 * `data-review-id`) to `getOnClick()(id)`. Registered once; the getter keeps the handler live.
 *
 * @param getOnClick - Live accessor for the current marker-click handler.
 * @returns The click `domEventHandlers` extension.
 */
export function reviewMarkerClickHandler(getOnClick: ReviewMarkerClickAccessor): Extension {
  return EditorView.domEventHandlers({
    mousedown(event) {
      const handler = getOnClick();
      if (!handler) return false;
      const id = reviewIdFromEventTarget(event.target);
      if (!id) return false;
      handler(id);
      return false; // Don't swallow the click — the cursor/selection still moves normally.
    },
  });
}

/**
 * A DOM hover handler that reports which review passage (if any) is under the pointer, driving the
 * editor→rail direction of the hover linkage (the rail→editor direction is the active-id effect).
 * Reports the passage's `data-review-id` on entry and `null` once the pointer leaves every passage or
 * the editor. Registered once; the getter keeps it live.
 *
 * @param getOnHover - Live accessor for the current marker-hover handler.
 * @returns The hover `domEventHandlers` extension.
 */
export function reviewMarkerHoverHandler(getOnHover: ReviewMarkerHoverAccessor): Extension {
  // No local dedup: the gutter hover path (review-decorations.ts) reports into the same shared hovered
  // state, so a private `lastId` here would desync from it and skip a needed re-report. Reporting the
  // current id every move is cheap — an unchanged value is a React setState no-op that bails the render.
  return EditorView.domEventHandlers({
    mousemove(event) {
      const onHover = getOnHover();
      if (!onHover) return false;
      onHover(reviewIdFromEventTarget(event.target));
      return false;
    },
    mouseleave() {
      getOnHover()?.(null);
      return false;
    },
  });
}

/** The default keybinding that starts a comment on the current selection or line. */
export const REVIEW_COMMENT_KEY = 'Mod-Shift-m';

/**
 * The document range a keyboard-triggered comment targets: the selection when it is non-empty,
 * otherwise the whole line the cursor sits on. Pure so it unit-tests without a live view.
 *
 * @param state - The current editor state.
 * @returns The `[from, to)` offsets to anchor the new comment to.
 */
export function commentTargetRange(state: EditorState): { from: number; to: number } {
  const selection = state.selection.main;
  if (!selection.empty) return { from: selection.from, to: selection.to };
  const line = state.doc.lineAt(selection.head);
  return { from: line.from, to: line.to };
}

/**
 * The editor command run by {@link REVIEW_COMMENT_KEY}: hands the {@link commentTargetRange} to the
 * live comment handler. Falls through (returns false) when no handler is available, so the key isn't
 * swallowed on documents where commenting is off.
 *
 * @param getOnComment - Live accessor for the current comment-from-selection handler.
 * @returns A CodeMirror command.
 */
export function reviewCommentCommand(getOnComment: CommentFromSelectionAccessor): Command {
  return (view) => {
    const onComment = getOnComment();
    if (!onComment) return false;
    const { from, to } = commentTargetRange(view.state);
    onComment(from, to);
    return true;
  };
}

/**
 * Keymap that starts a review comment from the keyboard, replacing the old always-on floating button:
 * {@link REVIEW_COMMENT_KEY} comments the current selection, or the current line when the selection is
 * collapsed. This is also the accessible path to the gutter "add comment" affordance.
 *
 * @param getOnComment - Live accessor for the current comment-from-selection handler.
 * @returns The comment-shortcut keymap extension.
 */
export function reviewCommentKeymap(getOnComment: CommentFromSelectionAccessor): Extension {
  const binding: KeyBinding = { key: REVIEW_COMMENT_KEY, preventDefault: true, run: reviewCommentCommand(getOnComment) };
  return keymap.of([binding]);
}
