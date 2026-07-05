import { createStores } from '../../src/di/stores';
import type { getConfig } from '../../src/config';

/**
 * The project-wide search/replace routes resolve the RE2 regex engine off
 * `request.server.stores.regexEngine`, so the composition root MUST wire it. A
 * missing wiring would only surface at runtime, so pin it here.
 */
function fakeConfig(): ReturnType<typeof getConfig> {
  return {
    storage: { path: '/tmp/asciidocollab-stores-test' },
    collab: {
      editUrl: 'https://collab.internal:4101',
      editSecret: '',
      editTls: { cert: '', key: '', ca: '' },
    },
  } as unknown as ReturnType<typeof getConfig>;
}

describe('createStores', () => {
  it('wires a working linear-time regex engine', () => {
    const stores = createStores(fakeConfig());
    expect(stores.regexEngine).toBeDefined();

    const compiled = stores.regexEngine.compile('(a+)b', { caseSensitive: true, multiline: false });
    expect(compiled.success).toBe(true);
    if (!compiled.success) return;
    const spans = compiled.value.matches('aab xb ab', {
      maxMatches: 100,
      deadline: Number.POSITIVE_INFINITY,
    });
    expect(spans.map((s) => s.groups[0])).toEqual(['aab', 'ab']);
  });

  it('rejects an invalid pattern instead of throwing', () => {
    const stores = createStores(fakeConfig());
    const compiled = stores.regexEngine.compile('(unterminated', { caseSensitive: true, multiline: false });
    expect(compiled.success).toBe(false);
  });
});
