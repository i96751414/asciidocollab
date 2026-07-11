/* @jest-environment jsdom */
import { buildFoldMarker } from '@/lib/codemirror/fold-marker';

describe('buildFoldMarker', () => {
  test('renders a down chevron with the fold title when expanded', () => {
    const marker = buildFoldMarker(true);
    expect(marker.classList.contains('cm-fold-marker')).toBe(true);
    // The title matches CodeMirror's default so the fold e2e helper can still locate the marker.
    expect(marker.title).toBe('Fold line');
    expect(marker.querySelector('svg path')?.getAttribute('d')).toBe('M6 9l6 6 6-6');
  });

  test('renders a right chevron with the unfold title when folded', () => {
    const marker = buildFoldMarker(false);
    expect(marker.classList.contains('cm-fold-marker')).toBe(true);
    expect(marker.title).toBe('Unfold line');
    expect(marker.querySelector('svg path')?.getAttribute('d')).toBe('M9 6l6 6-6 6');
  });
});
