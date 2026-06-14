import { Server, type Extension } from '@hocuspocus/server';
import * as Y from 'yjs';
import { applyReplacementsToYText, applyEditsToDocument } from '../src/apply-edits';

function ytextWith(text: string): Y.Text {
  const document = new Y.Doc();
  const ytext = document.getText('codemirror');
  ytext.insert(0, text);
  return ytext;
}

describe('applyReplacementsToYText', () => {
  it('replaces every occurrence of each find', () => {
    const ytext = ytextWith('a include::intro.adoc[] b include::intro.adoc[] c');
    const applied = applyReplacementsToYText(ytext, [
      { find: 'include::intro.adoc[]', replace: 'include::overview.adoc[]' },
    ]);
    expect(applied).toBe(2);
    expect(ytext.toString()).toBe('a include::overview.adoc[] b include::overview.adoc[] c');
  });

  it('skips a find that is absent — a safe no-op when the live text has diverged', () => {
    const ytext = ytextWith('nothing to see');
    expect(applyReplacementsToYText(ytext, [{ find: 'include::x.adoc[]', replace: 'y' }])).toBe(0);
    expect(ytext.toString()).toBe('nothing to see');
  });

  it('does not loop forever when replace contains find', () => {
    const ytext = ytextWith('a');
    expect(applyReplacementsToYText(ytext, [{ find: 'a', replace: 'aa' }])).toBe(1);
    expect(ytext.toString()).toBe('aa');
  });

  it('skips empty-find and identity replacements', () => {
    const ytext = ytextWith('keep');
    expect(
      applyReplacementsToYText(ytext, [
        { find: '', replace: 'x' },
        { find: 'keep', replace: 'keep' },
      ]),
    ).toBe(0);
    expect(ytext.toString()).toBe('keep');
  });
});

describe('applyEditsToDocument', () => {
  it('loads a dormant document, applies the edit, and the writeback persists corrected text', async () => {
    const stored: string[] = [];
    const seed = '= Doc\n\ninclude::intro.adoc[]\n';
    const extension = {
      onLoadDocument: async ({ document }: { document: Y.Doc }) => {
        const ytext = document.getText('codemirror');
        if (ytext.length === 0) ytext.insert(0, seed);
      },
      onStoreDocument: async ({ document }: { document: Y.Doc }) => {
        stored.push(document.getText('codemirror').toString());
      },
    };
    const server = new Server({ port: 0, extensions: [extension as unknown as Extension] });
    try {
      const applied = await applyEditsToDocument(server.hocuspocus, {
        projectId: '770e8400-e29b-41d4-a716-446655440003',
        yjsStateId: '11111111-e29b-41d4-a716-446655440111',
        replacements: [{ find: 'include::intro.adoc[]', replace: 'include::overview.adoc[]' }],
      });

      expect(applied).toBe(1);
      // disconnect() forces a writeback; it must see the corrected (not the seeded stale) text.
      expect(stored.length).toBeGreaterThan(0);
      expect(stored.at(-1)).toContain('include::overview.adoc[]');
      expect(stored.at(-1)).not.toContain('intro.adoc');
    } finally {
      await server.destroy();
    }
  });
});
