import { fetchReachableContent } from '@/lib/codemirror/include-tree-fetcher';
import { resolveSandboxedPath } from '@/lib/asciidoc/sandbox-path';

/** An in-memory `resolveInclude` that sandboxes targets, mirroring the production wiring. */
const resolveInclude = (files: Record<string, string>) => (from: string, target: string) => {
  const resolved = resolveSandboxedPath(from, target);
  return resolved.ok && files[resolved.path] !== undefined ? resolved.path : null;
};

describe('fetchReachableContent', () => {
  test('fetches an include gated only by a render-intrinsic (ifdef::backend-html5[]) — preview parity', async () => {
    // The render assembler, symbol index, and effective-offset walk all seed the render intrinsics, so
    // `backend-html5` is in effect and this include IS rendered. The fetcher must therefore fetch the
    // child too, or every downstream consumer reads null for it (missing symbols/attributes/render).
    const sources: Record<string, string> = {
      'main.adoc': 'ifdef::backend-html5[]\ninclude::child.adoc[]\nendif::[]\n',
      'child.adoc': '== Child\n',
    };
    // The overlay (open) file is already known; seed the cache with it.
    const cache = new Map<string, string | null>([['main.adoc', sources['main.adoc']]]);
    const fetched: string[] = [];

    const completed = await fetchReachableContent({
      rootFileId: 'main.adoc',
      readContent: (id) => cache.get(id) ?? null,
      resolveInclude: resolveInclude(sources),
      fetchContent: async (id) => {
        fetched.push(id);
        return sources[id] ?? '';
      },
      cache,
      overlayFileId: 'main.adoc',
      isCancelled: () => false,
    });

    expect(completed).toBe(true);
    expect(fetched).toContain('child.adoc');
  });
});
