// Tests for the backwards-compat re-export module src/lib/codemirror/constants.ts.

import * as constants from '@/lib/codemirror/constants';
import * as editorConfig from '@/lib/editor-config';

describe('codemirror/constants re-exports', () => {
  test.each([
    'AUTOSAVE_DEBOUNCE_MS',
    'EXTERNAL_CHANGE_POLL_INTERVAL_MS',
    'OFFLINE_QUEUE_KEY_PREFIX',
    'FONT_SIZE_MIN',
    'FONT_SIZE_MAX',
  ])('re-exports %s defined and identical to the editor-config source', (name) => {
    const value = Reflect.get(constants, name);
    expect(value).toBeDefined();
    expect(value).toBe(Reflect.get(editorConfig, name));
  });
});
