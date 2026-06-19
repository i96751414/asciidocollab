/**
 * The intrinsic attributes Asciidoctor injects for this app's embedded html5/article render — set on
 * every document yet never written as `:name:` lines in the source. They must be in scope wherever the
 * app reasons about what the render will resolve: the preview include assembler's conditional gating
 * and `{attr}` target substitution, and the editor's effective-level walk (so an include guarded by
 * `ifdef::backend-html5[]` is treated consistently in both). Captured from Asciidoctor.js's default
 * attribute set for `load({ safe: 'safe' })` with no explicit doctype/backend override.
 */
export const RENDER_INTRINSIC_ATTRIBUTES: ReadonlyMap<string, string> = new Map([
  ['backend', 'html5'],
  ['backend-html5', ''],
  ['basebackend', 'html'],
  ['basebackend-html', ''],
  ['filetype', 'html'],
  ['filetype-html', ''],
  ['doctype', 'article'],
  ['doctype-article', ''],
  ['backend-html5-doctype-article', ''],
  ['basebackend-html-doctype-article', ''],
  ['safe-mode-name', 'safe'],
  ['safe-mode-safe', ''],
  ['safe-mode-level', '1'],
]);
