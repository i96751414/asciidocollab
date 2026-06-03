# Codebase Cleanup and Reorganization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply 11 targeted improvements: remove dead code, fix types, improve code structure, and reorganize the domain layer.

**Architecture:** Independent cleanups first (Tasks 1-6), then structural reorganization (Tasks 7-10) in dependency order: ports/ rename before use-cases subfolder (so import paths are computed correctly).

**Tech Stack:** TypeScript, Prisma (migration for BigInt), Jest.

---

## Task 1: Allow empty file uploads + fix Asset entity invariant

**Context:** The `bytes.length === 0` guard in `upload-asset.ts` (lines 66-68) rejects zero-byte files, but an AsciiDoc document that is yet to be filled is a valid upload target. The Asset entity invariant also rejects `sizeBytes === 0`. Both must be relaxed.

### Step 1.1: Remove empty-file guard from use case

File: `packages/domain/src/use-cases/upload-asset.ts`

Delete lines 66-68:
```typescript
    if (bytes.length === 0) {
      return { success: false, error: new ValidationError('File must not be empty') };
    }
```

After removal, the logic flows directly from the MIME-type check to the system-setting limit check.

### Step 1.2: Fix Asset entity invariant

File: `packages/domain/src/entities/asset.ts`

Change the class-level JSDoc from:
```typescript
 * @invariant `sizeBytes` must be greater than 0.
```
to:
```typescript
 * @invariant `sizeBytes` must be >= 0 (zero-byte files are permitted).
```

Change the constructor JSDoc from:
```typescript
   * @throws {Error} If `sizeBytes` is not greater than 0.
```
to:
```typescript
   * @throws {Error} If `sizeBytes` is negative.
```

Change the field comment from:
```typescript
    /** File size in bytes. Must be > 0. */
    public readonly sizeBytes: number,
```
to:
```typescript
    /** File size in bytes. Must be >= 0. */
    public readonly sizeBytes: number,
```

Change the invariant check from:
```typescript
    if (this.sizeBytes <= 0) {
      throw new Error('Asset sizeBytes must be > 0');
    }
```
to:
```typescript
    if (this.sizeBytes < 0) {
      throw new Error('Asset sizeBytes must be >= 0');
    }
```

### Step 1.3: Remove empty-file branch from API route

File: `apps/api/src/routes/projects/assets.ts`

Delete lines 61-63:
```typescript
          if (result.error.message.includes('File must not be empty')) {
            return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: result.error.message } });
          }
```

After removal, the `ValidationError` block is:
```typescript
        if (result.error instanceof ValidationError) {
          if (result.error.message.includes('MIME type')) {
            return reply.status(415).send({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: result.error.message } });
          }
          return reply.status(413).send({ error: { code: 'FILE_TOO_LARGE', message: 'File exceeds maximum permitted size' } });
        }
```

### Step 1.4: Remove test coverage for deleted code

File: `apps/api/tests/routes/assets-validation.test.ts`

Delete the entire `describe('assets route — ValidationError branching', ...)` block (lines 51-81). The two tests that assert on the source text for `'File must not be empty'` and `status(400)` no longer have meaning once the branch is deleted.

The remaining file keeps only:
1. The `buildAssetsTestServer` helper function (lines 11-25)
2. The `describe('assets route — runtime validation', ...)` block (lines 27-48, the `'returns 400 when parentId query param is missing'` test)
3. The third test inside `ValidationError branching`, `'route validates parentId presence before passing to FileNodeId.create'` (lines 69-80) — move it into the `runtime validation` describe block since it tests structural source properties, not the empty-file branch.

The resulting file:
```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';
import { assetsRoutes } from '../../src/routes/projects/assets';

jest.mock('../../src/plugins/require-auth', () => ({
  requireAuth: jest.fn((_req: unknown, _reply: unknown, done: () => void) => done()),
  getAuthenticatedUserId: jest.fn(() => '550e8400-e29b-41d4-a716-446655440001'),
}));

async function buildAssetsTestServer() {
  const app = Fastify();
  app.decorate('repos', {
    projectMember: { findByCompositeKey: jest.fn().mockResolvedValue({ role: { value: 'editor' } }) },
    fileNode: { findById: jest.fn().mockResolvedValue(null) },
    asset: { findById: jest.fn().mockResolvedValue(null), save: jest.fn(), findByProjectId: jest.fn().mockResolvedValue([]) },
    systemSetting: { get: jest.fn().mockResolvedValue(null) },
  } as never);
  app.decorate('stores', { fileStore: {} } as never);
  app.decorate('config', { storage: { maxUploadSizeBytes: 20_971_520 } } as never);
  app.decorate('fileTreeEventBus', { emit: jest.fn() } as never);
  await app.register(assetsRoutes);
  await app.ready();
  return app;
}

describe('assets route — runtime validation', () => {
  it('returns 400 when parentId query param is missing', async () => {
    const app = await buildAssetsTestServer();
    const response = await app.inject({
      method: 'POST',
      url: '/projects/770e8400-e29b-41d4-a716-446655440003/assets',
      headers: { 'content-type': 'multipart/form-data; boundary=boundary' },
      payload: [
        '--boundary',
        'Content-Disposition: form-data; name="file"; filename="test.png"',
        'Content-Type: image/png',
        '',
        'hello',
        '--boundary--',
      ].join('\r\n'),
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    await app.close();
  });

  it('route validates parentId presence before passing to FileNodeId.create', () => {
    const source = readFileSync(
      join(__dirname, '../../src/routes/projects/assets.ts'),
      'utf8',
    );
    const hasGuard =
      source.includes("if (!request.query.parentId)") ||
      source.includes('if (!parentId)') ||
      source.includes('parentId == null') ||
      source.includes('parentId === undefined') ||
      source.includes("required: ['parentId']") ||
      source.includes('required: ["parentId"]');
    expect(hasGuard).toBe(true);
  });
});
```

### Step 1.5: Remove test from domain use-case test file

File: `packages/domain/tests/use-cases/upload-asset.test.ts`

Delete the entire test at lines 163-176:
```typescript
  it('returns ValidationError when bytes is empty (zero-byte file)', async () => {
    const result = await useCase.execute(
      actorId,
      projectId,
      rootFolderId,
      'empty.png',
      MimeType.create('image/png'),
      Buffer.alloc(0),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ValidationError);
    }
  });
```

### Step 1.6: Run tests

```bash
pnpm --filter @asciidocollab/domain jest -- --testPathPattern="upload-asset" --no-coverage 2>&1 | tail -5
pnpm --filter @asciidocollab/api jest -- --testPathPattern="assets-validation" --no-coverage 2>&1 | tail -5
```

### Commit

```
git commit -m "feat(domain): allow empty file uploads — AsciiDoc files may be initially empty"
```

---

## Task 2: Remove dead code getAssetUrl

**Context:** `getAssetUrl` is defined in `apps/web/src/lib/api/assets.ts` (lines 49-52 with JSDoc on line 49) but is never called anywhere in the codebase.

### Step 2.1: Delete the function

File: `apps/web/src/lib/api/assets.ts`

Delete lines 49-52:
```typescript
/** Returns the URL to retrieve an asset. */
export function getAssetUrl(projectId: string, assetId: string): string {
  return `${API_BASE_URL}/projects/${projectId}/assets/${assetId}`;
}
```

The file should now end at line 47 (`}`), which closes the `toUploadRequest` function.

### Step 2.2: Verify no call sites

```bash
grep -rn "getAssetUrl" /home/joao/Development/asciidocollab/apps/ /home/joao/Development/asciidocollab/packages/ 2>/dev/null
```

Expected: no output (or only the deleted line in git diff).

### Commit

```
git commit -m "chore(web): remove unused getAssetUrl function"
```

---

## Task 3: Remove image aliases

**Context:** The `Image`/`ImageId` types were renamed to `Asset`/`AssetId` in a previous refactor. Legacy re-export shims remain as files. All must be deleted. The infrastructure test file `type-mapping.test.ts` still imports `PrismaAssetRepository as PrismaImageRepository` and calls `createTestAsset as createTestImage` — these aliases must be removed.

### Step 3.1: Delete legacy alias files

Run:
```bash
rm packages/domain/src/entities/image.ts
rm packages/domain/src/value-objects/image-id.ts
rm packages/domain/src/repositories/image.repository.ts
rm packages/domain/tests/entities/image.test.ts
rm packages/domain/tests/repositories/in-memory-image.repository.ts
rm packages/infrastructure/src/persistence/prisma-image.repository.ts
rm apps/api/src/routes/projects/images.ts
rm apps/api/tests/routes/images-multipart-limit.test.ts
```

Or equivalently using git:
```bash
git rm packages/domain/src/entities/image.ts
git rm packages/domain/src/value-objects/image-id.ts
git rm packages/domain/src/repositories/image.repository.ts
git rm packages/domain/tests/entities/image.test.ts
git rm packages/domain/tests/repositories/in-memory-image.repository.ts
git rm packages/infrastructure/src/persistence/prisma-image.repository.ts
git rm apps/api/src/routes/projects/images.ts
git rm apps/api/tests/routes/images-multipart-limit.test.ts
```

### Step 3.2: Verify barrel indexes

Check whether `image.ts` and `image-id.ts` were exported from any barrel. The spec notes that the barrel indexes for `packages/domain/src/entities/index.ts` and `packages/domain/src/value-objects/index.ts` may reference them.

```bash
grep -n "image" packages/domain/src/entities/index.ts packages/domain/src/value-objects/index.ts packages/domain/src/repositories/index.ts packages/infrastructure/src/index.ts 2>/dev/null
```

Remove any lines that export from `image.ts`, `image-id.ts`, `image.repository.ts`, or `prisma-image.repository.ts`. Based on the repository index read during planning, `image.repository.ts` is NOT in `packages/domain/src/repositories/index.ts` (the current barrel only exports `AssetRepository`), and `prisma-image.repository.ts` is NOT in `packages/infrastructure/src/index.ts`. Verify with the grep above and remove any hits found.

### Step 3.3: Remove createTestImage alias from infrastructure test-data

File: `packages/infrastructure/tests/helpers/test-data.ts`

Delete line 90:
```typescript
/** @deprecated Use createTestAsset instead. */
export const createTestImage = createTestAsset;
```

### Step 3.4: Update type-mapping.test.ts

File: `packages/infrastructure/tests/persistence/type-mapping.test.ts`

Change line 3 — replace the aliased import:
```typescript
// OLD
import { createTestUser, createTestProject, createTestProjectMember, createTestFileNode, createTestDocument, createTestAsset as createTestImage, createTestTemplate, createTestGitRepository, createTestAuditLog } from '../helpers/test-data';
```
```typescript
// NEW
import { createTestUser, createTestProject, createTestProjectMember, createTestFileNode, createTestDocument, createTestAsset, createTestTemplate, createTestGitRepository, createTestAuditLog } from '../helpers/test-data';
```

Change line 9 — remove the alias on the repository import:
```typescript
// OLD
import { PrismaAssetRepository as PrismaImageRepository } from '../../src/persistence/prisma-asset.repository';
```
```typescript
// NEW
import { PrismaAssetRepository } from '../../src/persistence/prisma-asset.repository';
```

Change line 23 — rename the variable declaration:
```typescript
// OLD
  let imageRepo: PrismaImageRepository;
```
```typescript
// NEW
  let assetRepo: PrismaAssetRepository;
```

Change line 36 — rename the initialization:
```typescript
// OLD
    imageRepo = new PrismaImageRepository(client);
```
```typescript
// NEW
    assetRepo = new PrismaAssetRepository(client);
```

In the `describe('Asset', ...)` block (lines 203-226), replace all `createTestImage` calls with `createTestAsset` and all `imageRepo` references with `assetRepo`:

```typescript
  describe('Asset', () => {
    it('should round-trip with version chain (parentId)', async () => {
      const owner = createTestUser();
      await userRepo.save(owner);
      const project = createTestProject();
      await projectRepo.save(project);

      const original = createTestAsset(project.id, { sizeBytes: 1024 });
      await assetRepo.save(original);
      const version = createTestAsset(project.id, {
        parentId: original.id,
        sizeBytes: 2048,
      });
      await assetRepo.save(version);
      const foundOriginal = await assetRepo.findById(original.id);
      const foundVersion = await assetRepo.findById(version.id);
      expect(foundOriginal).not.toBeNull();
      expect(foundOriginal!.sizeBytes).toBe(1024);
      expect(foundOriginal!.parentId).toBeNull();
      expect(foundVersion).not.toBeNull();
      expect(foundVersion!.sizeBytes).toBe(2048);
      expect(foundVersion!.parentId!.value).toBe(original.id.value);
    });
  });
```

### Step 3.5: Run tests

```bash
pnpm --filter @asciidocollab/domain jest --no-coverage 2>&1 | tail -5
pnpm --filter @asciidocollab/infrastructure jest -- --testPathPattern="type-mapping" --no-coverage 2>&1 | tail -5
```

### Commit

```
git commit -m "chore(domain): remove Image/ImageId aliases — only Asset terminology remains"
```

---

## Task 4: Fix sizeBytes Int → BigInt

**Context:** `sizeBytes Int` in Prisma is a 32-bit signed integer, which overflows for files larger than ~2 GB. The correct type is `BigInt`. This cascades to the domain entity, use case, and Prisma repository mapper. Note: Task 4 must be done after Task 1 (which already loosened the invariant to `>= 0`) but before Task 7 (which moves the entity and use case files).

### Step 4.1: Update Prisma schema

File: `packages/db/prisma/schema.prisma` line 121

Change:
```prisma
  sizeBytes   Int
```
to:
```prisma
  sizeBytes   BigInt
```

### Step 4.2: Run migration

```bash
pnpm --filter @asciidocollab/db prisma migrate dev --name asset-size-bytes-bigint
```

This creates a new migration file under `packages/db/prisma/migrations/`.

### Step 4.3: Update Asset entity

File: `packages/domain/src/entities/asset.ts`

Change `sizeBytes` constructor parameter type from `number` to `bigint`:
```typescript
    /** File size in bytes. Must be >= 0. */
    public readonly sizeBytes: bigint,
```

Change the invariant check to use bigint literal:
```typescript
    if (this.sizeBytes < 0n) {
      throw new Error('Asset sizeBytes must be >= 0');
    }
```

Full updated constructor signature (after Tasks 1+4):
```typescript
  constructor(
    public readonly id: AssetId,
    public readonly projectId: ProjectId,
    public readonly filename: string,
    public readonly storagePath: string,
    public readonly mimeType: MimeType,
    /** File size in bytes. Must be >= 0. */
    public readonly sizeBytes: bigint,
    public readonly parentId: AssetId | null,
    public readonly uploadedAt: Date = new Date(),
    public readonly updatedAt: Date | null = null,
  ) {
    if (this.sizeBytes < 0n) {
      throw new Error('Asset sizeBytes must be >= 0');
    }
  }
```

### Step 4.4: Update upload-asset.ts use case

File: `packages/domain/src/use-cases/upload-asset.ts` line 98

Change:
```typescript
      const asset = new Asset(assetId, projectId, filename, storagePath, mimeType, bytes.length, null);
```
to:
```typescript
      const asset = new Asset(assetId, projectId, filename, storagePath, mimeType, BigInt(bytes.length), null);
```

### Step 4.5: Update Prisma asset repository

File: `packages/infrastructure/src/persistence/prisma-asset.repository.ts`

Change the `AssetRecord` type (lines 56-60):
```typescript
// OLD
type AssetRecord = {
  id: string; projectId: string; filename: string; storagePath: string;
  mimeType: string; sizeBytes: number; parentId: string | null;
  uploadedAt: Date; updatedAt: Date | null;
};
```
```typescript
// NEW
type AssetRecord = {
  id: string; projectId: string; filename: string; storagePath: string;
  mimeType: string; sizeBytes: bigint; parentId: string | null;
  uploadedAt: Date; updatedAt: Date | null;
};
```

The `toDomainAsset` and `toPersistenceAsset` functions need no further changes — Prisma automatically returns `bigint` for `BigInt` fields, and the domain entity now accepts `bigint`, so the mapping is type-correct as-is.

### Step 4.6: Update infrastructure test-data helper

File: `packages/infrastructure/tests/helpers/test-data.ts`

In the `createTestAsset` function, change `sizeBytes` override type and default:
```typescript
// OLD
export function createTestAsset(projectId: ProjectId, overrides?: { id?: AssetId; filename?: string; storagePath?: string; mimeType?: MimeType; sizeBytes?: number; parentId?: AssetId | null; uploadedAt?: Date; updatedAt?: Date | null }): Asset {
  return new Asset(
    overrides?.id ?? AssetId.create(randomUUID()),
    projectId,
    overrides?.filename ?? 'test-asset.png',
    overrides?.storagePath ?? '/assets/test-asset.png',
    overrides?.mimeType ?? MimeType.create('image/png'),
    overrides?.sizeBytes ?? 1024,
    overrides?.parentId ?? null,
    overrides?.uploadedAt ?? new Date(),
    overrides?.updatedAt ?? null,
  );
}
```
```typescript
// NEW
export function createTestAsset(projectId: ProjectId, overrides?: { id?: AssetId; filename?: string; storagePath?: string; mimeType?: MimeType; sizeBytes?: bigint; parentId?: AssetId | null; uploadedAt?: Date; updatedAt?: Date | null }): Asset {
  return new Asset(
    overrides?.id ?? AssetId.create(randomUUID()),
    projectId,
    overrides?.filename ?? 'test-asset.png',
    overrides?.storagePath ?? '/assets/test-asset.png',
    overrides?.mimeType ?? MimeType.create('image/png'),
    overrides?.sizeBytes ?? 1024n,
    overrides?.parentId ?? null,
    overrides?.uploadedAt ?? new Date(),
    overrides?.updatedAt ?? null,
  );
}
```

### Step 4.7: Update type-mapping.test.ts assertions

File: `packages/infrastructure/tests/persistence/type-mapping.test.ts`

In the `describe('Asset', ...)` block (after Task 3 renames), the assertions `expect(foundOriginal!.sizeBytes).toBe(1024)` and `expect(foundVersion!.sizeBytes).toBe(2048)` must use bigint:

```typescript
      const original = createTestAsset(project.id, { sizeBytes: 1024n });
      // ...
      const version = createTestAsset(project.id, {
        parentId: original.id,
        sizeBytes: 2048n,
      });
      // ...
      expect(foundOriginal!.sizeBytes).toBe(1024n);
      // ...
      expect(foundVersion!.sizeBytes).toBe(2048n);
```

### Step 4.8: Check upload-asset.test.ts for sizeBytes assertions

File: `packages/domain/tests/use-cases/upload-asset.test.ts`

Scan the file for any direct `sizeBytes` assertion. Based on the current file content (read during planning), there are no explicit `sizeBytes` assertions — the test only checks `result.success` and error types. No changes needed.

### Step 4.9: Run tests

```bash
pnpm --filter @asciidocollab/domain jest --no-coverage 2>&1 | tail -5
pnpm --filter @asciidocollab/infrastructure jest --no-coverage 2>&1 | tail -5
pnpm typecheck 2>&1 | grep -i "asset\|sizebytes" | head -10
```

### Commit

```
git commit -m "fix(db): change Asset.sizeBytes from Int to BigInt to support files larger than 2 GB"
```

---

## Task 5: Fix getEntry and SharedWorkerGlobalScope

Two independent TypeScript fixes in the web app.

### Fix A: getEntry in fs-entry-walker.ts

File: `apps/web/src/lib/fs-entry-walker.ts`

Replace lines 33-39 (the `getEntry` function):
```typescript
// OLD
function getEntry(item: DataTransferItem): FileSystemEntry | null {
  // Use unprefixed getAsEntry first (standards), then webkit-prefixed for Safari
  if ('getAsEntry' in item && typeof item.getAsEntry === 'function') {
    return item.getAsEntry() ?? null;
  }
  return item.webkitGetAsEntry?.() ?? null;
}
```
```typescript
// NEW
function getEntry(item: DataTransferItem): FileSystemEntry | null {
  const extItem = item as DataTransferItem & { getAsEntry?: () => FileSystemEntry | null };
  return extItem.getAsEntry?.() ?? item.webkitGetAsEntry?.() ?? null;
}
```

The typed-extension cast replaces the `'getAsEntry' in item` runtime guard. `getAsEntry` is the standards-track API not yet in TypeScript's DOM lib; optional chaining on the cast is cleaner.

### Fix B: SharedWorkerGlobalScope in file-tree-events.worker.ts

File: `apps/web/src/workers/file-tree-events.worker.ts`

Replace lines 42-43:
```typescript
// OLD
// @ts-expect-error SharedWorkerGlobalScope
self.addEventListener('connect', (connectEvent: MessageEvent) => {
```
```typescript
// NEW
declare const self: SharedWorkerGlobalScope;
self.addEventListener('connect', (connectEvent: MessageEvent) => {
```

The `declare const` gives TypeScript the correct type for `self` in a SharedWorker context without suppressing errors.

### Step 5.3: Verify

```bash
pnpm typecheck 2>&1 | grep -i "worker\|fs-entry" | head -10
```

Expected: no errors for these files.

### Commit

```
git commit -m "fix(web): use typed cast for getEntry and declare SharedWorkerGlobalScope"
```

---

## Task 6: Split file-tree.ts into focused handlers

**Context:** `apps/api/src/routes/projects/file-tree.ts` is ~214 lines with three endpoints and a shared error handler all mixed together. Split into 5 focused files with no behavioral changes.

### Step 6.1: Create file-tree-errors.ts

Create `apps/api/src/routes/projects/file-tree-errors.ts`:

```typescript
import type { FastifyReply } from 'fastify';
import {
  PermissionDeniedError,
  FileConflictError,
  FileNodeNotFoundError,
  CannotDeleteRootFolderError,
} from '@asciidocollab/domain';

export function toNodeType(value: string): 'file' | 'folder' {
  return value === 'folder' ? 'folder' : 'file';
}

export function sendFileTreeError(reply: FastifyReply, error: Error) {
  if (error instanceof PermissionDeniedError) {
    return reply.status(403).send({ error: { code: 'FORBIDDEN', message: error.message } });
  }
  if (error instanceof FileConflictError) {
    const body: Record<string, unknown> = { error: { code: 'CONFLICT', message: error.message } };
    if (error.existingId) body['existingFileNodeId'] = error.existingId;
    return reply.status(409).send(body);
  }
  if (error instanceof FileNodeNotFoundError) {
    return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'File not found' } });
  }
  if (error instanceof CannotDeleteRootFolderError) {
    return reply.status(400).send({ error: { code: 'CANNOT_DELETE_ROOT', message: error.message } });
  }
  return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
}
```

### Step 6.2: Create file-tree-create.ts

Create `apps/api/src/routes/projects/file-tree-create.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import {
  CreateFileUseCase,
  CreateFolderUseCase,
  UserId,
  ProjectId,
  FileNodeId,
  MimeType,
} from '@asciidocollab/domain';
import type { FileTreeEventDto } from '@asciidocollab/shared';
import { getAuthenticatedUserId } from '../../plugins/require-auth';
import { sendFileTreeError } from './file-tree-errors';

type CreateBody = { type: 'file' | 'folder'; parentId: string; name: string; mimeType?: string };

/** Registers POST /projects/:projectId/files */
export async function fileTreeCreateRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { projectId: string }; Body: CreateBody }>(
    '/projects/:projectId/files',
    {
      schema: {
        body: {
          type: 'object',
          required: ['type', 'parentId', 'name'],
          properties: {
            type: { type: 'string', enum: ['file', 'folder'] },
            parentId: { type: 'string' },
            name: { type: 'string' },
            mimeType: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const actorId = UserId.create(getAuthenticatedUserId(request));
      const projectId = ProjectId.create(request.params.projectId);
      const { type, parentId, name, mimeType } = request.body;
      const parentFileNodeId = FileNodeId.create(parentId);

      if (type === 'folder') {
        const useCase = new CreateFolderUseCase(
          request.server.repos.projectMember,
          request.server.repos.fileNode,
          request.server.stores.fileStore,
        );
        const result = await useCase.execute(actorId, projectId, parentFileNodeId, name);

        if (!result.success) return sendFileTreeError(reply, result.error);
        const event: FileTreeEventDto = { type: 'created', fileNodeId: result.value.fileNodeId.value, nodeType: 'folder', name, path: result.value.path.value, parentId: parentId };
        request.server.fileTreeEventBus.emit(projectId.value, event);
        return reply.status(201).send({ fileNodeId: result.value.fileNodeId.value, path: result.value.path.value });
      } else {
        const mime = MimeType.create(mimeType ?? 'text/asciidoc');
        const useCase = new CreateFileUseCase(
          request.server.repos.projectMember,
          request.server.repos.fileNode,
          request.server.repos.document,
          request.server.stores.fileStore,
        );
        const result = await useCase.execute(actorId, projectId, parentFileNodeId, name, mime, Buffer.alloc(0));

        if (!result.success) return sendFileTreeError(reply, result.error);
        const event: FileTreeEventDto = { type: 'created', fileNodeId: result.value.fileNodeId.value, nodeType: 'file', name, path: result.value.path.value, parentId: parentId };
        request.server.fileTreeEventBus.emit(projectId.value, event);
        return reply.status(201).send({ fileNodeId: result.value.fileNodeId.value, path: result.value.path.value });
      }
    },
  );
}
```

### Step 6.3: Create file-tree-delete.ts

Create `apps/api/src/routes/projects/file-tree-delete.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import {
  DeleteFileUseCase,
  UserId,
  ProjectId,
  FileNodeId,
} from '@asciidocollab/domain';
import type { FileTreeEventDto } from '@asciidocollab/shared';
import { getAuthenticatedUserId } from '../../plugins/require-auth';
import { sendFileTreeError, toNodeType } from './file-tree-errors';

/** Registers DELETE /projects/:projectId/files/:fileNodeId */
export async function fileTreeDeleteRoutes(app: FastifyInstance): Promise<void> {
  app.delete<{ Params: { projectId: string; fileNodeId: string } }>(
    '/projects/:projectId/files/:fileNodeId',
    async (request, reply) => {
      const actorId = UserId.create(getAuthenticatedUserId(request));
      const projectId = ProjectId.create(request.params.projectId);
      const fileNodeId = FileNodeId.create(request.params.fileNodeId);

      const useCase = new DeleteFileUseCase(
        request.server.repos.projectMember,
        request.server.repos.fileNode,
        request.server.repos.document,
        request.server.repos.auditLog,
        request.server.stores.fileStore,
        request.server.stores.yjsStateStore,
      );

      const fileNodeBeforeDelete = await request.server.repos.fileNode.findById(fileNodeId);
      const result = await useCase.execute(actorId, fileNodeId, projectId);
      if (!result.success) return sendFileTreeError(reply, result.error);
      if (fileNodeBeforeDelete) {
        const event: FileTreeEventDto = { type: 'deleted', fileNodeId: fileNodeId.value, nodeType: toNodeType(fileNodeBeforeDelete.type.value), name: fileNodeBeforeDelete.name, path: fileNodeBeforeDelete.path.value, parentId: fileNodeBeforeDelete.parentId?.value ?? null };
        request.server.fileTreeEventBus.emit(projectId.value, event);
      }
      return reply.status(204).send();
    },
  );
}
```

### Step 6.4: Create file-tree-patch.ts

Create `apps/api/src/routes/projects/file-tree-patch.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import {
  RenameFileUseCase,
  MoveFileUseCase,
  UserId,
  ProjectId,
  FileNodeId,
} from '@asciidocollab/domain';
import type { FileTreeEventDto } from '@asciidocollab/shared';
import { getAuthenticatedUserId } from '../../plugins/require-auth';
import { sendFileTreeError, toNodeType } from './file-tree-errors';

type PatchBody = { name?: string; parentId?: string };

/** Registers PATCH /projects/:projectId/files/:fileNodeId */
export async function fileTreePatchRoutes(app: FastifyInstance): Promise<void> {
  app.patch<{ Params: { projectId: string; fileNodeId: string }; Body: PatchBody }>(
    '/projects/:projectId/files/:fileNodeId',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            parentId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const actorId = UserId.create(getAuthenticatedUserId(request));
      const projectId = ProjectId.create(request.params.projectId);
      const fileNodeId = FileNodeId.create(request.params.fileNodeId);
      const { name, parentId } = request.body;

      if (name !== undefined && parentId !== undefined) {
        // Both rename and move
        const renameUseCase = new RenameFileUseCase(
          request.server.repos.projectMember,
          request.server.repos.fileNode,
          request.server.repos.auditLog,
          request.server.stores.fileStore,
        );
        const renameResult = await renameUseCase.execute(actorId, fileNodeId, name, projectId);
        if (!renameResult.success) return sendFileTreeError(reply, renameResult.error);

        const moveUseCase = new MoveFileUseCase(
          request.server.repos.projectMember,
          request.server.repos.fileNode,
          request.server.stores.fileStore,
        );
        const newParentId = FileNodeId.create(parentId);
        const moveResult = await moveUseCase.execute(actorId, projectId, fileNodeId, newParentId);
        if (!moveResult.success) return sendFileTreeError(reply, moveResult.error);

        const updatedNode = await request.server.repos.fileNode.findById(fileNodeId);
        if (updatedNode) {
          const event: FileTreeEventDto = {
            type: 'moved',
            fileNodeId: fileNodeId.value,
            nodeType: toNodeType(updatedNode.type.value),
            name,
            path: moveResult.value.newPath.value,
            parentId,
          };
          request.server.fileTreeEventBus.emit(projectId.value, event);
        }
        return reply.status(204).send();
      } else if (name !== undefined) {
        const useCase = new RenameFileUseCase(
          request.server.repos.projectMember,
          request.server.repos.fileNode,
          request.server.repos.auditLog,
          request.server.stores.fileStore,
        );
        const result = await useCase.execute(actorId, fileNodeId, name, projectId);
        if (!result.success) return sendFileTreeError(reply, result.error);
        const renamedNode = await request.server.repos.fileNode.findById(fileNodeId);
        if (renamedNode) {
          const event: FileTreeEventDto = { type: 'renamed', fileNodeId: fileNodeId.value, nodeType: toNodeType(renamedNode.type.value), name, path: result.value.newPath.value, parentId: renamedNode.parentId?.value ?? null };
          request.server.fileTreeEventBus.emit(projectId.value, event);
        }
        return reply.status(204).send();
      } else if (parentId !== undefined) {
        const useCase = new MoveFileUseCase(
          request.server.repos.projectMember,
          request.server.repos.fileNode,
          request.server.stores.fileStore,
        );
        const newParentId = FileNodeId.create(parentId);
        const result = await useCase.execute(actorId, projectId, fileNodeId, newParentId);
        if (!result.success) return sendFileTreeError(reply, result.error);
        const movedNode = await request.server.repos.fileNode.findById(fileNodeId);
        if (movedNode) {
          const event: FileTreeEventDto = { type: 'moved', fileNodeId: fileNodeId.value, nodeType: toNodeType(movedNode.type.value), name: movedNode.name, path: result.value.newPath.value, parentId: parentId };
          request.server.fileTreeEventBus.emit(projectId.value, event);
        }
        return reply.status(204).send();
      }

      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Provide name or parentId' } });
    },
  );
}
```

### Step 6.5: Replace file-tree.ts with thin router

Replace the entire content of `apps/api/src/routes/projects/file-tree.ts` with:

```typescript
import type { FastifyInstance } from 'fastify';
import { fileTreeCreateRoutes } from './file-tree-create';
import { fileTreeDeleteRoutes } from './file-tree-delete';
import { fileTreePatchRoutes } from './file-tree-patch';

/** Registers file tree CRUD routes under /projects/:projectId/files. */
export async function fileTreeRoutes(app: FastifyInstance): Promise<void> {
  await app.register(fileTreeCreateRoutes);
  await app.register(fileTreeDeleteRoutes);
  await app.register(fileTreePatchRoutes);
}
```

### Step 6.6: Run existing file-tree tests

```bash
pnpm --filter @asciidocollab/api jest -- --testPathPattern="file-tree" --no-coverage 2>&1 | tail -5
```

Expected: all existing file-tree tests pass (no behavioral change).

### Commit

```
git commit -m "refactor(api): split file-tree route handler into focused sub-files"
```

---

## Task 7: Create ports/ directory — rename repositories/ + storage/ in domain

**Context:** `packages/domain/src/repositories/` and `packages/domain/src/storage/` both hold port interfaces (dependency injection contracts). A single `ports/` directory with domain-grouped subfolders makes the architectural intent explicit. This is the most mechanical of all tasks — pure file moves and import path updates.

**Dependency order:** Task 7 must be complete before Task 8, so that the import paths computed in Task 8 (one directory deeper) are correct.

### Step 7.1: Create directory structure

```bash
mkdir -p packages/domain/src/ports/{user,project,file-tree,storage,auth-tokens,admin}
mkdir -p packages/domain/tests/ports/{user,project,file-tree,storage,auth-tokens,admin}
```

### Step 7.2: Move source port files

```bash
git mv packages/domain/src/repositories/asset.repository.ts           packages/domain/src/ports/file-tree/asset.repository.ts
git mv packages/domain/src/repositories/audit-log.repository.ts       packages/domain/src/ports/admin/audit-log.repository.ts
git mv packages/domain/src/repositories/document.repository.ts        packages/domain/src/ports/file-tree/document.repository.ts
git mv packages/domain/src/repositories/email-change-token.repository.ts    packages/domain/src/ports/auth-tokens/email-change-token.repository.ts
git mv packages/domain/src/repositories/email-verification-token.repository.ts  packages/domain/src/ports/auth-tokens/email-verification-token.repository.ts
git mv packages/domain/src/repositories/file-node.repository.ts       packages/domain/src/ports/file-tree/file-node.repository.ts
git mv packages/domain/src/repositories/git-repository.repository.ts  packages/domain/src/ports/project/git-repository.repository.ts
git mv packages/domain/src/repositories/key-binding.repository.ts     packages/domain/src/ports/user/key-binding.repository.ts
git mv packages/domain/src/repositories/password-reset-token.repository.ts  packages/domain/src/ports/auth-tokens/password-reset-token.repository.ts
git mv packages/domain/src/repositories/project-member.repository.ts  packages/domain/src/ports/project/project-member.repository.ts
git mv packages/domain/src/repositories/project.repository.ts         packages/domain/src/ports/project/project.repository.ts
git mv packages/domain/src/repositories/session.repository.ts         packages/domain/src/ports/user/session.repository.ts
git mv packages/domain/src/repositories/system-setting.repository.ts  packages/domain/src/ports/admin/system-setting.repository.ts
git mv packages/domain/src/repositories/template.repository.ts        packages/domain/src/ports/project/template.repository.ts
git mv packages/domain/src/repositories/user-invitation.repository.ts packages/domain/src/ports/user/user-invitation.repository.ts
git mv packages/domain/src/repositories/user.repository.ts            packages/domain/src/ports/user/user.repository.ts
git mv packages/domain/src/storage/project-file-store.ts              packages/domain/src/ports/storage/project-file-store.ts
git mv packages/domain/src/storage/yjs-state-store.ts                 packages/domain/src/ports/storage/yjs-state-store.ts
```

### Step 7.3: Move test fake files

```bash
git mv packages/domain/tests/repositories/in-memory-asset.repository.ts              packages/domain/tests/ports/file-tree/in-memory-asset.repository.ts
git mv packages/domain/tests/repositories/in-memory-audit-log.repository.ts          packages/domain/tests/ports/admin/in-memory-audit-log.repository.ts
git mv packages/domain/tests/repositories/in-memory-document.repository.ts           packages/domain/tests/ports/file-tree/in-memory-document.repository.ts
git mv packages/domain/tests/repositories/in-memory-email-change-token.repository.ts       packages/domain/tests/ports/auth-tokens/in-memory-email-change-token.repository.ts
git mv packages/domain/tests/repositories/in-memory-email-verification-token.repository.ts packages/domain/tests/ports/auth-tokens/in-memory-email-verification-token.repository.ts
git mv packages/domain/tests/repositories/in-memory-file-node.repository.ts          packages/domain/tests/ports/file-tree/in-memory-file-node.repository.ts
git mv packages/domain/tests/repositories/in-memory-git-repository.repository.ts     packages/domain/tests/ports/project/in-memory-git-repository.repository.ts
git mv packages/domain/tests/repositories/in-memory-key-binding.repository.ts        packages/domain/tests/ports/user/in-memory-key-binding.repository.ts
git mv packages/domain/tests/repositories/in-memory-password-reset-token.repository.ts     packages/domain/tests/ports/auth-tokens/in-memory-password-reset-token.repository.ts
git mv packages/domain/tests/repositories/in-memory-project-member.repository.ts     packages/domain/tests/ports/project/in-memory-project-member.repository.ts
git mv packages/domain/tests/repositories/in-memory-project.repository.ts            packages/domain/tests/ports/project/in-memory-project.repository.ts
git mv packages/domain/tests/repositories/in-memory-session.repository.ts            packages/domain/tests/ports/user/in-memory-session.repository.ts
git mv packages/domain/tests/repositories/in-memory-system-setting.repository.ts     packages/domain/tests/ports/admin/in-memory-system-setting.repository.ts
git mv packages/domain/tests/repositories/in-memory-template.repository.ts           packages/domain/tests/ports/project/in-memory-template.repository.ts
git mv packages/domain/tests/repositories/in-memory-user-invitation.repository.ts    packages/domain/tests/ports/user/in-memory-user-invitation.repository.ts
git mv packages/domain/tests/repositories/in-memory-user.repository.ts               packages/domain/tests/ports/user/in-memory-user.repository.ts
git mv packages/domain/tests/repositories/in-memory-repositories.test.ts             packages/domain/tests/ports/in-memory-repositories.test.ts
git mv packages/domain/tests/storage/in-memory-project-file-store.ts                 packages/domain/tests/ports/storage/in-memory-project-file-store.ts
git mv packages/domain/tests/storage/in-memory-yjs-state-store.ts                    packages/domain/tests/ports/storage/in-memory-yjs-state-store.ts
```

### Step 7.4: Update imports inside moved source port files

The repository interface files (`*.repository.ts`) import only from `../entities/`, `../value-objects/`, `../errors/`, and `../types/`. Since the files now live at `src/ports/subfolder/` (two levels deep from `src/`), these relative imports need to be updated from `../entities/xxx` to `../../entities/xxx`.

For example, `packages/domain/src/ports/project/project.repository.ts` previously had:
```typescript
import { Project } from '../entities/project';
import { ProjectId } from '../value-objects/project-id';
import { UserId } from '../value-objects/user-id';
```
and now needs:
```typescript
import { Project } from '../../entities/project';
import { ProjectId } from '../../value-objects/project-id';
import { UserId } from '../../value-objects/user-id';
```

Apply this `../` → `../../` prefix fix to every moved `*.repository.ts` file and both `project-file-store.ts` and `yjs-state-store.ts`. The storage files already import from `../value-objects/`, `../errors/`, and `../types/` — all become `../../value-objects/`, `../../errors/`, `../../types/`.

A fast way to apply all at once:
```bash
# For each moved port file, fix the relative import depth
find packages/domain/src/ports -name "*.ts" | xargs sed -i "s|from '\.\./entities/|from '../../entities/|g; s|from '\.\./value-objects/|from '../../value-objects/|g; s|from '\.\./errors/|from '../../errors/|g; s|from '\.\./types/|from '../../types/|g"
```

Verify no `'../` remain (excluding `'./` which are intra-subfolder imports):
```bash
grep -rn "from '\.\." packages/domain/src/ports/ | grep -v "from '\.\.\."
```
Expected: no output.

### Step 7.5: Update imports inside moved test fake files

Each moved `in-memory-*.repository.ts` was at `tests/repositories/` (2 levels from `tests/`) and imported using `'../../src/repositories/xxx'`. It now lives at `tests/ports/subfolder/` (3 levels from `tests/`) and must import using `'../../../src/ports/subfolder/xxx'`.

Example for `packages/domain/tests/ports/file-tree/in-memory-asset.repository.ts`:
```typescript
// OLD
import { Asset } from '../../src/entities/asset';
import { AssetId } from '../../src/value-objects/asset-id';
import { ProjectId } from '../../src/value-objects/project-id';
import { AssetRepository } from '../../src/repositories/asset.repository';
```
```typescript
// NEW
import { Asset } from '../../../src/entities/asset';
import { AssetId } from '../../../src/value-objects/asset-id';
import { ProjectId } from '../../../src/value-objects/project-id';
import { AssetRepository } from '../../../src/ports/file-tree/asset.repository';
```

The two-part pattern for all moved fakes:
1. Change `'../../src/entities/` → `'../../../src/entities/`
2. Change `'../../src/value-objects/` → `'../../../src/value-objects/`
3. Change `'../../src/repositories/xxx'` → `'../../../src/ports/SUBFOLDER/xxx'` where `SUBFOLDER` follows the mapping in Step 7.2
4. For storage fakes: `'../../src/storage/xxx'` → `'../../../src/ports/storage/xxx'`

Complete subfolder mapping for test fake imports:
```
in-memory-asset.repository          → ../../../src/ports/file-tree/asset.repository
in-memory-audit-log.repository      → ../../../src/ports/admin/audit-log.repository
in-memory-document.repository       → ../../../src/ports/file-tree/document.repository
in-memory-email-change-token.repository     → ../../../src/ports/auth-tokens/email-change-token.repository
in-memory-email-verification-token.repository → ../../../src/ports/auth-tokens/email-verification-token.repository
in-memory-file-node.repository      → ../../../src/ports/file-tree/file-node.repository
in-memory-git-repository.repository → ../../../src/ports/project/git-repository.repository
in-memory-key-binding.repository    → ../../../src/ports/user/key-binding.repository
in-memory-password-reset-token.repository   → ../../../src/ports/auth-tokens/password-reset-token.repository
in-memory-project-member.repository → ../../../src/ports/project/project-member.repository
in-memory-project.repository        → ../../../src/ports/project/project.repository
in-memory-session.repository        → ../../../src/ports/user/session.repository
in-memory-system-setting.repository → ../../../src/ports/admin/system-setting.repository
in-memory-template.repository       → ../../../src/ports/project/template.repository
in-memory-user-invitation.repository → ../../../src/ports/user/user-invitation.repository
in-memory-user.repository           → ../../../src/ports/user/user.repository
in-memory-project-file-store        → ../../../src/ports/storage/project-file-store
in-memory-yjs-state-store           → ../../../src/ports/storage/yjs-state-store
```

Also update `packages/domain/tests/ports/in-memory-repositories.test.ts` — it was `tests/repositories/in-memory-repositories.test.ts` and its imports of the fakes all need the same depth adjustment.

### Step 7.6: Create barrel files

Create `packages/domain/src/ports/index.ts`:

```typescript
/** @file Barrel re-exports for all domain port interfaces. */

// user/
export { UserRepository } from './user/user.repository';
export { SessionRepository } from './user/session.repository';
export { KeyBindingRepository } from './user/key-binding.repository';
export { UserInvitationRepository } from './user/user-invitation.repository';

// project/
export { ProjectRepository, PaginationParameters, PaginatedProjects } from './project/project.repository';
export { ProjectMemberRepository } from './project/project-member.repository';
export { TemplateRepository } from './project/template.repository';
export { GitRepositoryRepository } from './project/git-repository.repository';

// file-tree/
export { FileNodeRepository } from './file-tree/file-node.repository';
export { DocumentRepository } from './file-tree/document.repository';
export { AssetRepository } from './file-tree/asset.repository';

// storage/
export { ProjectFileStore } from './storage/project-file-store';
export { YjsStateStore } from './storage/yjs-state-store';

// auth-tokens/
export { EmailChangeTokenRepository } from './auth-tokens/email-change-token.repository';
export { EmailVerificationTokenRepository } from './auth-tokens/email-verification-token.repository';
export { PasswordResetTokenRepository } from './auth-tokens/password-reset-token.repository';

// admin/
export { AuditLogRepository } from './admin/audit-log.repository';
export { SystemSettingRepository } from './admin/system-setting.repository';
```

Create `packages/domain/tests/ports/index.ts`:

```typescript
/** @file Barrel re-exports for all in-memory port fakes used in tests. */

// user/
export { InMemoryUserRepository } from './user/in-memory-user.repository';
export { InMemorySessionRepository } from './user/in-memory-session.repository';
export { InMemoryKeyBindingRepository } from './user/in-memory-key-binding.repository';
export { InMemoryUserInvitationRepository } from './user/in-memory-user-invitation.repository';

// project/
export { InMemoryProjectRepository } from './project/in-memory-project.repository';
export { InMemoryProjectMemberRepository } from './project/in-memory-project-member.repository';
export { InMemoryTemplateRepository } from './project/in-memory-template.repository';
export { InMemoryGitRepositoryRepository } from './project/in-memory-git-repository.repository';

// file-tree/
export { InMemoryFileNodeRepository } from './file-tree/in-memory-file-node.repository';
export { InMemoryDocumentRepository } from './file-tree/in-memory-document.repository';
export { InMemoryAssetRepository } from './file-tree/in-memory-asset.repository';

// storage/
export { InMemoryProjectFileStore } from './storage/in-memory-project-file-store';
export { InMemoryYjsStateStore } from './storage/in-memory-yjs-state-store';

// auth-tokens/
export { InMemoryEmailChangeTokenRepository } from './auth-tokens/in-memory-email-change-token.repository';
export { InMemoryEmailVerificationTokenRepository } from './auth-tokens/in-memory-email-verification-token.repository';
export { InMemoryPasswordResetTokenRepository } from './auth-tokens/in-memory-password-reset-token.repository';

// admin/
export { InMemoryAuditLogRepository } from './admin/in-memory-audit-log.repository';
export { InMemorySystemSettingRepository } from './admin/in-memory-system-setting.repository';
```

### Step 7.7: Update imports in all use-case source files

Every use-case file in `packages/domain/src/use-cases/` that imports from `'../repositories/xxx'` needs updating to `'../ports/SUBFOLDER/xxx'`. Every import from `'../storage/xxx'` needs updating to `'../ports/storage/xxx'`.

Complete mapping:
```
../repositories/asset.repository               → ../ports/file-tree/asset.repository
../repositories/audit-log.repository           → ../ports/admin/audit-log.repository
../repositories/document.repository            → ../ports/file-tree/document.repository
../repositories/email-change-token.repository  → ../ports/auth-tokens/email-change-token.repository
../repositories/email-verification-token.repository → ../ports/auth-tokens/email-verification-token.repository
../repositories/file-node.repository           → ../ports/file-tree/file-node.repository
../repositories/git-repository.repository      → ../ports/project/git-repository.repository
../repositories/key-binding.repository         → ../ports/user/key-binding.repository
../repositories/password-reset-token.repository → ../ports/auth-tokens/password-reset-token.repository
../repositories/project-member.repository      → ../ports/project/project-member.repository
../repositories/project.repository             → ../ports/project/project.repository
../repositories/session.repository             → ../ports/user/session.repository
../repositories/system-setting.repository      → ../ports/admin/system-setting.repository
../repositories/template.repository            → ../ports/project/template.repository
../repositories/user-invitation.repository     → ../ports/user/user-invitation.repository
../repositories/user.repository                → ../ports/user/user.repository
../storage/project-file-store                  → ../ports/storage/project-file-store
../storage/yjs-state-store                     → ../ports/storage/yjs-state-store
```

Example full diff for `packages/domain/src/use-cases/upload-asset.ts`:
```typescript
// OLD imports (lines 8-12)
import { ProjectMemberRepository } from '../repositories/project-member.repository';
import { FileNodeRepository } from '../repositories/file-node.repository';
import { AssetRepository } from '../repositories/asset.repository';
import { SystemSettingRepository } from '../repositories/system-setting.repository';
import { ProjectFileStore } from '../storage/project-file-store';
```
```typescript
// NEW imports
import { ProjectMemberRepository } from '../ports/project/project-member.repository';
import { FileNodeRepository } from '../ports/file-tree/file-node.repository';
import { AssetRepository } from '../ports/file-tree/asset.repository';
import { SystemSettingRepository } from '../ports/admin/system-setting.repository';
import { ProjectFileStore } from '../ports/storage/project-file-store';
```

Apply the mapping to all affected use-case files. A fast approach using sed:
```bash
cd packages/domain/src/use-cases

# repositories → ports subfolders
sed -i "s|from '../repositories/asset.repository'|from '../ports/file-tree/asset.repository'|g" *.ts
sed -i "s|from '../repositories/audit-log.repository'|from '../ports/admin/audit-log.repository'|g" *.ts
sed -i "s|from '../repositories/document.repository'|from '../ports/file-tree/document.repository'|g" *.ts
sed -i "s|from '../repositories/email-change-token.repository'|from '../ports/auth-tokens/email-change-token.repository'|g" *.ts
sed -i "s|from '../repositories/email-verification-token.repository'|from '../ports/auth-tokens/email-verification-token.repository'|g" *.ts
sed -i "s|from '../repositories/file-node.repository'|from '../ports/file-tree/file-node.repository'|g" *.ts
sed -i "s|from '../repositories/git-repository.repository'|from '../ports/project/git-repository.repository'|g" *.ts
sed -i "s|from '../repositories/key-binding.repository'|from '../ports/user/key-binding.repository'|g" *.ts
sed -i "s|from '../repositories/password-reset-token.repository'|from '../ports/auth-tokens/password-reset-token.repository'|g" *.ts
sed -i "s|from '../repositories/project-member.repository'|from '../ports/project/project-member.repository'|g" *.ts
sed -i "s|from '../repositories/project.repository'|from '../ports/project/project.repository'|g" *.ts
sed -i "s|from '../repositories/session.repository'|from '../ports/user/session.repository'|g" *.ts
sed -i "s|from '../repositories/system-setting.repository'|from '../ports/admin/system-setting.repository'|g" *.ts
sed -i "s|from '../repositories/template.repository'|from '../ports/project/template.repository'|g" *.ts
sed -i "s|from '../repositories/user-invitation.repository'|from '../ports/user/user-invitation.repository'|g" *.ts
sed -i "s|from '../repositories/user.repository'|from '../ports/user/user.repository'|g" *.ts

# storage → ports/storage
sed -i "s|from '../storage/project-file-store'|from '../ports/storage/project-file-store'|g" *.ts
sed -i "s|from '../storage/yjs-state-store'|from '../ports/storage/yjs-state-store'|g" *.ts
```

Also update test files in `packages/domain/tests/use-cases/`. They import fakes using paths like `'../repositories/in-memory-xxx'` or `'../storage/in-memory-xxx'`. Update those to use either the new subfolder paths or the barrel:

```bash
cd packages/domain/tests/use-cases

# Replace individual fake imports with the barrel
sed -i "s|from '../repositories/in-memory-|from '../ports/index.ts' // TODO: use individual path: '../ports/SUBFOLDER/in-memory-|g" *.test.ts
```

Or, more precisely, apply the same complete mapping using the test subfolder structure. Example for `upload-asset.test.ts`:
```typescript
// OLD
import { InMemoryProjectMemberRepository } from '../repositories/in-memory-project-member.repository';
import { InMemoryFileNodeRepository } from '../repositories/in-memory-file-node.repository';
import { InMemoryAssetRepository } from '../repositories/in-memory-asset.repository';
import { InMemoryProjectFileStore } from '../storage/in-memory-project-file-store';
import { InMemorySystemSettingRepository } from '../repositories/in-memory-system-setting.repository';
import { InMemoryProjectRepository } from '../repositories/in-memory-project.repository';
```
```typescript
// NEW
import { InMemoryProjectMemberRepository } from '../ports/project/in-memory-project-member.repository';
import { InMemoryFileNodeRepository } from '../ports/file-tree/in-memory-file-node.repository';
import { InMemoryAssetRepository } from '../ports/file-tree/in-memory-asset.repository';
import { InMemoryProjectFileStore } from '../ports/storage/in-memory-project-file-store';
import { InMemorySystemSettingRepository } from '../ports/admin/in-memory-system-setting.repository';
import { InMemoryProjectRepository } from '../ports/project/in-memory-project.repository';
```

Complete mapping for test fake imports from `tests/use-cases/`:
```
../repositories/in-memory-asset.repository              → ../ports/file-tree/in-memory-asset.repository
../repositories/in-memory-audit-log.repository          → ../ports/admin/in-memory-audit-log.repository
../repositories/in-memory-document.repository           → ../ports/file-tree/in-memory-document.repository
../repositories/in-memory-email-change-token.repository → ../ports/auth-tokens/in-memory-email-change-token.repository
../repositories/in-memory-email-verification-token.repository → ../ports/auth-tokens/in-memory-email-verification-token.repository
../repositories/in-memory-file-node.repository          → ../ports/file-tree/in-memory-file-node.repository
../repositories/in-memory-git-repository.repository     → ../ports/project/in-memory-git-repository.repository
../repositories/in-memory-key-binding.repository        → ../ports/user/in-memory-key-binding.repository
../repositories/in-memory-password-reset-token.repository → ../ports/auth-tokens/in-memory-password-reset-token.repository
../repositories/in-memory-project-member.repository     → ../ports/project/in-memory-project-member.repository
../repositories/in-memory-project.repository            → ../ports/project/in-memory-project.repository
../repositories/in-memory-session.repository            → ../ports/user/in-memory-session.repository
../repositories/in-memory-system-setting.repository     → ../ports/admin/in-memory-system-setting.repository
../repositories/in-memory-template.repository           → ../ports/project/in-memory-template.repository
../repositories/in-memory-user-invitation.repository    → ../ports/user/in-memory-user-invitation.repository
../repositories/in-memory-user.repository               → ../ports/user/in-memory-user.repository
../storage/in-memory-project-file-store                 → ../ports/storage/in-memory-project-file-store
../storage/in-memory-yjs-state-store                    → ../ports/storage/in-memory-yjs-state-store
```

### Step 7.8: Update packages/domain/src/index.ts

File: `packages/domain/src/index.ts`

Replace:
```typescript
export * from './repositories';
export * from './storage';
```
with:
```typescript
export * from './ports';
```

### Step 7.9: Delete old directories and barrel files

```bash
rm packages/domain/src/repositories/index.ts
rm packages/domain/src/storage/index.ts
rmdir packages/domain/src/repositories
rmdir packages/domain/src/storage
rm packages/domain/tests/repositories/index.ts
rmdir packages/domain/tests/repositories
rmdir packages/domain/tests/storage
```

### Step 7.10: Run tests

```bash
pnpm --filter @asciidocollab/domain jest --no-coverage 2>&1 | tail -10
pnpm typecheck 2>&1 | grep -i "domain" | head -10
```

Expected: all domain tests pass, no TypeScript errors.

### Commit

```
git commit -m "refactor(domain): merge repositories/ and storage/ into ports/ with domain-grouped subfolders"
```

---

## Task 8: Reorganize use-cases into subfolders

**Context:** All 41 use-case files live flat in `packages/domain/src/use-cases/`. Moving them into domain-grouped subfolders improves navigability. **Dependency:** Task 7 must be complete first so import paths from use-cases into `../ports/SUBFOLDER/` are already correct before this task adds another `../` level.

### Step 8.1: Create subdirectories

```bash
mkdir -p packages/domain/src/use-cases/{auth,project,file-tree,content,settings,members}
mkdir -p packages/domain/tests/use-cases/{auth,project,file-tree,content,settings,members}
```

### Step 8.2: Move source use-case files

**auth/**
```bash
git mv packages/domain/src/use-cases/login.ts                      packages/domain/src/use-cases/auth/login.ts
git mv packages/domain/src/use-cases/register-user.ts              packages/domain/src/use-cases/auth/register-user.ts
git mv packages/domain/src/use-cases/change-password.ts            packages/domain/src/use-cases/auth/change-password.ts
git mv packages/domain/src/use-cases/verify-email.ts               packages/domain/src/use-cases/auth/verify-email.ts
git mv packages/domain/src/use-cases/request-password-reset.ts     packages/domain/src/use-cases/auth/request-password-reset.ts
git mv packages/domain/src/use-cases/reset-password.ts             packages/domain/src/use-cases/auth/reset-password.ts
git mv packages/domain/src/use-cases/update-display-name.ts        packages/domain/src/use-cases/auth/update-display-name.ts
git mv packages/domain/src/use-cases/resend-verification-email.ts  packages/domain/src/use-cases/auth/resend-verification-email.ts
git mv packages/domain/src/use-cases/confirm-email-change.ts       packages/domain/src/use-cases/auth/confirm-email-change.ts
git mv packages/domain/src/use-cases/request-email-change.ts       packages/domain/src/use-cases/auth/request-email-change.ts
git mv packages/domain/src/use-cases/accept-user-invitation.ts     packages/domain/src/use-cases/auth/accept-user-invitation.ts
git mv packages/domain/src/use-cases/invite-user.ts                packages/domain/src/use-cases/auth/invite-user.ts
git mv packages/domain/src/use-cases/send-user-invitation.ts       packages/domain/src/use-cases/auth/send-user-invitation.ts
git mv packages/domain/src/use-cases/remove-user.ts                packages/domain/src/use-cases/auth/remove-user.ts
git mv packages/domain/src/use-cases/list-users.ts                 packages/domain/src/use-cases/auth/list-users.ts
```

**project/**
```bash
git mv packages/domain/src/use-cases/create-project.ts     packages/domain/src/use-cases/project/create-project.ts
git mv packages/domain/src/use-cases/list-user-projects.ts packages/domain/src/use-cases/project/list-user-projects.ts
git mv packages/domain/src/use-cases/archive-project.ts    packages/domain/src/use-cases/project/archive-project.ts
git mv packages/domain/src/use-cases/restore-project.ts    packages/domain/src/use-cases/project/restore-project.ts
git mv packages/domain/src/use-cases/update-project.ts     packages/domain/src/use-cases/project/update-project.ts
git mv packages/domain/src/use-cases/delete-project.ts     packages/domain/src/use-cases/project/delete-project.ts
```

**file-tree/**
```bash
git mv packages/domain/src/use-cases/create-file.ts      packages/domain/src/use-cases/file-tree/create-file.ts
git mv packages/domain/src/use-cases/create-folder.ts    packages/domain/src/use-cases/file-tree/create-folder.ts
git mv packages/domain/src/use-cases/delete-file.ts      packages/domain/src/use-cases/file-tree/delete-file.ts
git mv packages/domain/src/use-cases/move-file.ts        packages/domain/src/use-cases/file-tree/move-file.ts
git mv packages/domain/src/use-cases/rename-file.ts      packages/domain/src/use-cases/file-tree/rename-file.ts
git mv packages/domain/src/use-cases/get-project-tree.ts packages/domain/src/use-cases/file-tree/get-project-tree.ts
```

**content/**
```bash
git mv packages/domain/src/use-cases/get-document-content.ts  packages/domain/src/use-cases/content/get-document-content.ts
git mv packages/domain/src/use-cases/save-document-content.ts packages/domain/src/use-cases/content/save-document-content.ts
git mv packages/domain/src/use-cases/get-asset-content.ts     packages/domain/src/use-cases/content/get-asset-content.ts
git mv packages/domain/src/use-cases/upload-asset.ts          packages/domain/src/use-cases/content/upload-asset.ts
```

**settings/**
```bash
git mv packages/domain/src/use-cases/check-system-setup.ts     packages/domain/src/use-cases/settings/check-system-setup.ts
git mv packages/domain/src/use-cases/get-open-registration.ts  packages/domain/src/use-cases/settings/get-open-registration.ts
git mv packages/domain/src/use-cases/set-open-registration.ts  packages/domain/src/use-cases/settings/set-open-registration.ts
git mv packages/domain/src/use-cases/admin-max-upload-size.ts  packages/domain/src/use-cases/settings/admin-max-upload-size.ts
git mv packages/domain/src/use-cases/get-key-bindings.ts       packages/domain/src/use-cases/settings/get-key-bindings.ts
git mv packages/domain/src/use-cases/reset-key-binding.ts      packages/domain/src/use-cases/settings/reset-key-binding.ts
git mv packages/domain/src/use-cases/update-key-binding.ts     packages/domain/src/use-cases/settings/update-key-binding.ts
git mv packages/domain/src/use-cases/set-admin-status.ts       packages/domain/src/use-cases/settings/set-admin-status.ts
```

**members/**
```bash
git mv packages/domain/src/use-cases/change-member-role.ts packages/domain/src/use-cases/members/change-member-role.ts
git mv packages/domain/src/use-cases/remove-member.ts      packages/domain/src/use-cases/members/remove-member.ts
```

### Step 8.3: Move test files

**auth/**
```bash
git mv packages/domain/tests/use-cases/login.test.ts                      packages/domain/tests/use-cases/auth/login.test.ts
git mv packages/domain/tests/use-cases/register-user.test.ts              packages/domain/tests/use-cases/auth/register-user.test.ts
git mv packages/domain/tests/use-cases/change-password.test.ts            packages/domain/tests/use-cases/auth/change-password.test.ts
git mv packages/domain/tests/use-cases/verify-email.test.ts               packages/domain/tests/use-cases/auth/verify-email.test.ts
git mv packages/domain/tests/use-cases/request-password-reset.test.ts     packages/domain/tests/use-cases/auth/request-password-reset.test.ts
git mv packages/domain/tests/use-cases/reset-password.test.ts             packages/domain/tests/use-cases/auth/reset-password.test.ts
git mv packages/domain/tests/use-cases/update-display-name.test.ts        packages/domain/tests/use-cases/auth/update-display-name.test.ts
git mv packages/domain/tests/use-cases/resend-verification-email.test.ts  packages/domain/tests/use-cases/auth/resend-verification-email.test.ts
git mv packages/domain/tests/use-cases/confirm-email-change.test.ts       packages/domain/tests/use-cases/auth/confirm-email-change.test.ts
git mv packages/domain/tests/use-cases/request-email-change.test.ts       packages/domain/tests/use-cases/auth/request-email-change.test.ts
git mv packages/domain/tests/use-cases/accept-user-invitation.test.ts     packages/domain/tests/use-cases/auth/accept-user-invitation.test.ts
git mv packages/domain/tests/use-cases/invite-user.test.ts                packages/domain/tests/use-cases/auth/invite-user.test.ts
git mv packages/domain/tests/use-cases/send-user-invitation.test.ts       packages/domain/tests/use-cases/auth/send-user-invitation.test.ts
git mv packages/domain/tests/use-cases/remove-user.test.ts                packages/domain/tests/use-cases/auth/remove-user.test.ts
git mv packages/domain/tests/use-cases/list-users.test.ts                 packages/domain/tests/use-cases/auth/list-users.test.ts
```

**project/**
```bash
git mv packages/domain/tests/use-cases/create-project.test.ts     packages/domain/tests/use-cases/project/create-project.test.ts
git mv packages/domain/tests/use-cases/list-user-projects.test.ts packages/domain/tests/use-cases/project/list-user-projects.test.ts
git mv packages/domain/tests/use-cases/archive-project.test.ts    packages/domain/tests/use-cases/project/archive-project.test.ts
git mv packages/domain/tests/use-cases/restore-project.test.ts    packages/domain/tests/use-cases/project/restore-project.test.ts
git mv packages/domain/tests/use-cases/update-project.test.ts     packages/domain/tests/use-cases/project/update-project.test.ts
git mv packages/domain/tests/use-cases/delete-project.test.ts     packages/domain/tests/use-cases/project/delete-project.test.ts
```

**file-tree/**
```bash
git mv packages/domain/tests/use-cases/create-file.test.ts      packages/domain/tests/use-cases/file-tree/create-file.test.ts
git mv packages/domain/tests/use-cases/create-folder.test.ts    packages/domain/tests/use-cases/file-tree/create-folder.test.ts
git mv packages/domain/tests/use-cases/delete-file.test.ts      packages/domain/tests/use-cases/file-tree/delete-file.test.ts
git mv packages/domain/tests/use-cases/move-file.test.ts        packages/domain/tests/use-cases/file-tree/move-file.test.ts
git mv packages/domain/tests/use-cases/rename-file.test.ts      packages/domain/tests/use-cases/file-tree/rename-file.test.ts
git mv packages/domain/tests/use-cases/get-project-tree.test.ts packages/domain/tests/use-cases/file-tree/get-project-tree.test.ts
```

**content/**
```bash
git mv packages/domain/tests/use-cases/get-document-content.test.ts  packages/domain/tests/use-cases/content/get-document-content.test.ts
git mv packages/domain/tests/use-cases/save-document-content.test.ts packages/domain/tests/use-cases/content/save-document-content.test.ts
git mv packages/domain/tests/use-cases/get-asset-content.test.ts     packages/domain/tests/use-cases/content/get-asset-content.test.ts
git mv packages/domain/tests/use-cases/upload-asset.test.ts          packages/domain/tests/use-cases/content/upload-asset.test.ts
```

**settings/**
```bash
git mv packages/domain/tests/use-cases/check-system-setup.test.ts       packages/domain/tests/use-cases/settings/check-system-setup.test.ts
git mv packages/domain/tests/use-cases/get-open-registration.test.ts    packages/domain/tests/use-cases/settings/get-open-registration.test.ts
git mv packages/domain/tests/use-cases/set-open-registration.test.ts    packages/domain/tests/use-cases/settings/set-open-registration.test.ts
git mv packages/domain/tests/use-cases/admin-set-max-upload-size.test.ts packages/domain/tests/use-cases/settings/admin-set-max-upload-size.test.ts
git mv packages/domain/tests/use-cases/get-key-bindings.test.ts         packages/domain/tests/use-cases/settings/get-key-bindings.test.ts
git mv packages/domain/tests/use-cases/reset-key-binding.test.ts        packages/domain/tests/use-cases/settings/reset-key-binding.test.ts
git mv packages/domain/tests/use-cases/update-key-binding.test.ts       packages/domain/tests/use-cases/settings/update-key-binding.test.ts
git mv packages/domain/tests/use-cases/set-admin-status.test.ts         packages/domain/tests/use-cases/settings/set-admin-status.test.ts
```

**members/**
```bash
git mv packages/domain/tests/use-cases/change-member-role.test.ts packages/domain/tests/use-cases/members/change-member-role.test.ts
git mv packages/domain/tests/use-cases/remove-member.test.ts      packages/domain/tests/use-cases/members/remove-member.test.ts
```

### Step 8.4: Update imports in moved use-case source files

Moving from `src/use-cases/foo.ts` (1 level deep) to `src/use-cases/subfolder/foo.ts` (2 levels deep) adds one more `../` to every import.

Before (from `src/use-cases/`):
```typescript
import { Asset } from '../entities/asset';
import { AssetId } from '../value-objects/asset-id';
import { ProjectMemberRepository } from '../ports/project/project-member.repository';
import { ProjectFileStore } from '../ports/storage/project-file-store';
import { PermissionDeniedError } from '../errors/permission-denied';
import { Result } from '../types/result';
import { SETTING_MAX_UPLOAD_SIZE_BYTES } from '../constants';
```

After (from `src/use-cases/content/`):
```typescript
import { Asset } from '../../entities/asset';
import { AssetId } from '../../value-objects/asset-id';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { ProjectFileStore } from '../../ports/storage/project-file-store';
import { PermissionDeniedError } from '../../errors/permission-denied';
import { Result } from '../../types/result';
import { SETTING_MAX_UPLOAD_SIZE_BYTES } from '../../constants';
```

The transformation is uniform: every `from '../` in the moved use-case source files becomes `from '../../`.

Apply using find+sed across all moved use-case source files:
```bash
find packages/domain/src/use-cases/{auth,project,file-tree,content,settings,members} -name "*.ts" \
  | xargs sed -i "s|from '\.\./|from '../../|g"
```

Verify no broken `'../` remain (all should now be `'../../`):
```bash
grep -rn "from '\.\.[^.]" packages/domain/src/use-cases/{auth,project,file-tree,content,settings,members}/
```
Expected: no output.

### Step 8.5: Update imports in moved test files

Test files were at `tests/use-cases/foo.test.ts` and imported:
- `'../../src/use-cases/foo'` (source use case)
- `'../ports/subfolder/in-memory-xxx'` (test fakes, after Task 7)
- `'../../src/entities/xxx'`, `'../../src/value-objects/xxx'` etc.

After moving to `tests/use-cases/subfolder/foo.test.ts`:
- `'../../src/use-cases/foo'` → `'../../../src/use-cases/subfolder/foo'`
- `'../ports/subfolder/in-memory-xxx'` → `'../../ports/subfolder/in-memory-xxx'`
- `'../../src/entities/xxx'` → `'../../../src/entities/xxx'`
- `'../../src/value-objects/xxx'` → `'../../../src/value-objects/xxx'`
- `'../../src/errors/xxx'` → `'../../../src/errors/xxx'`
- `'../../src/constants'` → `'../../../src/constants'`

Example full before/after for `packages/domain/tests/use-cases/content/upload-asset.test.ts`:
```typescript
// OLD (was at tests/use-cases/upload-asset.test.ts)
import { UploadAssetUseCase } from '../../src/use-cases/upload-asset';
import { InMemoryProjectMemberRepository } from '../ports/project/in-memory-project-member.repository';
import { InMemoryFileNodeRepository } from '../ports/file-tree/in-memory-file-node.repository';
import { InMemoryAssetRepository } from '../ports/file-tree/in-memory-asset.repository';
import { InMemoryProjectFileStore } from '../ports/storage/in-memory-project-file-store';
import { InMemorySystemSettingRepository } from '../ports/admin/in-memory-system-setting.repository';
import { InMemoryProjectRepository } from '../ports/project/in-memory-project.repository';
import { Project } from '../../src/entities/project';
import { ProjectMember } from '../../src/entities/project-member';
import { FileNode } from '../../src/entities/file-node';
import { UserId } from '../../src/value-objects/user-id';
import { ProjectId } from '../../src/value-objects/project-id';
// ... etc
import { SETTING_MAX_UPLOAD_SIZE_BYTES } from '../../src/constants';
```
```typescript
// NEW (now at tests/use-cases/content/upload-asset.test.ts)
import { UploadAssetUseCase } from '../../../src/use-cases/content/upload-asset';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
import { InMemoryFileNodeRepository } from '../../ports/file-tree/in-memory-file-node.repository';
import { InMemoryAssetRepository } from '../../ports/file-tree/in-memory-asset.repository';
import { InMemoryProjectFileStore } from '../../ports/storage/in-memory-project-file-store';
import { InMemorySystemSettingRepository } from '../../ports/admin/in-memory-system-setting.repository';
import { InMemoryProjectRepository } from '../../ports/project/in-memory-project.repository';
import { Project } from '../../../src/entities/project';
import { ProjectMember } from '../../../src/entities/project-member';
import { FileNode } from '../../../src/entities/file-node';
import { UserId } from '../../../src/value-objects/user-id';
import { ProjectId } from '../../../src/value-objects/project-id';
// ... etc
import { SETTING_MAX_UPLOAD_SIZE_BYTES } from '../../../src/constants';
```

Apply uniformly across all moved test files:
```bash
find packages/domain/tests/use-cases/{auth,project,file-tree,content,settings,members} -name "*.test.ts" \
  | xargs sed -i \
    -e "s|from '../../src/|from '../../../src/|g" \
    -e "s|from '../ports/|from '../../ports/|g"
```

Then fix the use-case source path in each test (now one level deeper in src/):
This is the complex part — each test imports from `'../../../src/use-cases/FILENAME'` but the source file is now at `'../../../src/use-cases/SUBFOLDER/FILENAME'`. Update each test file's use-case import to include the correct subfolder. The mapping is the same as Step 8.2: the subfolder for each file matches where the source was moved.

For a bulk approach, grep for remaining `../../../src/use-cases/[a-z]` (without a subfolder) and fix:
```bash
grep -rn "from '../../../src/use-cases/[a-z]" packages/domain/tests/use-cases/ | grep -v "from '../../../src/use-cases/auth/\|project/\|file-tree/\|content/\|settings/\|members/"
```
Fix each hit by inserting the correct subfolder segment.

### Step 8.6: Update use-cases/index.ts

Replace the content of `packages/domain/src/use-cases/index.ts` with subfolder barrel re-exports:

```typescript
/** @file Barrel re-exports for all domain use cases. */
export * from './auth/login';
export * from './auth/register-user';
export * from './auth/change-password';
export * from './auth/verify-email';
export * from './auth/request-password-reset';
export * from './auth/reset-password';
export * from './auth/update-display-name';
export * from './auth/resend-verification-email';
export * from './auth/confirm-email-change';
export * from './auth/request-email-change';
export * from './auth/accept-user-invitation';
export * from './auth/invite-user';
export * from './auth/send-user-invitation';
export * from './auth/remove-user';
export * from './auth/list-users';
export * from './project/create-project';
export * from './project/list-user-projects';
export * from './project/archive-project';
export * from './project/restore-project';
export * from './project/update-project';
export * from './project/delete-project';
export * from './file-tree/create-file';
export * from './file-tree/create-folder';
export * from './file-tree/delete-file';
export * from './file-tree/move-file';
export * from './file-tree/rename-file';
export * from './file-tree/get-project-tree';
export * from './content/get-document-content';
export * from './content/save-document-content';
export * from './content/get-asset-content';
export * from './content/upload-asset';
export * from './settings/check-system-setup';
export * from './settings/get-open-registration';
export * from './settings/set-open-registration';
export * from './settings/admin-max-upload-size';
export * from './settings/get-key-bindings';
export * from './settings/reset-key-binding';
export * from './settings/update-key-binding';
export * from './settings/set-admin-status';
export * from './members/change-member-role';
export * from './members/remove-member';
```

### Step 8.7: Run tests

```bash
pnpm --filter @asciidocollab/domain jest --no-coverage 2>&1 | tail -10
pnpm typecheck 2>&1 | grep -i "use-cases\|domain" | head -10
```

Expected: all domain tests pass, no TypeScript errors.

### Commit

```
git commit -m "refactor(domain): organize use-cases into domain-grouped subfolders"
```

---

## Task 9: Reorganize infrastructure persistence/ and storage/

**Context:** `packages/infrastructure/src/persistence/` holds all Prisma repository implementations flat. `packages/infrastructure/src/storage/` holds filesystem store implementations. Reorganize both under domain-grouped `persistence/` subfolders, mirroring the `ports/` structure from Task 7.

### Step 9.1: Create subdirectories

```bash
mkdir -p packages/infrastructure/src/persistence/{user,project,file-tree,storage,auth-tokens,admin}
mkdir -p packages/infrastructure/tests/persistence/{user,project,file-tree,storage,auth-tokens,admin}
```

### Step 9.2: Move source Prisma files

**user/**
```bash
git mv packages/infrastructure/src/persistence/prisma-user.repository.ts            packages/infrastructure/src/persistence/user/prisma-user.repository.ts
git mv packages/infrastructure/src/persistence/prisma-session.repository.ts         packages/infrastructure/src/persistence/user/prisma-session.repository.ts
git mv packages/infrastructure/src/persistence/prisma-key-binding.repository.ts     packages/infrastructure/src/persistence/user/prisma-key-binding.repository.ts
git mv packages/infrastructure/src/persistence/prisma-user-invitation.repository.ts packages/infrastructure/src/persistence/user/prisma-user-invitation.repository.ts
```

**project/**
```bash
git mv packages/infrastructure/src/persistence/prisma-project.repository.ts        packages/infrastructure/src/persistence/project/prisma-project.repository.ts
git mv packages/infrastructure/src/persistence/prisma-project-member.repository.ts packages/infrastructure/src/persistence/project/prisma-project-member.repository.ts
git mv packages/infrastructure/src/persistence/prisma-template.repository.ts       packages/infrastructure/src/persistence/project/prisma-template.repository.ts
git mv packages/infrastructure/src/persistence/prisma-git-repository.repository.ts packages/infrastructure/src/persistence/project/prisma-git-repository.repository.ts
```

**file-tree/**
```bash
git mv packages/infrastructure/src/persistence/prisma-file-node.repository.ts packages/infrastructure/src/persistence/file-tree/prisma-file-node.repository.ts
git mv packages/infrastructure/src/persistence/prisma-document.repository.ts  packages/infrastructure/src/persistence/file-tree/prisma-document.repository.ts
git mv packages/infrastructure/src/persistence/prisma-asset.repository.ts     packages/infrastructure/src/persistence/file-tree/prisma-asset.repository.ts
```

**storage/** (from src/storage/ to src/persistence/storage/)
```bash
git mv packages/infrastructure/src/storage/filesystem-project-file-store.ts packages/infrastructure/src/persistence/storage/filesystem-project-file-store.ts
git mv packages/infrastructure/src/storage/filesystem-yjs-state-store.ts    packages/infrastructure/src/persistence/storage/filesystem-yjs-state-store.ts
```

**auth-tokens/**
```bash
git mv packages/infrastructure/src/persistence/prisma-email-change-token.repository.ts       packages/infrastructure/src/persistence/auth-tokens/prisma-email-change-token.repository.ts
git mv packages/infrastructure/src/persistence/prisma-email-verification-token.repository.ts packages/infrastructure/src/persistence/auth-tokens/prisma-email-verification-token.repository.ts
git mv packages/infrastructure/src/persistence/prisma-password-reset-token.repository.ts     packages/infrastructure/src/persistence/auth-tokens/prisma-password-reset-token.repository.ts
```

**admin/**
```bash
git mv packages/infrastructure/src/persistence/prisma-audit-log.repository.ts    packages/infrastructure/src/persistence/admin/prisma-audit-log.repository.ts
git mv packages/infrastructure/src/persistence/prisma-system-setting.repository.ts packages/infrastructure/src/persistence/admin/prisma-system-setting.repository.ts
```

### Step 9.3: Move test files

**user/**
```bash
git mv packages/infrastructure/tests/persistence/prisma-user.repository.test.ts            packages/infrastructure/tests/persistence/user/prisma-user.repository.test.ts
git mv packages/infrastructure/tests/persistence/prisma-session.repository.test.ts         packages/infrastructure/tests/persistence/user/prisma-session.repository.test.ts
git mv packages/infrastructure/tests/persistence/prisma-key-binding.repository.test.ts     packages/infrastructure/tests/persistence/user/prisma-key-binding.repository.test.ts
git mv packages/infrastructure/tests/persistence/prisma-user-invitation.repository.test.ts packages/infrastructure/tests/persistence/user/prisma-user-invitation.repository.test.ts
```

**project/**
```bash
git mv packages/infrastructure/tests/persistence/prisma-project.repository.test.ts        packages/infrastructure/tests/persistence/project/prisma-project.repository.test.ts
git mv packages/infrastructure/tests/persistence/prisma-project-member.repository.test.ts packages/infrastructure/tests/persistence/project/prisma-project-member.repository.test.ts
git mv packages/infrastructure/tests/persistence/prisma-template.repository.test.ts       packages/infrastructure/tests/persistence/project/prisma-template.repository.test.ts
git mv packages/infrastructure/tests/persistence/prisma-git-repository.repository.test.ts packages/infrastructure/tests/persistence/project/prisma-git-repository.repository.test.ts
```

**file-tree/**
```bash
git mv packages/infrastructure/tests/persistence/prisma-file-node.repository.test.ts packages/infrastructure/tests/persistence/file-tree/prisma-file-node.repository.test.ts
git mv packages/infrastructure/tests/persistence/prisma-document.repository.test.ts  packages/infrastructure/tests/persistence/file-tree/prisma-document.repository.test.ts
git mv packages/infrastructure/tests/persistence/prisma-asset.repository.test.ts     packages/infrastructure/tests/persistence/file-tree/prisma-asset.repository.test.ts
```

**storage/** (from tests/storage/ to tests/persistence/storage/)
```bash
git mv packages/infrastructure/tests/storage/filesystem-project-file-store.test.ts packages/infrastructure/tests/persistence/storage/filesystem-project-file-store.test.ts
git mv packages/infrastructure/tests/storage/filesystem-yjs-state-store.test.ts    packages/infrastructure/tests/persistence/storage/filesystem-yjs-state-store.test.ts
```

**auth-tokens/**
```bash
git mv packages/infrastructure/tests/persistence/prisma-email-verification-token.repository.test.ts packages/infrastructure/tests/persistence/auth-tokens/prisma-email-verification-token.repository.test.ts
```
(Note: check if `prisma-email-change-token` and `prisma-password-reset-token` test files exist and move them similarly if present.)

**admin/**
```bash
git mv packages/infrastructure/tests/persistence/prisma-audit-log.repository.test.ts     packages/infrastructure/tests/persistence/admin/prisma-audit-log.repository.test.ts
git mv packages/infrastructure/tests/persistence/prisma-system-setting.repository.test.ts packages/infrastructure/tests/persistence/admin/prisma-system-setting.repository.test.ts
```

**type-mapping.test.ts** stays at `tests/persistence/type-mapping.test.ts` (it's a cross-cutting test, not subfolder-specific).

### Step 9.4: Update imports in moved source files

The Prisma repository implementations import from `@asciidocollab/domain` (package import — no path change needed) and from `@prisma/client` (package import — no change needed). They have no intra-package relative imports. No import changes needed for source files.

The filesystem store implementations (`filesystem-project-file-store.ts`, `filesystem-yjs-state-store.ts`) also import only from `@asciidocollab/domain` and Node.js built-ins. No import changes needed.

### Step 9.5: Update imports in moved test files

Infrastructure test files import the implementation under test using relative paths. After moving from `tests/persistence/prisma-xxx.test.ts` to `tests/persistence/subfolder/prisma-xxx.test.ts`, the depth increases by one level:

Pattern change:
```typescript
// OLD (from tests/persistence/)
import { PrismaAssetRepository } from '../../src/persistence/prisma-asset.repository';
```
```typescript
// NEW (from tests/persistence/file-tree/)
import { PrismaAssetRepository } from '../../../src/persistence/file-tree/prisma-asset.repository';
```

Similarly for storage tests:
```typescript
// OLD (from tests/storage/)
import { FilesystemProjectFileStore } from '../../src/storage/filesystem-project-file-store';
```
```typescript
// NEW (from tests/persistence/storage/)
import { FilesystemProjectFileStore } from '../../../src/persistence/storage/filesystem-project-file-store';
```

The `type-mapping.test.ts` file (which stays at `tests/persistence/`) already imports using `'../../src/persistence/prisma-xxx'`. After the moves, those paths need the subfolder:
```typescript
// OLD
import { PrismaAssetRepository } from '../../src/persistence/prisma-asset.repository';
```
```typescript
// NEW
import { PrismaAssetRepository } from '../../src/persistence/file-tree/prisma-asset.repository';
```
Apply this fix for all repositories referenced in `type-mapping.test.ts`.

Also fix the helper import:
```typescript
// No change needed — helpers/test-data.ts path is unchanged
import { ... } from '../helpers/test-data';
```

### Step 9.6: Update packages/infrastructure/src/index.ts

Replace the flat import list with subfolder-grouped imports. Complete new content of `packages/infrastructure/src/index.ts`:

```typescript
/**
 * @packageDocumentation Barrel file for the infrastructure package.
 */

// user/
export { PrismaUserRepository } from './persistence/user/prisma-user.repository';
export { PrismaSessionRepository } from './persistence/user/prisma-session.repository';
export { PrismaKeyBindingRepository } from './persistence/user/prisma-key-binding.repository';
export { PrismaUserInvitationRepository } from './persistence/user/prisma-user-invitation.repository';

// project/
export { PrismaProjectRepository } from './persistence/project/prisma-project.repository';
export { PrismaProjectMemberRepository } from './persistence/project/prisma-project-member.repository';
export { PrismaTemplateRepository } from './persistence/project/prisma-template.repository';
export { PrismaGitRepositoryRepository } from './persistence/project/prisma-git-repository.repository';

// file-tree/
export { PrismaFileNodeRepository } from './persistence/file-tree/prisma-file-node.repository';
export { PrismaDocumentRepository } from './persistence/file-tree/prisma-document.repository';
export { PrismaAssetRepository } from './persistence/file-tree/prisma-asset.repository';

// storage/
export { FilesystemProjectFileStore } from './persistence/storage/filesystem-project-file-store';
export { FilesystemYjsStateStore } from './persistence/storage/filesystem-yjs-state-store';

// auth-tokens/
export { PrismaEmailChangeTokenRepository } from './persistence/auth-tokens/prisma-email-change-token.repository';
export { PrismaEmailVerificationTokenRepository } from './persistence/auth-tokens/prisma-email-verification-token.repository';
export { PrismaPasswordResetTokenRepository } from './persistence/auth-tokens/prisma-password-reset-token.repository';

// admin/
export { PrismaAuditLogRepository } from './persistence/admin/prisma-audit-log.repository';
export { PrismaSystemSettingRepository } from './persistence/admin/prisma-system-setting.repository';

export * from './services';
```

### Step 9.7: Delete old directories

```bash
rmdir packages/infrastructure/src/storage
rmdir packages/infrastructure/tests/storage
```

### Step 9.8: Run tests

```bash
pnpm --filter @asciidocollab/infrastructure jest --no-coverage 2>&1 | tail -10
pnpm typecheck 2>&1 | grep -i "infrastructure" | head -10
```

Expected: all infrastructure tests pass, no TypeScript errors.

### Commit

```
git commit -m "refactor(infra): organize persistence implementations into domain-grouped subfolders"
```

---

## Task 10: Update architecture_constitution.md and tasks-template.md

**Context:** The architecture constitution and tasks template reference old paths (`repositories/`, `storage/`, flat use-cases). Update them to reflect the new `ports/` directory and use-cases subfolder structure.

### Step 10.1: Update architecture_constitution.md

File: `.specify/memory/architecture_constitution.md`

**Change 1** — In the Architecture Style section, update the `packages/domain` line in the monolith diagram:

Current:
```
  domain/       ← Business logic, entities, use cases, repository interfaces
```
New:
```
  domain/       ← Business logic, entities, use cases, port interfaces (repositories + storage)
```

**Change 2** — In the Layer Boundaries section, update the statement about repository interfaces:

Current:
```
- The domain layer MUST define repository interfaces; infrastructure provides
  implementations.
```
New:
```
- The domain layer MUST define port interfaces (repositories and storage contracts)
  under `packages/domain/src/ports/`; infrastructure provides implementations.
```

**Change 3** — In the Data Access Rules section:

Current:
```
- Repository interfaces are defined in `packages/domain`. Infrastructure provides
  Prisma-backed implementations.
- Every repository interface MUST have a corresponding in-memory fake in the test suite.
```
New:
```
- Port interfaces (repositories and storage contracts) are defined in
  `packages/domain/src/ports/` grouped by domain area (user/, project/, file-tree/,
  content/, settings/, members/, auth-tokens/, admin/, storage/).
  Infrastructure provides Prisma-backed and filesystem implementations.
- Every port interface MUST have a corresponding in-memory fake in
  `packages/domain/tests/ports/` mirroring the same subfolder structure.
```

**Change 4** — In the Test File Layout section, extend the Canonical paths table and add a note about subfolders. After the existing table:

```markdown
### Subfolder conventions (domain package)

| Layer | Source path | Test path |
|---|---|---|
| Domain use cases | `packages/domain/src/use-cases/{auth,project,file-tree,content,settings,members}/` | `packages/domain/tests/use-cases/{subfolder}/` |
| Domain ports | `packages/domain/src/ports/{user,project,file-tree,storage,auth-tokens,admin}/` | `packages/domain/tests/ports/{subfolder}/` |
| Infrastructure persistence | `packages/infrastructure/src/persistence/{user,project,file-tree,storage,auth-tokens,admin}/` | `packages/infrastructure/tests/persistence/{subfolder}/` |
```

**Change 5** — Update the version footer:
```
**Version**: 2.3.0 | **Ratified**: 2026-05-27 | **Last Amended**: 2026-06-03
```

### Step 10.2: Update tasks-template.md

File: `.specify/templates/tasks-template.md`

In the Path Conventions section, after the existing table, add:

```markdown
### Domain-package subfolder conventions

After the 2026-06-03 codebase reorganization, the domain package uses grouped subfolders:

| Layer | Source paths | Test paths |
|---|---|---|
| Use cases | `packages/domain/src/use-cases/{auth,project,file-tree,content,settings,members}/` | `packages/domain/tests/use-cases/{subfolder}/` |
| Port interfaces | `packages/domain/src/ports/{user,project,file-tree,storage,auth-tokens,admin}/` | `packages/domain/tests/ports/{subfolder}/` |
| Infrastructure | `packages/infrastructure/src/persistence/{user,project,file-tree,storage,auth-tokens,admin}/` | `packages/infrastructure/tests/persistence/{subfolder}/` |

All public APIs remain stable — consumers import from `@asciidocollab/domain` (not from internal subfolder paths).
```

### Step 10.3: Also update the architecture_constitution.md template

File: `.specify/extensions/architecture-guard/templates/architecture_constitution.md`

Apply the same changes as Step 10.1 to keep the template in sync with the memory copy.

### Commit

```
git commit -m "docs: update architecture constitution and tasks template for ports/ and use-cases subfolder conventions"
```

---

## Task 11: Run all quality gates

Run the complete quality gate suite and fix any remaining failures.

### Step 11.1: Full test suite

```bash
pnpm test 2>&1 | grep -E "Tests:|Test Suites:|FAIL" | tail -20
```

Expected: all test suites pass. If any fail, investigate the specific file and fix import paths or type mismatches introduced in Tasks 7-9.

### Step 11.2: TypeScript compilation

```bash
pnpm typecheck 2>&1 | tail -20
```

Expected: no errors. Common issues to watch for:
- `sizeBytes: number` vs `sizeBytes: bigint` — ensure all call sites that construct `Asset` or read `asset.sizeBytes` use `bigint` after Task 4.
- Import paths in use-case or test files with wrong `../` depth — check by counting directory levels from file to target.

### Step 11.3: Lint

```bash
pnpm lint 2>&1 | tail -20
```

Fix any ESLint errors introduced by the changes. Common issues:
- Unused imports if a fake was imported but is now imported differently.
- Import order if the barrel file order is unexpected.

### Step 11.4: Audit

```bash
pnpm audit 2>&1 | tail -5
```

No new vulnerabilities should have been introduced. Only verify high/critical — moderate vulnerabilities do not require pnpm overrides per the project audit policy.

### Step 11.5: Mark complete

Once all gates pass:
```bash
git log --oneline -12
```

Verify the 11 commits (one per task) are present in the log.

---

## Dependency Graph Summary

```
Task 1 (empty uploads)   ──┐
Task 2 (getAssetUrl)     ──┤
Task 3 (image aliases)   ──┤─── independent, any order
Task 5 (getEntry/worker) ──┤
Task 6 (file-tree split) ──┘
                            ↓
Task 4 (BigInt)         ── must be after Task 1 (invariant change is prerequisite)
                            ↓
Task 7 (ports/)         ── must be after Tasks 1-4 (uses correct types and paths)
                            ↓
Task 8 (use-cases subfolders) ── must be after Task 7 (ports paths are stable)
Task 9 (infra subfolders)     ── must be after Task 7 (mirrors ports structure)
                            ↓
Task 10 (docs update)   ── must be after Tasks 7-9 (describes final structure)
                            ↓
Task 11 (quality gates) ── final, after all other tasks
```
