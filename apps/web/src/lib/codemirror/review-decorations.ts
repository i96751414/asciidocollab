import {
  Decoration,
  EditorView,
  GutterMarker,
  gutter,
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
 * CM6 extension that highlights every located review passage and marks its starting line in a
 * dedicated left gutter, refreshing on the out-of-band {@link setReviewRangesEffect} /
 * {@link setActiveReviewEffect} as well as on document edits.
 *
 * @param getOnHover - Live accessor for the marker-hover handler; wires the gutter marker to report
 *   its line's review id on hover (the text-highlight hover is handled by `reviewMarkerHoverHandler`).
 * @returns The review decoration + gutter extension (register once).
 */
export function reviewDecorations(getOnHover?: ReviewHoverAccessor): Extension {
  return [
    reviewStateField,
    gutter({
      class: 'cm-review-gutter',
      markers: (view) => buildReviewGutterMarkers(view.state),
      // The markers derive from out-of-band range/active effects, so tell the gutter to rebuild
      // when either fires (a doc edit already triggers a rebuild on its own).
      lineMarkerChange: (update) =>
        update.transactions.some((tr) =>
          tr.effects.some(
            (effect) => effect.is(setReviewRangesEffect) || effect.is(setActiveReviewEffect),
          ),
        ),
      domEventHandlers: {
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
