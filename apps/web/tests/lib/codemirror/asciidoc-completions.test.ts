import fs from 'node:fs';
import path from 'node:path';
import { buildParser } from '@lezer/generator';
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { LRLanguage, LanguageSupport } from '@codemirror/language';
import {
  attributeCompletionSource,
  xrefCompletionSource,
  createIncludeCompletionSource,
} from '@/lib/codemirror/asciidoc-completions';
import { createTestBlockTokenizer } from '../../helpers/asciidoc-test-tokenizer';

const grammarPath = path.resolve(__dirname, '../../../src/lib/codemirror/asciidoc.grammar');
const grammarSource = fs.readFileSync(grammarPath, 'utf8');

const lezerParser = buildParser(grammarSource, {
  externalTokenizer: (_name: string, terms: Record<string, number>) => createTestBlockTokenizer(terms),
});

const asciidocLang = LRLanguage.define({ name: 'asciidoc', parser: lezerParser });
const asciidocExtension = new LanguageSupport(asciidocLang);

type CompletionSource = (context: CompletionContext) => Promise<CompletionResult | null> | CompletionResult | null;

async function getCompletions(source: CompletionSource, documentContent: string, triggerPosition: number) {
  const state = EditorState.create({
    doc: documentContent,
    extensions: [asciidocExtension],
    selection: { anchor: triggerPosition },
  });
  const context: CompletionContext = {
    state,
    pos: triggerPosition,
    explicit: false,
    matchBefore: (regex: RegExp) => {
      const match = state.sliceDoc(0, triggerPosition).match(regex);
      return match ? { from: triggerPosition - match[0].length, to: triggerPosition, text: match[0] } : null;
    },
  } as CompletionContext;
  return source(context);
}

describe('AsciiDoc Completion Sources', () => {
  describe('attributeCompletionSource', () => {
    test('triggers on { and returns doc-defined attributes', async () => {
      const documentContent = ':version: 1.0\n:author: Jane\n\nVersion {';
      const result = await getCompletions(attributeCompletionSource, documentContent, documentContent.length);
      expect(result).not.toBeNull();
      expect(result?.options.some((option) => option.label === 'version')).toBe(true);
      expect(result?.options.some((option) => option.label === 'author')).toBe(true);
    });

    test('includes built-in AsciiDoc attributes', async () => {
      const documentContent = 'Hello {';
      const result = await getCompletions(attributeCompletionSource, documentContent, documentContent.length);
      expect(result).not.toBeNull();
      expect(result?.options.some((option) => ['author', 'revdate', 'toc'].includes(option.label))).toBe(true);
    });

    test('does not return results when not after {', async () => {
      const documentContent = 'Hello world';
      const result = await getCompletions(attributeCompletionSource, documentContent, documentContent.length);
      expect(result).toBeNull();
    });
  });

  describe('xrefCompletionSource', () => {
    test('triggers on << and returns section IDs from headings', async () => {
      const documentContent = '== My Section\n\n=== Sub Section\n\nSee <<';
      const result = await getCompletions(xrefCompletionSource, documentContent, documentContent.length);
      expect(result).not.toBeNull();
      expect(result?.options.some((option) =>
        option.label.toLowerCase().includes('my-section') ||
        option.label.toLowerCase().includes('section'),
      )).toBe(true);
    });

    test('returns anchor definitions [[id]]', async () => {
      const documentContent = '[[my-anchor]]\nSome text\n\nSee <<';
      const result = await getCompletions(xrefCompletionSource, documentContent, documentContent.length);
      expect(result).not.toBeNull();
    });

    test('does not return results when not after <<', async () => {
      const documentContent = 'See the section about things';
      const result = await getCompletions(xrefCompletionSource, documentContent, documentContent.length);
      expect(result).toBeNull();
    });
  });

  describe('createIncludeCompletionSource', () => {
    test('triggers on include:: and returns paths from provided list', async () => {
      const paths = ['chapters/intro.adoc', 'chapters/setup.adoc'];
      const source = createIncludeCompletionSource(paths);
      const documentContent = 'include::';
      const result = await getCompletions(source, documentContent, documentContent.length);
      expect(result).not.toBeNull();
      expect(result?.options.some((option) => option.label.includes('intro'))).toBe(true);
      expect(result?.options.some((option) => option.label.includes('setup'))).toBe(true);
    });

    test('does not return project-external paths', async () => {
      const paths = ['chapters/intro.adoc'];
      const source = createIncludeCompletionSource(paths);
      const documentContent = 'include::';
      const result = await getCompletions(source, documentContent, documentContent.length);
      expect(result?.options.every((option) => paths.includes(option.label))).toBe(true);
    });

    test('returns empty results when path list is empty', async () => {
      const source = createIncludeCompletionSource([]);
      const documentContent = 'include::';
      const result = await getCompletions(source, documentContent, documentContent.length);
      expect(result?.options.length).toBe(0);
    });

    // Issue 10: xrefCompletionSource must serialise the document only once per
    // invocation. Two independent toString() calls on a large doc waste memory.
    test('xrefCompletionSource calls doc.toString() at most once per invocation', async () => {
      const documentContent = '== My Section\n\n[[anchor]]\n\nSee <<';
      const state = EditorState.create({
        doc: documentContent,
        extensions: [asciidocExtension],
        selection: { anchor: documentContent.length },
      });
      let callCount = 0;
      const originalToString = state.doc.toString.bind(state.doc);
      const spy = jest.spyOn(state.doc, 'toString').mockImplementation(() => {
        callCount++;
        return originalToString();
      });
      const context = {
        state,
        pos: documentContent.length,
        explicit: false,
        matchBefore: (regex: RegExp) => {
          const match = state.sliceDoc(0, documentContent.length).match(regex);
          return match ? { from: documentContent.length - match[0].length, to: documentContent.length, text: match[0] } : null;
        },
      } as CompletionContext;

      await xrefCompletionSource(context);

      expect(callCount).toBeLessThanOrEqual(1);
      spy.mockRestore();
    });

    // Issue 3: the factory must accept a getter so the editor useEffect (which
    // runs once at mount when includePaths==[]) gets live paths on every invoke.
    test('accepts a getter function and reads the latest paths on each completion invocation', async () => {
      let paths: string[] = [];
      const source = createIncludeCompletionSource(() => paths);

      const before = await getCompletions(source, 'include::', 'include::'.length);
      expect(before?.options.length ?? 0).toBe(0);

      paths = ['chapters/intro.adoc', 'chapters/setup.adoc'];
      const after = await getCompletions(source, 'include::', 'include::'.length);
      expect(after?.options.some((o) => o.label.includes('intro'))).toBe(true);
    });
  });
});
