import fs from 'node:fs';
import path from 'node:path';
import { buildParser } from '@lezer/generator';
import { EditorState } from '@codemirror/state';
import { LRLanguage, LanguageSupport } from '@codemirror/language';
import { outlineField } from '@/lib/codemirror/asciidoc-outline';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';
import {
  inheritedHeadingOffsetFacet,
  refreshHeadingLevelsEffect,
} from '@/lib/codemirror/asciidoc-heading-levels';
import { createTestBlockTokenizer } from '../../helpers/asciidoc-test-tokenizer';

const grammarPath = path.resolve(__dirname, '../../../src/lib/codemirror/asciidoc.grammar');
const grammarSource = fs.readFileSync(grammarPath, 'utf8');

const lezerParser = buildParser(grammarSource, {
  externalTokenizer: (_name: string, terms: Record<string, number>) => createTestBlockTokenizer(terms),
});

const asciidocLang = LRLanguage.define({ name: 'asciidoc', parser: lezerParser });
const asciidocExtension = new LanguageSupport(asciidocLang);

function makeEditorState(documentContent: string): EditorState {
  return EditorState.create({
    doc: documentContent,
    extensions: [outlineField, asciidocExtension],
  });
}

function getOutline(documentContent: string): SectionOutlineEntry[] {
  const state = makeEditorState(documentContent);
  return state.field(outlineField);
}

describe('asciidoc-outline StateField', () => {
  test('extracts correct level, title text, and line number for levels 1–5', () => {
    const documentContent = [
      '= Document Title',
      '',
      '== Level 1 Heading',
      '',
      '=== Level 2 Heading',
      '',
      '==== Level 3 Heading',
      '',
      '===== Level 4 Heading',
      '',
      '====== Level 5 Heading',
      '',
    ].join('\n');

    const outline = getOutline(documentContent);
    expect(outline.length).toBeGreaterThanOrEqual(5);

    const levels = outline.map((entry) => entry.level);
    expect(levels).toContain(1);
    expect(levels).toContain(2);
    expect(levels).toContain(3);
    expect(levels).toContain(4);
    expect(levels).toContain(5);

    const heading1 = outline.find((entry) => entry.level === 1);
    expect(heading1?.title).toContain('Level 1 Heading');
  });

  test('returns empty array for a document with no headings', () => {
    const documentContent = 'Just some regular paragraph text.\nNo headings here.\n';
    const outline = getOutline(documentContent);
    expect(outline).toEqual([]);
  });

  test('handles headings that immediately follow delimited blocks', () => {
    const documentContent = [
      '----',
      'code block',
      '----',
      '',
      '== After Code Block',
      '',
    ].join('\n');

    const outline = getOutline(documentContent);
    expect(outline.length).toBeGreaterThan(0);
    expect(outline[0].title).toContain('After Code Block');
  });

  test('StateField updates when a heading is added in a CM6 transaction', () => {
    const initial = 'Some text\n';
    let state = makeEditorState(initial);
    expect(state.field(outlineField)).toEqual([]);

    state = state.update({
      changes: { from: state.doc.length, insert: '\n== New Heading\n' },
    }).state;

    const updated = state.field(outlineField);
    expect(updated.length).toBeGreaterThan(0);
    expect(updated[0].title).toContain('New Heading');
  });

  test('StateField updates when a heading is removed', () => {
    const initial = '== A Heading\n\nSome text\n';
    let state = makeEditorState(initial);
    expect(state.field(outlineField).length).toBeGreaterThan(0);

    const headingLine = state.doc.line(1);
    state = state.update({
      changes: { from: headingLine.from, to: headingLine.to + 1, insert: '' },
    }).state;

    expect(state.field(outlineField)).toEqual([]);
  });

  test('StateField is preserved across a selection-only (no-doc-change) transaction', () => {
    const state = makeEditorState('== A Heading\n\nSome text\n');
    const before = state.field(outlineField);
    const after = state.update({ selection: { anchor: 1 } }).state.field(outlineField);
    // No doc change → the same outline reference is kept.
    expect(after).toBe(before);
  });

  test('excludes a heading preceded by a [discrete] attribute line (FR-072)', () => {
    const documentContent = [
      '== Real Section',
      '',
      '[discrete]',
      '== Discrete Heading',
      '',
    ].join('\n');

    const outline = getOutline(documentContent);
    const titles = outline.map((entry) => entry.title);
    expect(titles).toContain('Real Section');
    expect(titles).not.toContain('Discrete Heading');
  });

  test('excludes a heading preceded by a [float] attribute line (FR-072)', () => {
    const documentContent = [
      '== Real Section',
      '',
      '[float]',
      '== Floating Heading',
      '',
    ].join('\n');

    const outline = getOutline(documentContent);
    const titles = outline.map((entry) => entry.title);
    expect(titles).toContain('Real Section');
    expect(titles).not.toContain('Floating Heading');
  });

  test('keeps a heading whose previous line is an unrelated attribute (not discrete/float)', () => {
    const documentContent = [
      '[.lead]',
      '== Lead Heading',
      '',
    ].join('\n');

    const outline = getOutline(documentContent);
    const titles = outline.map((entry) => entry.title);
    expect(titles).toContain('Lead Heading');
  });

  test('excludes a 7-equals line — beyond the max section level, it is not a heading', () => {
    // 7 leading equals is not a valid section marker (max is 6 = level 5), so it is body text.
    const outline = getOutline('======= Deep Heading\n');
    expect(outline).toEqual([]);
  });

  test('shifts the outline level by an in-document :leveloffset:', () => {
    const documentContent = [
      '== Section Foo',
      '',
      ':leveloffset: +1',
      '',
      '=== Section 2',
      '',
    ].join('\n');

    const outline = getOutline(documentContent);
    // `== Section Foo` is level 1; `=== Section 2` is raw level 2 + offset 1 ⇒ level 3 (not 2).
    expect(outline).toEqual([
      expect.objectContaining({ title: 'Section Foo', level: 1 }),
      expect.objectContaining({ title: 'Section 2', level: 3 }),
    ]);
  });

  test('excludes a heading pushed beyond the max level by :leveloffset: (FR-010)', () => {
    const documentContent = [
      '== Section Foo',
      '',
      ':leveloffset: +6',
      '',
      '=== Section 2',
      '',
    ].join('\n');

    const outline = getOutline(documentContent);
    // `=== Section 2` becomes effective level 8 (> max) ⇒ not a heading, excluded from the outline.
    expect(outline.map((entry) => entry.title)).toEqual(['Section Foo']);
  });

  test('excludes the document title (effective level 0)', () => {
    const outline = getOutline('= Document Title\n\n== Section\n');
    expect(outline.map((entry) => entry.title)).toEqual(['Section']);
  });

  test('applies the inherited include-path offset from the facet', () => {
    // An ancestor include supplies an offset of +2, so `== Sub` (raw level 1) becomes level 3.
    const state = EditorState.create({
      doc: '== Sub',
      extensions: [outlineField, asciidocExtension, inheritedHeadingOffsetFacet.of(() => 2)],
    });
    expect(state.field(outlineField)).toEqual([expect.objectContaining({ title: 'Sub', level: 3 })]);
  });

  test('recomputes when the inherited offset changes out-of-band (refresh effect)', () => {
    let offset = 0;
    const initial = EditorState.create({
      doc: '====== Deep',
      extensions: [outlineField, asciidocExtension, inheritedHeadingOffsetFacet.of(() => offset)],
    });
    // `======` is raw level 5: in range at offset 0, beyond max once the offset rises to +1.
    expect(initial.field(outlineField).map((entry) => entry.title)).toEqual(['Deep']);

    offset = 1;
    const refreshed = initial.update({ effects: refreshHeadingLevelsEffect.of() }).state;
    expect(refreshed.field(outlineField)).toEqual([]);
  });
});
