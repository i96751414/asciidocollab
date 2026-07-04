import { isValidNewName } from '../src/name-validation';

describe('isValidNewName', () => {
  it('accepts word-only attribute names and rejects a leading underscore or punctuation', () => {
    expect(isValidNewName('attribute', 'product-name')).toBe(true);
    expect(isValidNewName('attribute', 'edition2')).toBe(true);
    expect(isValidNewName('attribute', '_edition')).toBe(false); // attributes are word-only
    expect(isValidNewName('attribute', 'a.b')).toBe(false);
  });

  it('accepts anchor ids with a leading underscore and `:.-` (Asciidoctor id syntax)', () => {
    expect(isValidNewName('anchor', '_install_guide')).toBe(true); // auto-id idprefix form
    expect(isValidNewName('anchor', 'sect:1.2-a')).toBe(true);
    expect(isValidNewName('anchor', '1leading-digit')).toBe(false); // must start with a letter or `_`
  });

  it('rejects the empty string for either kind', () => {
    expect(isValidNewName('attribute', '')).toBe(false);
    expect(isValidNewName('anchor', '')).toBe(false);
  });
});
