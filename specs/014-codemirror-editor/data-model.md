# Data Model: AsciiDoc Code Editor

**Branch**: `014-codemirror-editor` | **Date**: 2026-06-04

---

## Existing Entities (unchanged)

### Document *(packages/domain/src/entities/document.ts)*

Already exists. Used as-is: `SaveDocumentContentUseCase` is already wired to the `PUT /projects/:projectId/files/:fileNodeId/content` route. No changes to the entity or use case are required — the editor calls the existing endpoint.

### FileNode *(packages/domain/src/entities/file-node.ts)*

Used as-is for include-path completion (the editor reads the project tree via the existing file-tree GET endpoint).

---

## New Entity

### EditorPreferences *(packages/domain/src/entities/editor-preferences.ts)*

Stores per-user editor customisation settings that persist across browser sessions and devices.

| Field | Type | Constraints | Default |
|-------|------|-------------|---------|
| `id` | `EditorPreferencesId` | Unique, UUID | generated |
| `userId` | `UserId` | Unique FK → User | — |
| `fontSize` | `number` | Integer, 8–32 (inclusive) | 14 |
| `theme` | `EditorTheme` | `'default' \| 'high-contrast'` | `'default'` |
| `createdAt` | `Date` | Immutable after creation | `now()` |
| `updatedAt` | `Date` | Updated on every save | `now()` |

**Invariants**:
- `fontSize` MUST be in the range [8, 32]. Values outside this range MUST produce a `ValidationError`.
- `theme` MUST be one of the enumerated `EditorTheme` values.
- There is at most one `EditorPreferences` record per user (unique on `userId`).

**State transitions**:
- `EditorPreferences` is created on first write (upsert semantics); there is no explicit "create" step.

---

## New Value Objects

### EditorPreferencesId *(packages/domain/src/value-objects/editor-preferences-id.ts)*

Branded UUID wrapper for `EditorPreferences.id`. Follows the same pattern as `DocumentId`, `ProjectId`, etc.

### EditorTheme *(packages/domain/src/value-objects/editor-theme.ts)*

String union type: `'default' | 'high-contrast'`. Provides a `parse(raw: string): Result<EditorTheme, ValidationError>` factory so boundary code can safely deserialise API input.

---

## New Port Interface

### EditorPreferencesRepository *(packages/domain/src/ports/user/editor-preferences.repository.ts)*

```
findByUserId(userId: UserId): Promise<EditorPreferences | null>
save(prefs: EditorPreferences): Promise<void>   // upsert
```

**In-memory fake**: `packages/domain/tests/ports/user/in-memory-editor-preferences.repository.ts`
Behaviour: stores records in a `Map<string, EditorPreferences>`, keyed by `userId.value`. `save` upserts. Follows same conventions as `InMemoryKeyBindingRepository`.

---

## New Use Cases

### GetEditorPreferencesUseCase *(packages/domain/src/use-cases/settings/get-editor-preferences.ts)*

**Input**: `userId: UserId`
**Output**: `Result<EditorPreferences, never>` — returns default preferences if no record exists (never fails).
**Dependencies**: `EditorPreferencesRepository`
**Logic**: Finds preferences by `userId`. If not found, constructs and returns a default `EditorPreferences` value (font size 14, theme `'default'`). Does NOT persist the default — preferences are created on first explicit save.

### SaveEditorPreferencesUseCase *(packages/domain/src/use-cases/settings/save-editor-preferences.ts)*

**Input**: `userId: UserId`, `fontSize: number`, `theme: EditorTheme`
**Output**: `Result<EditorPreferences, ValidationError>`
**Dependencies**: `EditorPreferencesRepository`
**Logic**: Validates `fontSize` ∈ [8, 32] and `theme` ∈ `EditorTheme`. On failure returns `ValidationError`. On success, upserts the `EditorPreferences` record.

---

## Database Schema Addition *(packages/db/prisma/schema.prisma)*

```prisma
model EditorPreferences {
  id        String   @id @default(uuid())
  userId    String   @unique
  fontSize  Int      @default(14)
  theme     String   @default("default")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("editor_preferences")
}
```

**Migration policy**: Per the Architecture Constitution's database migration policy, the agent updates `schema.prisma` only. A Prisma migration script is NOT generated until the user explicitly requests it.

---

## Client-Side State (frontend only, not persisted in domain)

### EditorSaveState *(apps/web — TypeScript union)*

```ts
type EditorSaveState = 'saved' | 'saving' | 'unsaved' | 'error';
```

Lives in `use-auto-save.ts`. Not a domain entity — it is transient UI state.

### SectionOutlineEntry *(apps/web — TypeScript interface)*

```ts
interface SectionOutlineEntry {
  level: 1 | 2 | 3 | 4 | 5;
  title: string;
  line: number;   // 0-indexed editor line
}
```

Derived from the CodeMirror parse tree on every document change. Not stored.

### CompletionCandidate *(apps/web — TypeScript interface)*

The CodeMirror `Completion` type from `@codemirror/autocomplete` is used directly. No additional wrapper type is needed.
