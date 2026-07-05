import { InMemoryStructuredCollaborativeEditor } from './in-memory-structured-collaborative-editor';
import { InMemoryRegexEngine } from '../text/in-memory-regex-engine';
import { ProjectId } from '../../../src/value-objects/ids/project-id';
import { YjsStateId } from '../../../src/value-objects/ids/yjs-state-id';
import type { StructuredReplacementSpec } from '../../../src/ports/storage/structured-collaborative-editor';
import type { SearchQuery } from '../../../src/types/search';

const projectId = ProjectId.create('880e8400-e29b-41d4-a716-446655440004');
const documentId = YjsStateId.create('cc0e8400-e29b-41d4-a716-446655440008');

const literal = (text: string): SearchQuery => ({ text, mode: 'literal', caseSensitive: true, wholeWord: false });

describe('InMemoryStructuredCollaborativeEditor', () => {
  let editor: InMemoryStructuredCollaborativeEditor;

  beforeEach(() => {
    editor = new InMemoryStructuredCollaborativeEditor(new InMemoryRegexEngine());
  });

  const apply = (spec: StructuredReplacementSpec) => editor.applyStructuredReplacement(projectId, documentId, spec);

  it('replaces only the confirmed ordinals', async () => {
    editor.seed(documentId, 'foo foo foo');
    const result = await apply({ query: literal('foo'), replacement: 'bar', selections: [{ ordinal: 0, expectedText: 'foo' }, { ordinal: 2, expectedText: 'foo' }] });
    expect(result).toEqual({ success: true, value: 2 });
    expect(editor.contentOf(documentId)).toBe('bar foo bar');
  });

  it('skips a stale ordinal whose live text diverged (0 applied ⇒ diverged)', async () => {
    editor.seed(documentId, 'the cat sat');
    const result = await apply({ query: literal('dog'), replacement: 'x', selections: [{ ordinal: 0, expectedText: 'dog' }] });
    expect(result).toEqual({ success: true, value: 0 });
    expect(editor.contentOf(documentId)).toBe('the cat sat'); // untouched
  });

  it('expands a regex capture-group template against re-matched live content', async () => {
    editor.seed(documentId, 'date 2026-07 here');
    const spec: StructuredReplacementSpec = {
      query: { text: String.raw`(\d{4})-(\d{2})`, mode: 'regex', caseSensitive: true, wholeWord: false },
      replacement: '$2/$1',
      selections: [{ ordinal: 0, expectedText: '2026-07' }],
    };
    const result = await apply(spec);
    expect(result).toEqual({ success: true, value: 1 });
    expect(editor.contentOf(documentId)).toBe('date 07/2026 here');
  });
});
