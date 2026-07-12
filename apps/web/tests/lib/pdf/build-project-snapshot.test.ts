import { RENDER_INTRINSIC_ATTRIBUTES } from '@/lib/asciidoc/render-intrinsics';
import { resolveImageTarget } from '@/lib/asciidoc/include-path';
import {
  buildProjectSnapshot,
  type BuildProjectSnapshotInput,
  type SnapshotFile,
} from '@/lib/pdf/build-project-snapshot';

const text = (path: string, content: string): SnapshotFile => ({ path, kind: 'text', content });
const binary = (path: string, bytes: Uint8Array): SnapshotFile => ({ path, kind: 'binary', bytes });
const attributes = (entries: Record<string, string> = {}): ReadonlyMap<string, string> =>
  new Map(Object.entries(entries));

const baseInput = (overrides: Partial<BuildProjectSnapshotInput> = {}): BuildProjectSnapshotInput => ({
  files: [],
  mainPath: null,
  openPath: 'main.adoc',
  attributes: attributes(),
  ...overrides,
});

describe('buildProjectSnapshot', () => {
  describe('text/binary partitioning', () => {
    it('routes text records to files and binary records to binaryAssets', () => {
      const png = new Uint8Array([1, 2, 3]);
      const { snapshot } = buildProjectSnapshot(
        baseInput({
          files: [
            text('main.adoc', '= Title\n\nBody'),
            text('chapters/intro.adoc', '== Intro'),
            binary('images/logo.png', png),
          ],
        }),
      );

      expect(snapshot.files).toEqual({
        'main.adoc': '= Title\n\nBody',
        'chapters/intro.adoc': '== Intro',
      });
      expect(snapshot.binaryAssets).toEqual({ 'images/logo.png': png });
      expect(snapshot.binaryAssets['images/logo.png']).toBe(png);
    });
  });

  describe('binary asset mounting (image path-match)', () => {
    // The placeholder bug is a path-match bug: the engine looks an image up at the path
    // `resolveImageTarget` resolves the macro to, so the bytes MUST be keyed identically. These tests
    // prove the key `buildProjectSnapshot` stores equals the engine's lookup key.
    it('keys a space-bearing image path identically to resolveImageTarget (no imagesdir)', () => {
      const png = new Uint8Array([1, 2, 3]);
      const resolved = resolveImageTarget('New Folder/Screenshot_20260608_164409.png', attributes());
      expect(resolved.ok).toBe(true);
      const key = resolved.ok ? resolved.path : '';

      const { snapshot } = buildProjectSnapshot(
        baseInput({ files: [text('main.adoc', `image::${'New Folder/Screenshot_20260608_164409.png'}[]`), binary(key, png)] }),
      );

      expect(key).toBe('New Folder/Screenshot_20260608_164409.png');
      expect(snapshot.binaryAssets[key]).toBe(png);
    });

    it('keys an imagesdir-relative image identically to resolveImageTarget', () => {
      const png = new Uint8Array([4, 5]);
      const attributeMap = attributes({ imagesdir: 'assets/img' });
      const resolved = resolveImageTarget('New Folder/pic.png', attributeMap);
      expect(resolved.ok).toBe(true);
      const key = resolved.ok ? resolved.path : '';

      const { snapshot } = buildProjectSnapshot(baseInput({ files: [binary(key, png)], attributes: attributeMap }));

      expect(key).toBe('assets/img/New Folder/pic.png');
      expect(snapshot.imagesDir).toBe('assets/img');
      expect(snapshot.binaryAssets[key]).toBe(png);
    });
  });

  describe('rootPath resolution', () => {
    it('prefers the main file path when present', () => {
      const { snapshot } = buildProjectSnapshot(
        baseInput({ mainPath: 'book.adoc', openPath: 'chapters/one.adoc' }),
      );
      expect(snapshot.rootPath).toBe('book.adoc');
      expect(snapshot.openPath).toBe('chapters/one.adoc');
    });

    it('falls back to the open file path when no main file is set', () => {
      const { snapshot } = buildProjectSnapshot(
        baseInput({ mainPath: null, openPath: 'chapters/one.adoc' }),
      );
      expect(snapshot.rootPath).toBe('chapters/one.adoc');
      expect(snapshot.openPath).toBe('chapters/one.adoc');
    });
  });

  describe('attribute merge', () => {
    it('seeds the render-intrinsic attributes merged with the project attributes', () => {
      const { snapshot } = buildProjectSnapshot(
        baseInput({ attributes: attributes({ author: 'Ada', version: '2' }) }),
      );
      for (const [name, value] of RENDER_INTRINSIC_ATTRIBUTES) {
        expect(snapshot.attributes[name]).toBe(value);
      }
      expect(snapshot.attributes.author).toBe('Ada');
      expect(snapshot.attributes.version).toBe('2');
    });

    it('lets a project attribute override an intrinsic default', () => {
      const { snapshot } = buildProjectSnapshot(baseInput({ attributes: attributes({ doctype: 'book' }) }));
      expect(snapshot.attributes.doctype).toBe('book');
    });
  });

  describe('imagesDir discovery', () => {
    it('captures the effective :imagesdir: attribute', () => {
      const { snapshot } = buildProjectSnapshot(baseInput({ attributes: attributes({ imagesdir: 'assets/img/' }) }));
      expect(snapshot.imagesDir).toBe('assets/img');
    });

    it('omits imagesDir when the attribute is unset', () => {
      const { snapshot } = buildProjectSnapshot(baseInput());
      expect(snapshot.imagesDir).toBeUndefined();
    });

    it('excludes and drops a remote :imagesdir:', () => {
      const { snapshot, excluded } = buildProjectSnapshot(
        baseInput({ attributes: attributes({ imagesdir: 'https://cdn.example.com/img' }) }),
      );
      expect(snapshot.imagesDir).toBeUndefined();
      expect(excluded).toContainEqual({ path: 'https://cdn.example.com/img', reason: 'remote' });
    });
  });

  describe('theme discovery', () => {
    it('uses an explicit :pdf-theme: attribute', () => {
      const { snapshot } = buildProjectSnapshot(
        baseInput({
          files: [text('themes/custom-theme.yml', 'font:')],
          attributes: attributes({ 'pdf-theme': 'themes/custom-theme.yml' }),
        }),
      );
      expect(snapshot.themePath).toBe('themes/custom-theme.yml');
    });

    it('auto-detects a *-theme.yml file when no attribute is set', () => {
      const { snapshot } = buildProjectSnapshot(
        baseInput({ files: [text('main.adoc', '= T'), text('brand-theme.yaml', 'base:')] }),
      );
      expect(snapshot.themePath).toBe('brand-theme.yaml');
    });

    it('omits themePath when nothing matches', () => {
      const { snapshot } = buildProjectSnapshot(baseInput({ files: [text('main.adoc', '= T')] }));
      expect(snapshot.themePath).toBeUndefined();
    });

    it('excludes and drops an escaping :pdf-theme:', () => {
      const { snapshot, excluded } = buildProjectSnapshot(
        baseInput({ attributes: attributes({ 'pdf-theme': '../../etc/theme.yml' }) }),
      );
      expect(snapshot.themePath).toBeUndefined();
      expect(excluded).toContainEqual({ path: '../../etc/theme.yml', reason: 'traversal' });
    });
  });

  describe('font discovery', () => {
    it('collects every binary asset with a font extension', () => {
      const ttf = new Uint8Array([0]);
      const otf = new Uint8Array([1]);
      const { snapshot } = buildProjectSnapshot(
        baseInput({
          files: [
            binary('fonts/body.ttf', ttf),
            binary('fonts/head.otf', otf),
            binary('images/pic.png', new Uint8Array([2])),
          ],
        }),
      );
      expect(snapshot.fontPaths).toEqual(['fonts/body.ttf', 'fonts/head.otf']);
    });

    it('returns an empty list when there are no fonts', () => {
      const { snapshot } = buildProjectSnapshot(baseInput());
      expect(snapshot.fontPaths).toEqual([]);
    });

    it('derives a WOFF2 custom font (the asset-mount stage converts it to TTF)', () => {
      const woff2 = new Uint8Array([7]);
      const { snapshot } = buildProjectSnapshot(baseInput({ files: [binary('fonts/brand.woff2', woff2)] }));
      expect(snapshot.fontPaths).toEqual(['fonts/brand.woff2']);
    });
  });

  describe('bib discovery', () => {
    it('uses an explicit :bibtex-file: attribute', () => {
      const { snapshot } = buildProjectSnapshot(
        baseInput({
          files: [text('refs/library.bib', '@book{x}')],
          attributes: attributes({ 'bibtex-file': 'refs/library.bib' }),
        }),
      );
      expect(snapshot.bibPath).toBe('refs/library.bib');
    });

    it('auto-detects a .bib file when no attribute is set', () => {
      const { snapshot } = buildProjectSnapshot(
        baseInput({ files: [text('main.adoc', '= T'), text('sources.bib', '@article{y}')] }),
      );
      expect(snapshot.bibPath).toBe('sources.bib');
    });

    it('omits bibPath when there is no bibliography', () => {
      const { snapshot } = buildProjectSnapshot(baseInput({ files: [text('main.adoc', '= T')] }));
      expect(snapshot.bibPath).toBeUndefined();
    });
  });

  describe('sandbox exclusion', () => {
    it('excludes remote and escaping file paths, keeping the safe ones', () => {
      const safe = new Uint8Array([9]);
      const { snapshot, excluded } = buildProjectSnapshot(
        baseInput({
          files: [
            text('main.adoc', '= Ok'),
            text('../secret.adoc', 'leak'),
            binary('http://evil.example/x.png', new Uint8Array([0])),
            binary('images/ok.png', safe),
          ],
        }),
      );

      expect(snapshot.files).toEqual({ 'main.adoc': '= Ok' });
      expect(snapshot.binaryAssets).toEqual({ 'images/ok.png': safe });
      expect(excluded).toContainEqual({ path: '../secret.adoc', reason: 'traversal' });
      expect(excluded).toContainEqual({ path: 'http://evil.example/x.png', reason: 'remote' });
    });

    it('surfaces excluded paths without throwing', () => {
      const { excluded } = buildProjectSnapshot(baseInput({ files: [text('/abs/path.adoc', 'x')] }));
      expect(excluded).toContainEqual({ path: '/abs/path.adoc', reason: 'absolute' });
    });
  });
});
