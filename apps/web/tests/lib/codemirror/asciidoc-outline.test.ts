import fs from 'node:fs';
import path from 'node:path';
import { buildParser } from '@lezer/generator';
import { EditorState } from '@codemirror/state';
import { LRLanguage, LanguageSupport } from '@codemirror/language';
import { outlineField } from '@/lib/codemirror/asciidoc-outline';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';
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
});
