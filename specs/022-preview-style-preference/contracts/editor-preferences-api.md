# Contract: Editor Preferences API (extended)

Reuses the existing authenticated endpoints — no new routes. `previewStyle` is added to the
existing request/response shape. Both endpoints require `requireAuth`.

## GET `/auth/me/editor-preferences`

**Response 200** (`EditorPreferencesDto`):

```json
{
  "fontSize": 14,
  "theme": "default",
  "scrollSyncEnabled": false,
  "softWrap": true,
  "previewStyle": "asciidocollab"
}
```

- `previewStyle` ∈ `"asciidocollab" | "asciidoctor"`.
- For a user with no stored value, the server returns `"asciidocollab"` (default), never omits it as garbage.
- **500** → `{ "error": { "code": "INTERNAL_ERROR", ... } }` (unchanged).

## PUT `/auth/me/editor-preferences`

**Request body** (`additionalProperties: false`):

```json
{
  "fontSize": 14,
  "theme": "default",
  "scrollSyncEnabled": false,
  "softWrap": true,
  "previewStyle": "asciidoctor"
}
```

Body schema additions:

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `previewStyle` | string | no | `enum: ["asciidocollab", "asciidoctor"]` |

**Responses**:
- **204** No Content — saved.
- **400** `{ "error": { "code": "VALIDATION_ERROR", "message": ... } }` — body fails schema (e.g. `previewStyle` not in enum) or domain validation.

**Behavior**:
- Omitting `previewStyle` preserves the existing stored value (coalescing, like `softWrap`).
- A stored value that later fails to parse resolves to `"asciidocollab"` on read (FR-015) — the API never 500s on a corrupt preview style.

## Contract tests (api)

- GET returns `previewStyle` with the stored value; returns default for a user with none.
- PUT with `previewStyle: "asciidoctor"` persists and is reflected on subsequent GET.
- PUT with `previewStyle: "bogus"` → 400 (Fastify enum rejection).
- PUT without `previewStyle` leaves the prior value unchanged.
