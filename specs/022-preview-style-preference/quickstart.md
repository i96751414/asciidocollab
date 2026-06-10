# Quickstart: Per-User Preview Style Preference

## What this feature does

Each signed-in user picks how the AsciiDoc **preview** renders — **Asciidocollab** (brand
look, follows light/dark) or **Asciidoctor** (official docs look, always light). The choice
is personal, persists across sessions/devices, and never changes the document or what
teammates see.

## Using it

### From the preview header
1. Open an AsciiDoc file in the editor; the preview pane shows on the right.
2. In the preview header (next to the scroll-sync/collapse buttons) use the **Style** control.
3. Pick **Asciidoctor** or **Asciidocollab** — the preview restyles instantly in place.

### From settings
1. Go to **Settings → Editor Preferences**.
2. Use the **Preview Style** control. It mirrors the header control (and vice versa).

### Expected behavior
- The selected style reappears after reload and on other devices (no flash of the default).
- In dark mode, Asciidocollab is dark; Asciidoctor stays light and legible; the app chrome
  is unaffected by Asciidoctor.

## Developer: re-syncing the vendored Asciidoctor CSS

The Asciidoctor look is the MIT-licensed `asciidoctor-default.css`, vendored verbatim and
scoped at build time.

1. **Obtain the source** (first that resolves):
   - `node_modules/@asciidoctor/core/dist/css/asciidoctor.css`, or
   - the `asciidoctor-stylesheets` npm package CSS, or
   - upstream `asciidoctor/asciidoctor` repo `data/stylesheets/asciidoctor-default.css` (raw).
2. **Vendor verbatim** to `apps/web/src/styles/vendor/asciidoctor-default.css`, **keeping the
   MIT/license header** and noting the upstream commit/tag in the top comment.
3. **Regenerate the scoped file**:
   ```bash
   pnpm --filter @asciidocollab/web run build:asciidoctor-style
   # (also runs automatically via predev / prebuild)
   ```
   This produces `apps/web/src/styles/asciidoctor-style.generated.css`, where every selector
   is prefixed with `.asciidoc-preview-content[data-preview-style="asciidoctor"]`. Commit the
   regenerated file (same convention as the committed lezer parser).

> Do **not** hand-edit the vendored or generated files — change the source and re-run the script.

## Developer: how the style is applied

- The preview content element carries the lowercase token `data-preview-style="asciidocollab" | "asciidoctor"` (the UI maps these to the display labels "Asciidocollab" / "Asciidoctor").
- Brand CSS (`asciidoc-preview.css`, token-driven) is the default/no-attribute baseline.
- The generated scoped CSS only matches when the attribute is `asciidoctor`; a fixed light
  surface rule keeps it readable in dark mode without leaking into app chrome.
- The preference rides the existing editor-preferences slice
  (`useEditorPreferences().previewStyle` ↔ `/auth/me/editor-preferences` ↔
  `editor_preferences.previewStyle`). No parallel store.

## Verify locally

```bash
# domain + infra + shared + api
pnpm --filter @asciidocollab/domain test
pnpm --filter @asciidocollab/infrastructure test
pnpm --filter @asciidocollab/api test

# web
pnpm --filter @asciidocollab/web typecheck
pnpm --filter @asciidocollab/web test
pnpm --filter @asciidocollab/web build   # confirms predev/prebuild generates the scoped CSS

# db migration (adds editor_preferences.previewStyle default 'asciidocollab')
pnpm --filter @asciidocollab/db exec prisma migrate dev
```

## Out of scope
Per-document/per-project overrides, export/output styling, styles beyond the two named,
theming the app chrome, and a dark Asciidoctor variant (the official sheet is light-only).
