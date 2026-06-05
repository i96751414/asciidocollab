// Issue 4: file-tree.ts must not define its own NEXT_PUBLIC_API_URL constant —
// the same divergence risk that was just fixed in use-auto-save.ts and
// use-file-selection.ts. It must import API_BASE_URL from lib/api/file-content.
describe('file-tree module must not duplicate API_BASE_URL', () => {
  test('file-tree.ts does not define its own NEXT_PUBLIC_API_URL expression', () => {
    const fs = require('node:fs');
    const source: string = fs.readFileSync(
      require.resolve('@/lib/api/file-tree'),
      'utf8',
    );
    expect(source).not.toContain('process.env.NEXT_PUBLIC_API_URL');
    expect(source).toContain('API_BASE_URL');
  });
});
