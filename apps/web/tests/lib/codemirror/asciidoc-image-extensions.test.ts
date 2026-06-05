import fs from 'node:fs';

describe('IMAGE_EXTENSIONS deduplication', () => {
  test('IMAGE_EXTENSIONS is defined in exactly one place (asciidoc-completions.ts), not in use-include-completions.ts', () => {
    const hookSource: string = fs.readFileSync(
      require.resolve('@/hooks/use-include-completions'),
      'utf8',
    );
    // After the fix, use-include-completions should import the predicate,
    // not define its own IMAGE_EXTENSIONS set inline.
    expect(hookSource).not.toContain("new Set(['.png'");
  });

  test('useImagePaths and isImageFile (used by createImageCompletionSource) agree on which extensions are images', () => {
    const { isImageFile } = require('@/lib/codemirror/asciidoc-image-extensions');
    const { useImagePaths } = require('@/hooks/use-include-completions');

    const allPaths = ['a.png', 'b.jpg', 'c.svg', 'd.webp', 'e.adoc', 'f.pdf'];
    const viaHook: string[] = useImagePaths(allPaths);
    const viaIsImageFile: string[] = allPaths.filter(isImageFile);

    expect(viaHook).toEqual(viaIsImageFile);
    expect(viaHook).toEqual(['a.png', 'b.jpg', 'c.svg', 'd.webp']);
  });
});
