import {
  Decoration,
  EditorView,
  GutterMarker,
  gutter,
  type BlockInfo,
  type DecorationSet,
} from '@codemirror/view';
import {
  RangeSetBuilder,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type RangeSet,
} from '@codemirror/state';
import type { CommentFromSelectionAccessor } from '@/lib/codemirror/review-interaction';

/**
 * Review highlight + gutter-marker layer for feature 038. Every located review item paints a
 * resting underline over its anchored passage and a marker in a dedicated left gutter; the ONE
 * active item (hovered/selected in the rail) gets a stronger emphasis, driving the two-way
 * editor↔rail hover linkage.
 *
 * The anchored ranges arrive out-of-band — the rail resolves anchors and pushes ranges over SSE,
 * with no accompanying document edit — so the layer refreshes via custom {@link StateEffect}s
 * (mirroring `asciidoc-outline.ts`), not just on `docChanged`. The pure
 * {@link computeReviewDecorationRanges} is exported and unit-tested independently.
 */

/** Resting underline applied to every located review passage. */
export const REVIEW_HIGHLIGHT_CLASS = 'cm-review-highlight';
/** Stronger emphasis applied to the single active review passage (hover linkage). */
export const REVIEW_HIGHLIGHT_ACTIVE_CLASS = 'cm-review-highlight-active';
/** One-shot pulse applied to a passage the user just navigated to (scroll-into-view flash). */
export const REVIEW_HIGHLIGHT_FLASH_CLASS = 'cm-review-flash';
/** Class placed on the gutter element of a line that starts a review range. */
export const REVIEW_GUTTER_MARKER_CLASS = 'cm-review-gutter-marker';
/** Class on the "add comment" affordance rendered in the gutter of every line (hover/selection reveal). */
export const REVIEW_ADD_COMMENT_CLASS = 'cm-review-add-comment';
/** Class on the filled chip inside the affordance that holds the icon. */
const REVIEW_ADD_COMMENT_CHIP_CLASS = 'cm-review-add-comment-chip';
/** Class placed on the gutter element of a line the current (non-empty) selection overlaps. */
export const REVIEW_GUTTER_SELECTED_CLASS = 'cm-review-gutter-selected';

/** One review item's resolved passage in the live document. */
export interface ReviewAnchorRange {
  /** The review item id (used for the two-way hover linkage and the `data-review-id` hook). */
  id: string;
  /** Document offset of the passage's first character. */
  from: number;
  /** Document offset just past the passage's last character. */
  to: number;
}

/** A resolved review range carrying the CSS class to mark it with. */
export interface ReviewDecorationRange {
  /** Document offset of the passage's first character. */
  from: number;
  /** Document offset just past the passage's last character. */
  to: number;
  /** CSS class applied to the range (resting or active). */
  cls: string;
  /** The review item id the range belongs to. */
  id: string;
}

/**
 * Assigns each review range its CSS class — the active item gets
 * {@link REVIEW_HIGHLIGHT_ACTIVE_CLASS}, every other item the resting
 * {@link REVIEW_HIGHLIGHT_CLASS}, and the just-navigated-to item additionally gets the one-shot
 * {@link REVIEW_HIGHLIGHT_FLASH_CLASS} pulse — and returns them sorted by (from, to). Pure and
 * unit-tested.
 *
 * @param items - The resolved review ranges.
 * @param activeId - The id of the currently active item, or `null` when none is active.
 * @param flashId - The id of the item to pulse once (navigation flash), or `null`.
 */
export function computeReviewDecorationRanges(
  items: ReviewAnchorRange[],
  activeId: string | null,
  flashId: string | null = null,
): ReviewDecorationRange[] {
  return items
    .map((item) => ({
      from: item.from,
      to: item.to,
      id: item.id,
      cls: [
        item.id === activeId ? REVIEW_HIGHLIGHT_ACTIVE_CLASS : REVIEW_HIGHLIGHT_CLASS,
        item.id === flashId ? REVIEW_HIGHLIGHT_FLASH_CLASS : null,
      ]
        .filter(Boolean)
        .join(' '),
    }))
    .toSorted((a, b) => a.from - b.from || a.to - b.to);
}

/** Out-of-band effect replacing the full set of resolved review ranges (SSE refresh). */
export const setReviewRangesEffect = StateEffect.define<ReviewAnchorRange[]>();
/** Out-of-band effect setting (or clearing, with `null`) the active review item. */
export const setActiveReviewEffect = StateEffect.define<string | null>();
/** Out-of-band effect pulsing (or clearing, with `null`) the just-navigated-to review item. */
export const flashReviewEffect = StateEffect.define<string | null>();

/** The layer's backing state: the resolved ranges, the active id, and the transient flash id. */
interface ReviewState {
  ranges: ReviewAnchorRange[];
  activeId: string | null;
  flashId: string | null;
}

const EMPTY_REVIEW_STATE: ReviewState = { ranges: [], activeId: null, flashId: null };

/**
 * StateField holding the resolved review ranges + active id + flash id. Ranges are replaced wholesale
 * by {@link setReviewRangesEffect}, the active id by {@link setActiveReviewEffect}, the one-shot flash
 * id by {@link flashReviewEffect}, and both endpoints of every range are mapped through document edits
 * so highlights follow the text between refreshes.
 */
const reviewStateField = StateField.define<ReviewState>({
  create() {
    return EMPTY_REVIEW_STATE;
  },
  update(value, tr) {
    let next = value;
    for (const effect of tr.effects) {
      if (effect.is(setReviewRangesEffect)) next = { ...next, ranges: effect.value };
      else if (effect.is(setActiveReviewEffect)) next = { ...next, activeId: effect.value };
      else if (effect.is(flashReviewEffect)) next = { ...next, flashId: effect.value };
    }
    if (tr.docChanged) {
      const mapped = next.ranges.map((range) => ({
        id: range.id,
        from: tr.changes.mapPos(range.from),
        to: tr.changes.mapPos(range.to),
      }));
      next = { ...next, ranges: mapped };
    }
    return next;
  },
  provide: (field) =>
    EditorView.decorations.from(field, (state) => buildReviewDecorations(state)),
});

/** Builds the highlight decoration set from a {@link ReviewState} (empty ranges are skipped). */
function buildReviewDecorations(state: ReviewState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const range of computeReviewDecorationRanges(state.ranges, state.activeId, state.flashId)) {
    if (range.to <= range.from) continue; // Decoration.mark cannot be empty.
    builder.add(
      range.from,
      range.to,
      Decoration.mark({ class: range.cls, attributes: { 'data-review-id': range.id } }),
    );
  }
  return builder.finish();
}

/**
 * The review item id of the first range that starts on the document line containing `pos`, or null.
 * Backs gutter-marker hover: the gutter reports events per line, so the line is mapped to its review.
 */
export function reviewIdAtLine(state: EditorState, pos: number): string | null {
  const field = state.field(reviewStateField, false);
  if (!field) return null;
  // One `lineAt` for the hovered position, then a numeric containment check per range — a range starts
  // on this line iff its `from` sits within the line's span. Avoids an O(ranges) tree walk per pixel of
  // gutter travel (this runs on every gutter mousemove).
  const line = state.doc.lineAt(pos);
  for (const range of field.ranges) {
    if (range.to <= range.from) continue;
    if (range.from >= line.from && range.from <= line.to) return range.id;
  }
  return null;
}

/** Reads the current review-marker hover handler (id or null), or null when reporting is off. */
export type ReviewHoverAccessor = () => ((id: string | null) => void) | null | undefined;

/** A gutter marker adding {@link REVIEW_GUTTER_MARKER_CLASS} to a review-range line's element. */
class ReviewGutterMarker extends GutterMarker {
  elementClass = REVIEW_GUTTER_MARKER_CLASS;
}

const REVIEW_GUTTER_MARKER = new ReviewGutterMarker();

/** SVG namespace for building the add-comment icon without `innerHTML`. */
const SVG_NS = 'http://www.w3.org/2000/svg';
/**
 * Path data for lucide's `MessageSquarePlus` (v1.17.0) — a speech bubble with a plus, reading as
 * "add a comment". Kept in sync by matching the lucide icon the rest of the review UI uses
 * (`review-toggle`, `comment-rail`), so the gutter affordance stays in the same visual family.
 */
const ADD_COMMENT_ICON_PATHS = [
  'M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z',
  'M12 8v6',
  'M9 11h6',
];

/** True when the main selection is non-empty and overlaps the line spanning `[lineFrom, lineTo]`. */
export function selectionOverlapsLine(state: EditorState, lineFrom: number, lineTo: number): boolean {
  const selection = state.selection.main;
  return !selection.empty && selection.from <= lineTo && selection.to >= lineFrom;
}

/**
 * The per-line "add comment" affordance rendered in the review gutter: an element that fills the
 * gutter cell and reveals a "+" on hover (any line) or while the line overlaps a selection. Clicking
 * it starts a thread on the selection (or the line when there is none). The `selected` flag drives the
 * always-visible state on selected lines; the client id / position are irrelevant to appearance.
 */
class AddCommentGutterMarker extends GutterMarker {
  /** Marks the wrapping gutter element as selected so CSS can keep the "+" visible without a hover. */
  readonly elementClass: string;

  constructor(private readonly selected: boolean) {
    super();
    this.elementClass = selected ? REVIEW_GUTTER_SELECTED_CLASS : '';
  }

  /**
   * @param other - The marker CodeMirror is comparing against for reuse.
   * @returns True when the rendered affordance would be identical (same selected state).
   */
  eq(other: AddCommentGutterMarker): boolean {
    return other.selected === this.selected;
  }

  /**
   * Builds the affordance element: a lucide "message-square-plus" icon that fills the gutter cell as
   * the click target. Reveal-on-hover is pure CSS. Built with the DOM API (no `innerHTML`) from a
   * fixed first-party path set.
   *
   * @returns The affordance DOM node.
   */
  toDOM(): HTMLElement {
    const element = document.createElement('span');
    element.className = REVIEW_ADD_COMMENT_CLASS;
    element.title = 'Comment';
    // The keyboard shortcut (reviewCommentKeymap) is the accessible path; this glyph is mouse-only.
    element.setAttribute('aria-hidden', 'true');
    // A filled rounded chip holds the icon so it reads as a solid affordance, not a floating outline;
    // the span itself stays a transparent, cell-filling hit target around it.
    const chip = document.createElement('span');
    chip.className = REVIEW_ADD_COMMENT_CHIP_CLASS;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    for (const definition of ADD_COMMENT_ICON_PATHS) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', definition);
      svg.append(path);
    }
    chip.append(svg);
    element.append(chip);
    return element;
  }
}

const ADD_COMMENT_MARKER = new AddCommentGutterMarker(false);
const ADD_COMMENT_MARKER_SELECTED = new AddCommentGutterMarker(true);

/**
 * Builds the gutter marker set: one marker at the start of each DISTINCT line that begins a review
 * range. Line-start offsets are collected, de-duplicated, and sorted so the {@link RangeSetBuilder}
 * receives them in order.
 */
function buildReviewGutterMarkers(state: EditorState): RangeSet<GutterMarker> {
  const field = state.field(reviewStateField, false);
  const builder = new RangeSetBuilder<GutterMarker>();
  if (!field || field.ranges.length === 0) return builder.finish();
  const lineStarts = new Set<number>();
  for (const range of field.ranges) {
    if (range.to <= range.from) continue; // A collapsed (deleted-passage) range paints no highlight, so no marker.
    lineStarts.add(state.doc.lineAt(range.from).from);
  }
  for (const start of [...lineStarts].toSorted((a, b) => a - b)) {
    builder.add(start, start, REVIEW_GUTTER_MARKER);
  }
  return builder.finish();
}

/**
 * CM6 extension that highlights every located review passage, marks its starting line with a dot in a
 * dedicated left gutter, and — when commenting is available — renders a per-line "add comment"
 * affordance in that same gutter (revealed on hover or while a line overlaps the selection). Clicking
 * the affordance, or the {@link reviewCommentKeymap} shortcut, starts a new thread. Refreshes on the
 * out-of-band {@link setReviewRangesEffect} / {@link setActiveReviewEffect}, on selection moves (so the
 * affordance follows the selected lines), and on document edits.
 *
 * @param getOnHover - Live accessor for the marker-hover handler; wires the gutter marker to report
 *   its line's review id on hover (the text-highlight hover is handled by `reviewMarkerHoverHandler`).
 * @param getOnComment - Live accessor for the comment-from-selection handler; when it yields a handler
 *   the "add comment" affordance renders and clicking it starts a thread. Null hides the affordance.
 * @returns The review decoration + gutter extension (register once).
 */
export function reviewDecorations(
  getOnHover?: ReviewHoverAccessor,
  getOnComment?: CommentFromSelectionAccessor,
): Extension {
  return [
    reviewStateField,
    gutter({
      class: 'cm-review-gutter',
      markers: (view) => buildReviewGutterMarkers(view.state),
      // The "add comment" affordance renders on every line while a handler is available, marked
      // selected on the lines the current selection overlaps. Null handler → no affordance (the
      // gutter then only carries the existing-thread dots).
      lineMarker: (view, line: BlockInfo) => {
        if (!getOnComment?.()) return null;
        return selectionOverlapsLine(view.state, line.from, line.to)
          ? ADD_COMMENT_MARKER_SELECTED
          : ADD_COMMENT_MARKER;
      },
      // Markers derive from out-of-band range/active effects; the selected affordance derives from the
      // selection. Rebuild when either changes (a doc edit already triggers a rebuild on its own).
      lineMarkerChange: (update) =>
        update.selectionSet ||
        update.transactions.some((tr) =>
          tr.effects.some(
            (effect) => effect.is(setReviewRangesEffect) || effect.is(setActiveReviewEffect),
          ),
        ),
      domEventHandlers: {
        mousedown(view, line, event) {
          const onComment = getOnComment?.();
          if (!onComment) return false;
          // Only the "+" affordance starts a comment; other gutter clicks are left alone.
          const target = event.target;
          if (!(target instanceof Element) || !target.closest(`.${REVIEW_ADD_COMMENT_CLASS}`)) return false;
          event.preventDefault(); // Keep the selection — don't let the click move the caret.
          const useSelection = selectionOverlapsLine(view.state, line.from, line.to);
          const selection = view.state.selection.main;
          const from = useSelection ? selection.from : line.from;
          const to = useSelection ? selection.to : line.to;
          onComment(from, to);
          return true;
        },
        mousemove(view, line) {
          getOnHover?.()?.(reviewIdAtLine(view.state, line.from));
          return false;
        },
        mouseleave() {
          getOnHover?.()?.(null);
          return false;
        },
      },
    }),
  ];
}
