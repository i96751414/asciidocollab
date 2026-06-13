import { headingLevelClass } from '@/lib/codemirror/asciidoc-heading-levels';

// The effective-level rule (parseLevelOffset / computeHeadingLevels) now lives in
// @asciidocollab/shared and is tested there (effective-levels.test.ts). This file covers only the
// CodeMirror projection — the CSS class mapping for a computed heading.

describe('headingLevelClass', () => {
  test('emits a per-level class', () => {
    expect(headingLevelClass({ line: 1, from: 0, rawLevel: 1, effectiveLevel: 2, discrete: false, beyondMax: false }))
      .toBe('cm-ad-h2');
  });
  test('adds the discrete class', () => {
    expect(headingLevelClass({ line: 1, from: 0, rawLevel: 0, effectiveLevel: 0, discrete: true, beyondMax: false }))
      .toBe('cm-ad-h0 cm-ad-discrete');
  });
});
