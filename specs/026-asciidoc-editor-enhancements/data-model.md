# Phase 1 Data Model: AsciiDoc Editor Enhancements

Two tiers: **persisted** entities (PostgreSQL/Prisma + per-user preference store) and **client-side/editor** entities (in-memory, derived; not persisted as document content). Per Constitution VII, per-user state never mutates shared document source.

---

## Persisted

### Project (extended)

Existing entity (`packages/domain/src/entities/project.ts`). One new field.

| Field | Type | Notes |
|-------|------|-------|
| `mainFileNodeId` | `string \| null` | FK → `FileNode.id`. The configured main/master AsciiDoc file (FR-045). Nullable: unset ⇒ current-file-only resolution (FR-047). **Node-id (not path) reference** so it survives move/rename automatically (FR-070). |

- **Authorization** (`SetProjectMainFileUseCase`): the use case takes the `actorId`, loads the caller's project membership, and enforces project-edit permission **in the domain** — returns `PermissionDeniedError` and records an authorization-denial audit entry when the caller is not an editor (mirrors `UpdateProjectUseCase`; security_constitution: permission checks live in use cases, not routes). The route never performs this check.
- **Validation** (`SetProjectMainFileUseCase`, after authorization): node MUST exist, belong to this project, and be an `.adoc` file; otherwise `Result.err` (typed domain error, e.g. `MainFileNotFound` / `MainFileNotAsciiDoc`). Clearing (set to null) is allowed.
- **Scope**: project-shared configuration (permitted per clarified Constitution VII). Governed by existing project-edit permission, enforced in the use case as above.
- **Prisma**: nullable column + FK on `Project` (`packages/db/prisma/schema.prisma`); `onDelete: SetNull` so **deleting the main file clears the configuration** (FR-070). Applied to the dev DB via `prisma db push` — **no committed migration until release** (not production-ready yet).
- **Move/rename consistency (FR-070)**: because the reference is by node id, a move/rename keeps it valid automatically. `RenameFileUseCase` MUST additionally **clear** `mainFileNodeId` (set null) when a rename makes the configured main file no longer a valid AsciiDoc main file (e.g. non-`.adoc` extension), and signal the change so the UI informs the user. No path-based lookup of the main file is permitted.
- **DTO**: `mainFileNodeId` added to the project DTO in `packages/shared`.

### EditorPreference (per-user, extended)

Existing per-user store (`use-editor-preferences.ts`: localStorage + API mirror). Existing: `fontSize`, `theme`, `softWrap`, `scrollSyncEnabled`, `previewStyle`.

| Field | Type | Notes |
|-------|------|-------|
| `softWrap` | `boolean` | **Already exists** (default true). US2 only needs UI exposure, not a model change. |
| `foldState` | map keyed `userId:projectId:fileId` → folded ranges | NEW (FR-043). Per-user; restored on reopen; reconciled if the document changed (edge case). |
| `spellIgnore` | `string[]` (per user) | NEW (FR-063 edge case). User-extensible ignore list. |

- **Constitution VII**: all per-user; never serialized into the document/Yjs doc.

---

## Shared contracts (`packages/shared`)

To avoid two definitions of the same cross-boundary concept (Architecture Constitution: shared owns cross-package types; Reuse Before Rebuild), the AsciiDoc structural **shapes and pure rules** are owned by `packages/shared`, not redefined in `apps/web` or `packages/domain`:

- **`packages/shared/src/asciidoc-model/`** — DTOs `Reference`, `ProjectSymbol`, `Diagnostic`, `IncludeEdge`, plus pure functions: reference/symbol **extraction**, include-graph build, and effective-level/leveloffset rules (no CodeMirror, no Prisma). Consumed by the web symbol index AND the domain `FindReferencesUseCase`.
- **`packages/shared/src/project-path/`** — `resolveSandboxedPath()` enforcing Constitution IX (reject `..`/absolute/symlink/remote). Single rule used by the web index, the render worker (FR-068), and domain move/rename/file-read.

The client-side entities below are a **read-only projection** of these shared shapes (the editor adds CM ranges/decorations); they MUST NOT re-implement the parsing/resolution rules. See `architecture-migration-plan.md`.

## Client-side / Editor (projection over the shared model)

### Document Tree (Include Graph)

Built by `use-project-symbol-index` from `Project.mainFileNodeId`, using the shared `asciidoc-model` extraction + `resolveSandboxedPath` (not a local parser).

| Field | Type | Notes |
|-------|------|-------|
| `rootFileId` | string | the main file (or the open file when none configured) |
| `nodes` | `FileNode[]` | files reachable via transitive `include::` |
| `edges` | `{from, to, includeDirectiveRange}[]` | include relationships |
| `unresolved` | `{fromFile, target, range}[]` | missing/unresolvable includes → diagnostics (FR-050) |

- **Build rules**: transitive include resolution with **cycle guard** (FR-050); content = persisted files + open file's live edits overlaid (FR-048); rebuild debounced + invalidated on file-change SSE / main-file change (R4/R12). Each edge also carries the `:leveloffset:` in effect at the include point (in-file offset state + `include::` `leveloffset=`), feeding the Level-Offset Context.
- **Reactivity (FR-045a)**: a change to `Project.mainFileNodeId` invalidates the graph and **all dependents** — symbol index, diagnostics, completion, and effective-level heading highlighting — which recompute without a reload.
- **Lifecycle**: empty/degraded → current-file-only scope (FR-047); offset base = 0.

### Level-Offset Context (derived)

| Field | Type | Notes |
|-------|------|-------|
| `fileId` | string | file the offset applies within |
| `inheritedBase` | number | offset in effect where this file is included (accumulated from ancestors along the main-file path + `include::` `leveloffset=`) |
| `entries` | `{range, op: '+N'\|'-N'\|'set N'\|'unset'}[]` | in-file `:leveloffset:` changes in document order |

- `effectiveLevel(headingLine) = rawMarkerCount + inheritedBase + (sum of in-file ops up to that line)`; drives FR-009/010/071. Recomputed when the include graph / main file changes (FR-045a). Ambiguous when a file is included from multiple places with different `inheritedBase` → use the offset from the first include reached in document-order depth-first traversal from the main file (deterministic) + a non-blocking multiple-context indicator.

### Project Symbol

| Field | Type | Notes |
|-------|------|-------|
| `kind` | `'section' \| 'anchor' \| 'attribute'` | |
| `name` | string | section ID / anchor ID / attribute name |
| `fileId` | string | defining file |
| `range` | `{from,to}` | definition location (for go-to-definition / go-to-symbol) |

- Powers cross-file completion (FR-029/030), validation (FR-033/060), go-to-definition (FR-034), Go to Symbol (FR-061), rename & find-usages (FR-064/065).
- **Uniqueness**: duplicate `(kind, name)` within the tree ⇒ duplicate-ID diagnostic (FR-033).

### Reference *(shared DTO — `packages/shared/src/asciidoc-model`)*

| Field | Type | Notes |
|-------|------|-------|
| `kind` | `'xref' \| 'include' \| 'image' \| 'attributeRef'` | |
| `target` | string | referenced symbol/file/path |
| `fileId` | string | file containing the reference |
| `range` | `{from,to}` | |

- Defined **once** in shared; produced by the shared extractor and consumed by both the web index and the domain `FindReferencesUseCase`. Drives validation (FR-033/060), find-usages (FR-065), and reference-rewriting on move/rename (FR-066). (`ProjectSymbol`, `Diagnostic`, `IncludeEdge` are likewise shared DTOs.)

### Diagnostic

| Field | Type | Notes |
|-------|------|-------|
| `severity` | `'error' \| 'warning' \| 'info'` | |
| `message` | string | |
| `range` | `{from,to}` | |
| `code` | enum | `unterminated-block` \| `unknown-xref` \| `duplicate-id` \| `undefined-attribute` \| `unresolved-include` |

- Produced by the `@codemirror/lint` async source (R3); never mutates the document.

### Fold State (runtime ↔ persisted)

Runtime CM fold ranges, serialized to the per-user `EditorPreference.foldState` (R8) on change and restored on open (FR-043), reconciling safely if the document changed externally (edge case).

---

## Relationships

```
Project ──mainFileNodeId──▶ FileNode (root of) ──include::*──▶ Document Tree (Include Graph)
                                                                   │ extract
                                                                   ├─▶ Project Symbol*  ◀─resolve─ Reference*
                                                                   └─▶ Diagnostic* (from Symbol/Reference/Tree)
User ──owns──▶ EditorPreference { softWrap, foldState, spellIgnore }   (never touches document content)
```

## Domain use cases / ports touched

- `SetProjectMainFileUseCase` (NEW) + project repository port method `setMainFile` (+ in-memory fake). Depends on the existing `ProjectMemberRepository` (project-edit authorization) and `AuditLogRepository` (denial recording) — both already used by `UpdateProjectUseCase`; in-memory fakes reused.
- `MoveFileUseCase` / `RenameFileUseCase` (EXTEND) — after path cascade, rewrite `include::`/`image::`/`xref` references in affected files (FR-066, via the shared `asciidoc-model` extractor + `resolveSandboxedPath`); guard against creating duplicates/unresolved refs (FR-067); and **maintain `Project.mainFileNodeId`** — keep it valid across move/rename (id-based), and clear it when a rename invalidates the main file's type or it is deleted (FR-070). The result MUST carry a **typed `mainFileCleared: boolean`** outcome (shared DTO), not an ad-hoc signal, so the web UI can notify the user.
- **Shared modules** (`packages/shared`): `asciidoc-model` (DTOs + reference/symbol extraction + include-graph/leveloffset rules) and `project-path/resolveSandboxedPath` are the single source for these shapes/rules; the web symbol index and domain use cases both import them rather than redefining (Architecture Constitution; `architecture-migration-plan.md`).
- `FindReferencesUseCase` (NEW) — find-usages across project files (FR-065); reused by rename (FR-064).
- Reading file contents for the index/reference operations uses an existing file-content read port (reused; in-memory fake mirrors it). All fallible operations return `Result<T,E>`.
