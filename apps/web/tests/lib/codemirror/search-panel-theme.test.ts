import { searchPanelTheme } from '@/lib/codemirror/search-panel-theme';

describe('searchPanelTheme', () => {
  it('is a CodeMirror extension (guards against import/build breakage)', () => {
    // EditorView.theme() returns a non-null Extension; a smoke check that the module builds.
    expect(searchPanelTheme).toBeDefined();
    expect(searchPanelTheme).not.toBeNull();
  });
});
