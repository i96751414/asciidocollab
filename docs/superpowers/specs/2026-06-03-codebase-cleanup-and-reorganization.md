# Codebase Cleanup and Reorganization — Design Spec

## Goal

Apply 12 targeted improvements: remove dead code and deprecated aliases, fix type issues, improve code structure, and reorganize the domain layer for long-term maintainability.

## Architecture

No external API changes. All barrel exports stay stable. Internal directory structure changes in `packages/domain` and `packages/infrastructure`.

## Tech Stack

TypeScript, Prisma (schema migration for BigInt), Jest.

---

## Category A — Quick Cleanups

### A1. Allow empty file uploads

**Change**: Remove the `bytes.length === 0` guard and the corresponding `ValidationError('File must not be empty')` return from `packages/domain/src/use-cases/upload-asset.ts`.

**Rationale**: An AsciiDoc document that is yet to be filled is a valid upload target. The valid-file invariant is MIME type + size limit only.

**Test change**: Remove the test assertion `'returns ValidationError when bytes is empty (zero-byte file)'` from `packages/domain/tests/use-cases/upload-asset.test.ts`. Also remove the empty-file guard test from `apps/api/tests/routes/assets-validation.test.ts` (the `'source contains explicit handling for the empty-file message'` and related tests) and the `400`-for-empty-file branch from `apps/api/src/routes/projects/assets.ts`.

### A2. Remove dead code: `getAssetUrl`

**Change**: Delete the exported `getAssetUrl` function from `apps/web/src/lib/api/assets.ts`. It is defined but never called anywhere in the codebase.

### A3. Remove image-layer aliases

The `Image`/`ImageId` types were renamed to `Asset`/`AssetId`. Legacy re-export shims remain. Delete all of them:

| File | Action |
|------|--------|
| `packages/domain/src/entities/image.ts` | Delete |
| `packages/domain/src/value-objects/image-id.ts` | Delete |
| `packages/domain/src/repositories/image.repository.ts` | Delete (deprecated alias file) |
| `packages/domain/tests/entities/image.test.ts` | Delete |
| `packages/domain/tests/repositories/in-memory-image.repository.ts` | Delete |
| `packages/infrastructure/src/persistence/prisma-image.repository.ts` | Delete |
| `apps/api/src/routes/projects/images.ts` | Delete |
| `apps/api/tests/routes/images-multipart-limit.test.ts` | Delete |

**Barrel exports to update**: `packages/domain/src/entities/index.ts`, `packages/domain/src/value-objects/index.ts`, `packages/domain/src/repositories/index.ts`, `packages/infrastructure/src/index.ts`.

**Test helper**: Remove `createTestImage` alias from `packages/infrastructure/tests/helpers/test-data.ts`. Update `packages/infrastructure/tests/persistence/type-mapping.test.ts` to import `createTestAsset` directly.

### A4. Fix `sizeBytes` type: `Int` → `BigInt`

**Prisma schema** (`packages/db/prisma/schema.prisma`): Change `sizeBytes Int` to `sizeBytes BigInt` in the `Asset` model.

**Prisma migration**: Run `prisma migrate dev --name asset-size-bytes-bigint`.

**Cascade updates**:
- `packages/domain/src/entities/asset.ts` — `sizeBytes` field type: `number` → `bigint`
- `packages/domain/src/use-cases/upload-asset.ts` — `bytes.length` cast to `BigInt(bytes.length)` when constructing the Asset entity
- `packages/infrastructure/src/persistence/prisma-asset.repository.ts` — map `BigInt` ↔ `number` in type conversions
- `packages/infrastructure/tests/helpers/test-data.ts` — `createTestAsset` `sizeBytes` default: `BigInt(1024)`
- `packages/domain/tests/use-cases/upload-asset.test.ts` — any assertions on `sizeBytes` use `BigInt`

### A5. Fix `getEntry` in `fs-entry-walker.ts`

**Change** in `apps/web/src/lib/fs-entry-walker.ts`: Replace the explicit `typeof` check with a typed extension cast:

```typescript
function getEntry(item: DataTransferItem): FileSystemEntry | null {
  const extItem = item as DataTransferItem & { getAsEntry?: () => FileSystemEntry | null };
  return extItem.getAsEntry?.() ?? item.webkitGetAsEntry?.() ?? null;
}
```

**Rationale**: `getAsEntry` is the standards-track API (not yet in TypeScript's DOM lib). The optional-chaining on a properly typed cast is cleaner than `'getAsEntry' in item && typeof item.getAsEntry === 'function'`.

### A6. Fix `@ts-expect-error SharedWorkerGlobalScope`

**Change** in `apps/web/src/workers/file-tree-events.worker.ts`: Add a `declare const self` before the event listener and remove the `@ts-expect-error` comment:

```typescript
declare const self: SharedWorkerGlobalScope;
self.addEventListener('connect', (connectEvent: MessageEvent) => {
```

**Rationale**: SharedWorker files need `SharedWorkerGlobalScope` for `self`, but TypeScript's `lib.webworker.d.ts` types `self` as `DedicatedWorkerGlobalScope`. A declaration is the clean fix.

---

## Category B — Code Quality

### B1. Split `file-tree.ts` route handler

**Current**: `apps/api/src/routes/projects/file-tree.ts` — ~168 lines with 3 endpoints mixed together.

**New structure**:

| File | Responsibility | Approx lines |
|------|---------------|-------------|
| `apps/api/src/routes/projects/file-tree.ts` | Thin router — registers 3 sub-route files | ~15 |
| `apps/api/src/routes/projects/file-tree-create.ts` | POST `/projects/:projectId/files` | ~45 |
| `apps/api/src/routes/projects/file-tree-delete.ts` | DELETE `/projects/:projectId/files/:fileNodeId` | ~40 |
| `apps/api/src/routes/projects/file-tree-patch.ts` | PATCH `/projects/:projectId/files/:fileNodeId` | ~95 |

No behavioural changes. Tests in `apps/api/tests/routes/` continue to work unchanged because the router registration entry point is the same.

### B2. Update `architecture_constitution.md` and `tasks-template.md`

Reflect:
- The new `packages/domain/src/ports/` directory (replaces `repositories/` and `storage/`)
- Use-cases subfolder structure
- In-memory test fakes now live in `packages/domain/tests/ports/`

---

## Category C — Structural Reorganization

### C1. Reorganize `use-cases/` into subfolders

**New structure** under `packages/domain/src/use-cases/`:

```
use-cases/
  index.ts               ← re-exports all use-cases (unchanged public API)
  auth/
    login.ts
    register-user.ts
    change-password.ts
    verify-email.ts
    request-password-reset.ts
    reset-password.ts
    update-display-name.ts
    resend-verification-email.ts
    confirm-email-change.ts
    request-email-change.ts
    accept-user-invitation.ts
    invite-user.ts
    send-user-invitation.ts
    remove-user.ts
    list-users.ts
  project/
    create-project.ts
    list-user-projects.ts
    archive-project.ts
    restore-project.ts
    update-project.ts
    delete-project.ts
  file-tree/
    create-file.ts
    create-folder.ts
    delete-file.ts
    move-file.ts
    rename-file.ts
    get-project-tree.ts
  content/
    get-document-content.ts
    save-document-content.ts
    get-asset-content.ts
    upload-asset.ts
  settings/
    check-system-setup.ts
    get-open-registration.ts
    set-open-registration.ts
    admin-max-upload-size.ts
    get-key-bindings.ts
    reset-key-binding.ts
    update-key-binding.ts
    set-admin-status.ts
  members/
    change-member-role.ts
    remove-member.ts
```

**Tests mirror source**: `packages/domain/tests/use-cases/auth/`, `.../project/`, `.../file-tree/`, `.../content/`, `.../settings/`, `.../members/`.

**Key constraint**: The top-level `index.ts` re-exports everything. All consumers (`apps/api/src/`, etc.) import from `@asciidocollab/domain` — no path changes outside the package.

### C2. Merge `repositories/` + `storage/` → `ports/`

**Rationale**: Both directories hold port interfaces (dependency injection contracts). A single `ports/` directory makes the architectural intent explicit.

**New domain structure** under `packages/domain/src/ports/`:

```
ports/
  index.ts               ← re-exports everything (replaces repositories/index.ts + storage/index.ts)
  user/
    user.repository.ts
    session.repository.ts
    key-binding.repository.ts
    user-invitation.repository.ts
  project/
    project.repository.ts
    project-member.repository.ts
    template.repository.ts
    git-repository.repository.ts
  file-tree/
    file-node.repository.ts
    document.repository.ts
    asset.repository.ts
  storage/
    project-file-store.ts
    yjs-state-store.ts
  auth-tokens/
    email-change-token.repository.ts
    email-verification-token.repository.ts
    password-reset-token.repository.ts
  admin/
    audit-log.repository.ts
    system-setting.repository.ts
```

**Domain test fakes** move from `packages/domain/tests/repositories/` + `packages/domain/tests/storage/` to `packages/domain/tests/ports/` with the same subfolder structure (including a `tests/ports/storage/` subfolder for the in-memory fakes).

**Infrastructure persistence** gets matching subfolders under `packages/infrastructure/src/persistence/`:

```
persistence/
  index.ts               ← re-exports all Prisma repos
  user/
    prisma-user.repository.ts
    prisma-session.repository.ts
    prisma-key-binding.repository.ts
    prisma-user-invitation.repository.ts
  project/
    prisma-project.repository.ts
    prisma-project-member.repository.ts
    prisma-template.repository.ts
    prisma-git-repository.repository.ts
  file-tree/
    prisma-file-node.repository.ts
    prisma-document.repository.ts
    prisma-asset.repository.ts
  storage/
    filesystem-project-file-store.ts   ← moved from infrastructure/src/storage/
    filesystem-yjs-state-store.ts      ← moved from infrastructure/src/storage/
  auth-tokens/
    prisma-email-change-token.repository.ts
    prisma-email-verification-token.repository.ts
    prisma-password-reset-token.repository.ts
  admin/
    prisma-audit-log.repository.ts
    prisma-system-setting.repository.ts
```

Infrastructure test files in `packages/infrastructure/tests/persistence/` and `packages/infrastructure/tests/storage/` also reorganize to mirror the above (including a `tests/persistence/storage/` subfolder).

**The `packages/infrastructure/src/storage/` directory is deleted** after its files move to `persistence/storage/`.

**Key constraint**: `packages/infrastructure/src/index.ts` re-exports everything from `persistence/`. No consumer changes needed outside the package.

---

## Error Handling

No new error types introduced. The BigInt change affects the `sizeBytes` field in entity construction — callers already pass `bytes.length` (a number) which becomes `BigInt(bytes.length)`.

## Testing

- All moves are mechanical refactors with no logic changes. Existing tests cover all affected code.
- The BigInt migration requires updating 3–5 test assertions.
- The empty-file removal deletes 1 test case and 1 route branch test.
- The image alias removal deletes 1 test file entirely.

## Implementation Order

1. **A-group** (independent cleanups): can be done in parallel or any order
2. **B1** (file-tree split): after A-group, before C
3. **C1** (use-cases reorg): independent of C2, can run in parallel
4. **C2** (ports reorg): independent of C1, can run in parallel
5. **B2** (docs update): after C1 and C2 complete
6. Quality gates: `pnpm test && pnpm typecheck && pnpm lint`
