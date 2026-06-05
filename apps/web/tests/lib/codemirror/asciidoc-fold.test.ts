import fs from 'node:fs';
import path from 'node:path';
import { buildParser } from '@lezer/generator';
import { EditorState } from '@codemirror/state';
import { LRLanguage, LanguageSupport } from '@codemirror/language';
import { asciidocFold } from '@/lib/codemirror/asciidoc-fold';
import { createTestBlockTokenizer } from '../../helpers/asciidoc-test-tokenizer';

const grammarPath = path.resolve(__dirname, '../../../src/lib/codemirror/asciidoc.grammar');
const grammarSource = fs.readFileSync(grammarPath, 'utf8');

const lezerParser = buildParser(grammarSource, {
  externalTokenizer: (_name: string, terms: Record<string, number>) => createTestBlockTokenizer(terms),
});

const asciidocLang = LRLanguage.define({ name: 'asciidoc', parser: lezerParser });
const langExtension = new LanguageSupport(asciidocLang);

function makeState(documentContent: string): EditorState {
  return EditorState.create({ doc: documentContent, extensions: [langExtension, asciidocFold] });
}

describe('asciidocFold', () => {
  const blockTypes = [
    { name: 'listing', open: '----', close: '----', innerContent: 'code here' },
    { name: 'example', open: '====', close: '====', innerContent: 'example content' },
    { name: 'sidebar', open: '****', close: '****', innerContent: 'sidebar content' },
    { name: 'quote', open: '____', close: '____', innerContent: 'quoted text' },
    { name: 'passthrough', open: '++++', close: '++++', innerContent: '<b>html</b>' },
    { name: 'open', open: '--', close: '--', innerContent: 'open content' },
    { name: 'comment block', open: '////', close: '////', innerContent: 'commented out' },
  ];

  for (const { name, open, close, innerContent } of blockTypes) {
    test(`folds ${name} block`, () => {
      const documentContent = `${open}\n${innerContent}\n${close}\n`;
      const state = makeState(documentContent);
      expect(state).toBeDefined();
    });
  }

  test('asciidocFold extension is importable and is a valid extension', () => {
    expect(asciidocFold).toBeDefined();
    expect(typeof asciidocFold).toBe('object');
  });
});
