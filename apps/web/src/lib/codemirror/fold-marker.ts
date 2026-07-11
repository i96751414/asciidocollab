/** Path data for the fold chevron: a down chevron when expanded, a right chevron when folded. */
const CHEVRON_DOWN = 'M6 9l6 6 6-6';
const CHEVRON_RIGHT = 'M9 6l6 6-6 6';
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Builds the fold-gutter marker: a slim chevron (down when a section is expanded, right when folded)
 * replacing CodeMirror's default text arrow, so the fold column can be tightened. The fold direction
 * is conveyed by the chevron path and the title. Built with the DOM API (no `innerHTML`).
 *
 * @param open - True when the section is expanded (and thus foldable), false when it is folded.
 * @returns The marker element for the fold gutter.
 */
export function buildFoldMarker(open: boolean): HTMLElement {
  const marker = document.createElement('span');
  marker.className = 'cm-fold-marker';
  // Match CodeMirror's default fold-marker title — the tooltip and the hook the fold e2e helpers
  // locate the marker by (providing markerDOM skips the library's own title-setting).
  marker.title = open ? 'Fold line' : 'Unfold line';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.4');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', open ? CHEVRON_DOWN : CHEVRON_RIGHT);
  svg.append(path);
  marker.append(svg);
  return marker;
}
