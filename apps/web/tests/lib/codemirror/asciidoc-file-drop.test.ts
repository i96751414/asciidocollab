import {
  buildFileMacro,
  macroFromDropPayload,
  padBlockMacro,
  macroPathRange,
} from '@/lib/codemirror/asciidoc-file-drop';

describe('buildFileMacro', () => {
  it('builds an image:: macro for images, with the filename stem as alt', () => {
    expect(buildFileMacro('New Folder/pic.png')).toBe('image::New Folder/pic.png[pic]');
  });

  it('builds an include:: macro for non-images', () => {
    expect(buildFileMacro('chapters/intro.adoc')).toBe('include::chapters/intro.adoc[]');
  });

  it('handles a bare filename with no directory', () => {
    expect(buildFileMacro('diagram.svg')).toBe('image::diagram.svg[diagram]');
  });

  it('handles a path with no extension (treated as include)', () => {
    expect(buildFileMacro('Makefile')).toBe('include::Makefile[]');
  });
});

describe('macroFromDropPayload', () => {
  it('returns a macro for a valid payload', () => {
    expect(macroFromDropPayload(JSON.stringify({ path: 'a/b.png' }))).toBe('image::a/b.png[b]');
  });

  it('returns null for invalid JSON', () => {
    expect(macroFromDropPayload('not json')).toBeNull();
  });

  it('returns null when the payload has no path', () => {
    expect(macroFromDropPayload(JSON.stringify({ other: 1 }))).toBeNull();
  });

  it('returns null when path is empty', () => {
    expect(macroFromDropPayload(JSON.stringify({ path: '' }))).toBeNull();
  });

  it('returns null when path is not a string', () => {
    expect(macroFromDropPayload(JSON.stringify({ path: 42 }))).toBeNull();
  });
});

describe('padBlockMacro', () => {
  it('adds no padding at the document edges (null neighbours)', () => {
    expect(padBlockMacro('M', null, null)).toBe('M');
  });

  it('adds no padding when already on its own line', () => {
    expect(padBlockMacro('M', '\n', '\n')).toBe('M');
  });

  it('adds a leading newline when preceded by text', () => {
    expect(padBlockMacro('M', 'x', '\n')).toBe('\nM');
  });

  it('adds a trailing newline when followed by text', () => {
    expect(padBlockMacro('M', '\n', 'x')).toBe('M\n');
  });

  it('pads both sides when wedged between text', () => {
    expect(padBlockMacro('M', 'a', 'b')).toBe('\nM\n');
  });
});

describe('macroPathRange', () => {
  it('finds the path span of a block include::', () => {
    const line = 'include::chapters/intro.adoc[]';
    const range = macroPathRange(line);
    expect(range).not.toBeNull();
    expect(line.slice(range!.start, range!.end)).toBe('chapters/intro.adoc');
  });

  it('finds the path span of a block image::', () => {
    const line = 'image::New Folder/pic.png[alt]';
    const range = macroPathRange(line);
    expect(line.slice(range!.start, range!.end)).toBe('New Folder/pic.png');
  });

  it('finds the path span of an inline image:', () => {
    const line = 'see image:icon.png[icon] here';
    const range = macroPathRange(line);
    expect(line.slice(range!.start, range!.end)).toBe('icon.png');
  });

  it('returns null for a line with no macro', () => {
    expect(macroPathRange('just some prose')).toBeNull();
  });
});
