# Phase 1 Data Model: Per-User Preview Style Preference

## Entity: Preview Style Preference

Not a standalone entity — it is **one new field on the existing `EditorPreferences` aggregate**, owned by and scoped to a single user (1:1 with `User`, as today). This mirrors the existing `softWrap` field exactly.

### Value Object: `PreviewStyle`

| Property | Value |
|----------|-------|
| Location | `packages/domain/src/value-objects/preview-style.ts` |
| Allowed values (stored tokens) | `'asciidocollab'` (default) \| `'asciidoctor'` |
| Default | `'asciidocollab'` |
| Display labels (UI only) | `asciidocollab` → "Asciidocollab"; `asciidoctor` → "Asciidoctor" (mapped in the `PreviewStyleControl` component, not stored) |
| Construction | private constructor; `static parse(raw: string): Result<PreviewStyle, ValidationError>` |
| Pattern source | mirrors `value-objects/editor-theme.ts` |

```ts
export type PreviewStyleValue = 'asciidocollab' | 'asciidoctor';
// VALID_STYLES guard; PreviewStyle.parse returns Result<PreviewStyle, ValidationError>
```

### Field on `EditorPreferences` entity

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `previewStyle` | `PreviewStyle` | `asciidocollab` | Added as a trailing optional constructor parameter (after `softWrap`), defaulting to the brand style, so existing call sites stay valid. No range validation beyond the VO's enum check. |

### Constant

`packages/domain/src/constants/editor-preferences.ts`:
```ts
export const DEFAULT_PREVIEW_STYLE = 'asciidocollab' as const;
```

## Persistence

### Prisma schema — `packages/db/prisma/schema.prisma`

Add one column to `model EditorPreferences`:

```prisma
previewStyle  String  @default("asciidocollab")
```

- Nullable-free with a DB default so existing rows back-fill to the brand style (FR-002).
- A Prisma migration adds the column with the default.

### Prisma repository — `prisma-editor-preferences.repository.ts`

- `save`: include `previewStyle: prefs.previewStyle.value` in both `update` and `create`.
- `toDomain`: parse `row.previewStyle` via `PreviewStyle.parse`; **on failure, fall back to the `asciidocollab` default rather than throwing** (FR-015) — a deliberate divergence from how `theme` is handled. Add `previewStyle: string` to the `row` shape.

### In-memory fake — `packages/domain/tests/ports/user/in-memory-editor-preferences.repository.ts`

Carry `previewStyle` with identical default + fallback semantics so seam tests stay faithful to the Prisma implementation (Constitution III).

## Transport (DTO + API)

### Shared DTO — `packages/shared/src/dtos/editor-preferences.dto.ts`

```ts
export interface EditorPreferencesDto {
  fontSize: number;
  theme: 'default' | 'high-contrast' | 'dracula' | 'tomorrow' | 'espresso';
  scrollSyncEnabled: boolean;
  softWrap?: boolean;
  previewStyle?: 'asciidocollab' | 'asciidoctor'; // NEW — optional for backward-compatible responses
}
```

### API route — `apps/api/src/routes/editor-preferences.ts`

- `putBodySchema.properties.previewStyle`: `{ type: 'string', enum: ['asciidocollab', 'asciidoctor'] }` (not required; `additionalProperties: false` retained).
- PUT handler: pass `request.body.previewStyle` into `SaveEditorPreferencesUseCase`.
- GET handler + DTO mapping: include `previewStyle: result.value.previewStyle.value`.

### Save use case — `save-editor-preferences.ts`

- Extend `SaveEditorPreferencesInput` with `previewStyle?: string`.
- Parse via `PreviewStyle.parse`; on invalid input, either reject with `ValidationError` (boundary already enum-validated by Fastify) or coalesce to existing/default. Recommended: `input.previewStyle ?? existing?.previewStyle ?? default`, matching the `softWrap`/`scrollSyncEnabled` coalescing pattern, then validate.

## Client state — `apps/web/src/hooks/use-editor-preferences.ts`

| Concern | Change |
|---------|--------|
| `EditorPrefs` interface | add `previewStyle: PreviewStyleValue` |
| `DEFAULT_PREFS` | add `previewStyle: 'asciidocollab'` |
| `isPreviewStyleValue` guard | new local guard (mirrors `isEditorThemeValue`) |
| `loadFromStorage` | parse `parsed.previewStyle`; default-on-invalid (FR-015, FR-016 seed) |
| GET-on-mount merge | merge `data.previewStyle` with the same guard |
| `setPreviewStyle` | new setter: update state, write localStorage, `schedulePut` (debounced PUT) — identical shape to `setSoftWrap` |
| return value | expose `previewStyle` + `setPreviewStyle` |

## State / lifecycle

- **Default**: brand-new user or absent record → `asciidocollab` (DB default + client default).
- **Corrupt/unknown stored value**: → `asciidocollab` (repo `toDomain` fallback + client `loadFromStorage` guard) (FR-015).
- **Change**: optimistic local update + localStorage write + debounced PUT; reconciled to the account on next successful save (offline edge case).
- **Cross-surface sync**: both the header control and settings card derive from the single `useEditorPreferences().previewStyle`, so a change in one re-renders the other (FR-006).
- **No transitions / no relationships beyond the existing 1:1 `EditorPreferences ↔ User`.**

## Requirements traceability

| Requirement | Covered by |
|-------------|-----------|
| FR-001 two options | `PreviewStyle` VO union |
| FR-002 default brand | DB default + `DEFAULT_PREVIEW_STYLE` + client default |
| FR-005/FR-006 settings + header in sync | single hook field, two controls |
| FR-007 per-user persistence | `editor_preferences` column + existing GET/PUT |
| FR-015 fallback on corrupt | repo `toDomain` + client guard default-on-invalid |
| FR-016 no flash | localStorage-seeded `previewStyle` applied before first paint |
