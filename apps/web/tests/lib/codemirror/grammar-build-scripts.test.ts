import packageJson from '../../../package.json';

describe('Grammar build scripts', () => {
  // Issue C6: predev must compile the grammar so `pnpm dev` works on a fresh clone
  test('predev script includes lezer-generator so the grammar is compiled before dev server starts', () => {
    const predev: string = packageJson.scripts.predev;
    expect(predev).toContain('lezer-generator');
  });

  test('prebuild script includes lezer-generator', () => {
    const prebuild: string = packageJson.scripts.prebuild;
    expect(prebuild).toContain('lezer-generator');
  });
});
