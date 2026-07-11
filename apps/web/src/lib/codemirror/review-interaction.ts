import { EditorView, ViewPlugin, type ViewUpdate, type PluginValue } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

/**
 * Editor-side review interactivity for feature 038: clicking a review highlight/gutter marker to
 * focus its thread (FR-005), and a floating "Comment" affordance over a non-empty selection to
 * start a new thread. Both are presentational CM6 wiring driven by live getter callbacks, so the
 * host component can swap handlers without recreating the editor.
 *
 * The affordance reports raw `[from, to)` offsets; capturing the Yjs anchor (which needs the shared
 * `Y.Text`) is left to the host so this module stays free of collaboration concerns.
 */

/** Reads the current review-marker click handler, or null when clicks should be ignored. */
export type ReviewMarkerClickAccessor = () => ((id: string) => void) | null | undefined;
/** Reads the current review-marker hover handler, or null when hover reporting is off. */
export type ReviewMarkerHoverAccessor = () => ((id: string | null) => void) | null | undefined;
/** Reads the current comment-from-selection handler, or null to hide the affordance. */
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

/** The class applied to the floating "Comment" affordance button. */
export const REVIEW_COMMENT_BUTTON_CLASS = 'cm-review-comment-button';

/**
 * A ViewPlugin rendering a small floating "Comment" button anchored to the end of a non-empty
 * selection. Clicking it invokes `getOnComment()(from, to)` with the current selection offsets.
 * The button is hidden whenever the selection is empty or no handler is supplied.
 *
 * @param getOnComment - Live accessor for the current comment-from-selection handler.
 * @returns The selection-affordance view plugin extension.
 */
export function reviewSelectionButton(getOnComment: CommentFromSelectionAccessor): Extension {
  return ViewPlugin.fromClass(
    class implements PluginValue {
      private readonly button: HTMLButtonElement;
      /** Pending layout-read frame, or null when none is scheduled. */
      private frame: number | null = null;
      /** Set once destroyed so a queued frame becomes a no-op. */
      private destroyed = false;

      constructor(private readonly view: EditorView) {
        this.button = document.createElement('button');
        this.button.type = 'button';
        this.button.className = REVIEW_COMMENT_BUTTON_CLASS;
        this.button.textContent = 'Comment';
        this.button.setAttribute('aria-label', 'Comment on selection');
        this.button.dataset.testid = 'review-comment-button';
        this.button.style.display = 'none';
        // mousedown (not click) so the editor selection isn't cleared before we read it.
        this.button.addEventListener('mousedown', (event) => {
          event.preventDefault();
          const handler = getOnComment();
          const range = this.view.state.selection.main;
          if (!handler || range.empty) return;
          handler(range.from, range.to);
        });
        this.view.dom.append(this.button);
        this.scheduleReposition();
      }

      update(update: ViewUpdate) {
        if (update.selectionSet || update.geometryChanged || update.docChanged) this.scheduleReposition();
      }

      /**
       * Defers the layout read out of the CM update cycle. `coordsAtPos` throws
       * ("Reading the editor layout isn't allowed during an update") if called
       * synchronously from `update()`, which would make CM6 disable this plugin
       * and drop the only affordance for creating a comment.
       */
      private scheduleReposition() {
        if (this.frame !== null) return;
        this.frame = requestAnimationFrame(() => {
          this.frame = null;
          if (!this.destroyed) this.reposition();
        });
      }

      private reposition() {
        const range = this.view.state.selection.main;
        if (range.empty || !getOnComment()) {
          this.button.style.display = 'none';
          return;
        }
        const coords = this.view.coordsAtPos(range.to);
        if (!coords) {
          this.button.style.display = 'none';
          return;
        }
        // `coordsAtPos` returns viewport coordinates (already reflecting scroll), and `box.top` is
        // the editor's viewport top, so `coords.bottom - box.top` is the on-screen offset within the
        // non-scrolling `.cm-editor`. Adding scrollTop here would double-count the scroll.
        const box = this.view.dom.getBoundingClientRect();
        this.button.style.display = 'block';
        this.button.style.top = `${coords.bottom - box.top + 4}px`;
        this.button.style.left = `${coords.left - box.left}px`;
      }

      destroy() {
        this.destroyed = true;
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.button.remove();
      }
    },
  );
}
