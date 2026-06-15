import {
  substitutePathAttributes,
  imagesDirectory,
  resolveIncludeTarget,
  resolveImageTarget,
} from '../../src/services/asciidoc-path';

const attributes = (entries: Record<string, string>): ReadonlyMap<string, string> =>
  new Map(Object.entries(entries));

describe('substitutePathAttributes', () => {
  it('substitutes a known attribute, case-insensitively', () => {
    expect(substitutePathAttributes('{partsdir}/intro.adoc', attributes({ partsdir: 'shared/parts' }))).toBe(
      'shared/parts/intro.adoc',
    );
    expect(substitutePathAttributes('{PartsDir}/intro.adoc', attributes({ partsdir: 'shared/parts' }))).toBe(
      'shared/parts/intro.adoc',
    );
  });

  it('leaves an unknown attribute reference intact', () => {
    expect(substitutePathAttributes('{nope}/x.adoc', new Map())).toBe('{nope}/x.adoc');
  });

  it('resolves nested attribute references', () => {
    expect(substitutePathAttributes('{partsdir}/i.adoc', attributes({ root: 'base', partsdir: '{root}/parts' }))).toBe(
      'base/parts/i.adoc',
    );
  });

  it('does not loop forever on a self-referential attribute', () => {
    expect(substitutePathAttributes('{a}', attributes({ a: '{a}' }))).toBe('{a}');
  });
});

describe('resolveIncludeTarget', () => {
  it('substitutes attributes then resolves relative to the including file', () => {
    const result = resolveIncludeTarget('book/main.adoc', '{partsdir}/intro.adoc', attributes({ partsdir: 'shared' }));
    expect(result.ok && result.path).toBe('book/shared/intro.adoc');
  });
});

describe('resolveImageTarget / imagesDirectory', () => {
  it('resolves relative to the project root, with imagesdir prepended', () => {
    const result = resolveImageTarget('logo.png', attributes({ imagesdir: 'img' }));
    expect(result.ok && result.path).toBe('img/logo.png');
  });

  it('uses the target as a project-root-relative path when imagesdir is not defined', () => {
    const result = resolveImageTarget('New Folder/pic.png', new Map());
    expect(result.ok && result.path).toBe('New Folder/pic.png');
  });

  it('substitutes attributes inside both imagesdir and the target', () => {
    const result = resolveImageTarget('{name}.png', attributes({ base: 'assets', imagesdir: '{base}/img', name: 'logo' }));
    expect(result.ok && result.path).toBe('assets/img/logo.png');
  });

  it('rejects an imagesdir that escapes the project root', () => {
    expect(resolveImageTarget('logo.png', attributes({ imagesdir: '../assets' })).ok).toBe(false);
  });

  it('ignores imagesdir for a remote image (which the sandbox then rejects)', () => {
    expect(resolveImageTarget('https://cdn.example.com/x.png', attributes({ imagesdir: 'img' })).ok).toBe(false);
  });

  it('imagesDirectory is empty when unset and trailing-slash-free when set', () => {
    expect(imagesDirectory(new Map())).toBe('');
    expect(imagesDirectory(attributes({ imagesdir: 'assets/' }))).toBe('assets');
  });
});
