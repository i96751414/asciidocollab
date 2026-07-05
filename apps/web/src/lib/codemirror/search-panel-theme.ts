/**
 * Design-token theme for the in-editor CodeMirror find/replace panel
 * (`@codemirror/search`'s `search({ top: true })`). The stock panel is otherwise
 * unstyled; this reads every colour from the app's CSS variables so the panel
 * matches the Search tab and follows light/dark automatically, with no change to
 * the panel's behaviour or the search keymap. App chrome only — it never touches
 * the rendered-document surface.
 */
import { EditorView } from '@codemirror/view';

/** Builds an `hsl(var(--name))` colour string, optionally with an alpha value. */
const c = (name: string, alpha?: number) => (alpha === undefined ? `hsl(var(${name}))` : `hsl(var(${name}) / ${alpha})`);

export const searchPanelTheme = EditorView.theme({
  '.cm-panels': {
    backgroundColor: c('--popover'),
    color: c('--popover-foreground'),
  },
  '.cm-panels.cm-panels-top': {
    borderBottom: `1px solid ${c('--border')}`,
  },
  '.cm-panels.cm-panels-bottom': {
    borderTop: `1px solid ${c('--border')}`,
  },
  '.cm-panel.cm-search': {
    padding: '6px 8px',
    fontSize: '12px',
    fontFamily: 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)',
  },
  '.cm-panel.cm-search label': {
    // The stock panel wraps each checkbox and its text in a <label>; baseline
    // alignment leaves the box sitting high, so lay it out as a centred inline row.
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    verticalAlign: 'middle',
    color: c('--muted-foreground'),
    fontSize: '12px',
  },
  '.cm-panel.cm-search input[type=checkbox]': {
    margin: '0',
    verticalAlign: 'middle',
    accentColor: c('--primary'),
  },
  '.cm-panel.cm-search .cm-textfield': {
    backgroundColor: c('--background'),
    color: c('--foreground'),
    border: `1px solid ${c('--border')}`,
    borderRadius: '4px',
    padding: '2px 6px',
    outline: 'none',
  },
  '.cm-panel.cm-search .cm-textfield:focus-visible': {
    borderColor: c('--ring'),
    boxShadow: `0 0 0 1px ${c('--ring')}`,
  },
  '.cm-panel.cm-search .cm-button': {
    backgroundColor: c('--secondary'),
    backgroundImage: 'none',
    color: c('--secondary-foreground'),
    border: `1px solid ${c('--border')}`,
    borderRadius: '4px',
    padding: '2px 8px',
    cursor: 'pointer',
  },
  '.cm-panel.cm-search .cm-button:hover': {
    backgroundColor: c('--accent'),
    color: c('--accent-foreground'),
  },
  '.cm-panel.cm-search .cm-button:active': {
    backgroundColor: c('--primary', 0.1),
  },
  '.cm-panel.cm-search [name=close]': {
    color: c('--muted-foreground'),
    cursor: 'pointer',
  },
  '.cm-panel.cm-search [name=close]:hover': {
    color: c('--foreground'),
  },
});
