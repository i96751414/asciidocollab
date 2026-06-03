# Code Review Bug Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write failing tests for each of 10 confirmed code-review findings, verify each fails for the right reason, implement the minimal fix, re-verify, then run all quality gates.

**Architecture:** Pure TDD cycle (red → green → refactor) applied per issue. Domain issues are tested with in-memory fakes; API route issues with Fastify `inject`; infrastructure issues with a real temp filesystem. All fixes are minimal — no refactors beyond the defect boundary.

**Tech Stack:** TypeScript, Jest, Fastify, Prisma (schema only for Issue 8), Node.js `fs/promises`.

---

## Issues Quick-Reference

| # | Package | File | Description |
|---|---------|------|-------------|
| 1 | domain | `use-cases/save-document-content.ts` | Missing cross-project ownership check → unauthorized write |
| 2 | domain | `use-cases/get-document-content.ts` | Missing cross-project ownership check → unauthorized read |
| 3 | domain | `use-cases/upload-asset.ts` | `Number("abc") → NaN`; size guard silently bypassed |
| 4 | api | `routes/projects/assets.ts` | Missing `parentId` param → unhandled `ValidationError` → 500 |
| 5 | domain | `use-cases/rename-file.ts` | `fileStore.move` before DB save; no rollback on DB failure |
| 6 | domain | `use-cases/delete-file.ts` | `yjsStateStore.delete` throws after DB rows deleted → orphaned blob |
| 7 | api | `routes/projects/assets.ts` | Empty-file `ValidationError` → wrong HTTP 413 instead of 400 |
| 8 | db | `prisma/schema.prisma` | `Asset → Project` missing `onDelete: Cascade` → FK violation on project delete |
| 9 | infra | `storage/filesystem-project-file-store.ts` | `stat` + `rename` TOCTOU race; concurrent moves can overwrite |
| 10 | domain | `use-cases/create-file.ts` + `upload-asset.ts` | `createExclusive` succeeds then DB throws → orphaned file on disk |

---

## Task 1 — Issue 1: Cross-project write in `save-document-content`

**Files:**
- Test: `packages/domain/tests/use-cases/save-document-content.test.ts` (add test)
- Fix: `packages/domain/src/use-cases/save-document-content.ts` (add ownership guard after `findById`)

- [ ] **Step 1.1 — Write the failing test**

Add this test inside the existing `describe('SaveDocumentContentUseCase')` block in `packages/domain/tests/use-cases/save-document-content.test.ts`. The test needs a second project and a file node that belongs to that other project.

```typescript
it('rejects write when fileNodeId belongs to a different project', async () => {
  const otherProjectId = ProjectId.create('ee0e8400-e29b-41d4-a716-446655440099');
  const otherFileNodeId = FileNodeId.create('ff0e8400-e29b-41d4-a716-446655440099');
  const foreignNode = new FileNode(
    otherFileNodeId,
    otherProjectId,
    null,
    'foreign.adoc',
    FileNodeType.create('file'),
    FilePath.create('/foreign.adoc'),
  );
  await fileNodeRepo.save(foreignNode);

  const result = await useCase.execute(actorId, projectId, otherFileNodeId, newContent);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error).toBeInstanceOf(FileNodeNotFoundError);
  }
});
```

- [ ] **Step 1.2 — Run the test and confirm it fails because the cross-project write succeeds**

```bash
pnpm --filter @asciidocollab/domain jest -- --testPathPattern="save-document-content" --no-coverage
```

Expected: FAIL — `expect(result.success).toBe(false)` fails because the current code has no ownership guard and lets the write through (result.success is true).

- [ ] **Step 1.3 — Implement the fix**

In `packages/domain/src/use-cases/save-document-content.ts`, add a projectId ownership check after the `findById` call (line 39):

```typescript
const fileNode = await this.fileNodeRepo.findById(fileNodeId);
if (!fileNode || fileNode.projectId.value !== projectId.value) {
  return { success: false, error: new FileNodeNotFoundError(fileNodeId.value) };
}
```

The existing line 40-42 only checks `!fileNode`; change the condition to also check `fileNode.projectId.value !== projectId.value`.

- [ ] **Step 1.4 — Run the test and confirm green**

```bash
pnpm --filter @asciidocollab/domain jest -- --testPathPattern="save-document-content" --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 1.5 — Commit**

```bash
git add packages/domain/tests/use-cases/save-document-content.test.ts \
        packages/domain/src/use-cases/save-document-content.ts
git commit -m "fix(domain): reject save-document-content when fileNode belongs to a different project"
```

---

## Task 2 — Issue 2: Cross-project read in `get-document-content`

**Files:**
- Test: `packages/domain/tests/use-cases/get-document-content.test.ts` (add test)
- Fix: `packages/domain/src/use-cases/get-document-content.ts` (add ownership guard after `findById`)

- [ ] **Step 2.1 — Write the failing test**

Add this test inside the existing `describe('GetDocumentContentUseCase')` block in `packages/domain/tests/use-cases/get-document-content.test.ts`:

```typescript
it('rejects read when fileNodeId belongs to a different project', async () => {
  const otherProjectId = ProjectId.create('ee0e8400-e29b-41d4-a716-446655440099');
  const otherFileNodeId = FileNodeId.create('ff0e8400-e29b-41d4-a716-446655440099');
  const foreignNode = new FileNode(
    otherFileNodeId,
    otherProjectId,
    null,
    'foreign.adoc',
    FileNodeType.create('file'),
    FilePath.create('/foreign.adoc'),
  );
  await fileNodeRepo.save(foreignNode);
  // Put content at foreign path in our project's store (the probe target)
  await fileStore.write(projectId, FilePath.create('/foreign.adoc'), Buffer.from('secret'));

  const result = await useCase.execute(actorId, projectId, otherFileNodeId);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error).toBeInstanceOf(FileNodeNotFoundError);
  }
});
```

- [ ] **Step 2.2 — Run the test and confirm it fails**

```bash
pnpm --filter @asciidocollab/domain jest -- --testPathPattern="get-document-content" --no-coverage
```

Expected: FAIL — the current code has no ownership guard so the read succeeds and `result.success` is `true`.

- [ ] **Step 2.3 — Implement the fix**

In `packages/domain/src/use-cases/get-document-content.ts`, change the `findById` guard on line 36:

```typescript
const fileNode = await this.fileNodeRepo.findById(fileNodeId);
if (!fileNode || fileNode.projectId.value !== projectId.value) {
  return { success: false, error: new FileNodeNotFoundError(fileNodeId.value) };
}
```

- [ ] **Step 2.4 — Run the test and confirm green**

```bash
pnpm --filter @asciidocollab/domain jest -- --testPathPattern="get-document-content" --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 2.5 — Commit**

```bash
git add packages/domain/tests/use-cases/get-document-content.test.ts \
        packages/domain/src/use-cases/get-document-content.ts
git commit -m "fix(domain): reject get-document-content when fileNode belongs to a different project"
```

---

## Task 3 — Issue 3: NaN `effectiveLimit` bypasses size guard in `upload-asset`

**Files:**
- Test: `packages/domain/tests/use-cases/upload-asset.test.ts` (add test)
- Fix: `packages/domain/src/use-cases/upload-asset.ts` (add NaN fallback)

- [ ] **Step 3.1 — Write the failing test**

The `InMemorySystemSettingRepository` has a `set(key, value)` method. Set a non-numeric string value, then verify upload is still rejected when the bytes exceed the default limit.

Add inside the existing `describe('UploadAssetUseCase')` block in `packages/domain/tests/use-cases/upload-asset.test.ts`:

```typescript
it('falls back to defaultMaxUploadSizeBytes when DB setting is a non-numeric string', async () => {
  // Store a non-numeric value — Number('not-a-number') → NaN
  await systemSettingRepo.set(SETTING_MAX_UPLOAD_SIZE_BYTES, 'not-a-number');
  const smallMax = new UploadAssetUseCase(
    projectMemberRepo,
    fileNodeRepo,
    assetRepo,
    fileStore,
    systemSettingRepo,
    50, // tiny default — any file > 50 bytes must be rejected
  );
  const tooBig = Buffer.alloc(100, 0x42);
  const result = await smallMax.execute(
    actorId,
    projectId,
    rootFolderId,
    'big.png',
    MimeType.create('image/png'),
    tooBig,
  );
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error).toBeInstanceOf(ValidationError);
  }
});
```

- [ ] **Step 3.2 — Run the test and confirm it fails**

```bash
pnpm --filter @asciidocollab/domain jest -- --testPathPattern="upload-asset" --no-coverage
```

Expected: FAIL — `expect(result.success).toBe(false)` fails because `bytes.length > NaN` is always `false`, so the upload passes the size check.

- [ ] **Step 3.3 — Implement the fix**

In `packages/domain/src/use-cases/upload-asset.ts`, replace line 67:

```typescript
const effectiveLimit = stored === null ? this.defaultMaxUploadSizeBytes : Number(stored);
```

with:

```typescript
const parsed = stored === null ? Number.NaN : Number(stored);
const effectiveLimit = Number.isNaN(parsed) ? this.defaultMaxUploadSizeBytes : parsed;
```

- [ ] **Step 3.4 — Run the test and confirm green**

```bash
pnpm --filter @asciidocollab/domain jest -- --testPathPattern="upload-asset" --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 3.5 — Commit**

```bash
git add packages/domain/tests/use-cases/upload-asset.test.ts \
        packages/domain/src/use-cases/upload-asset.ts
git commit -m "fix(domain): fall back to defaultMaxUploadSizeBytes when DB setting is non-numeric"
```

---

## Task 4 — Issue 7: Empty-file `ValidationError` returns HTTP 413 instead of 400 in `assets` route

> Issue 7 is simpler than Issue 4 and can be done first since both touch the same route file.

**Files:**
- Test: `apps/api/tests/routes/assets-validation.test.ts` (new file)
- Fix: `apps/api/src/routes/projects/assets.ts` (add empty-file branch before the catch-all 413)

- [ ] **Step 4.1 — Write the failing test**

Create `apps/api/tests/routes/assets-validation.test.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('assets route — ValidationError branching', () => {
  const source = readFileSync(
    join(__dirname, '../../src/routes/projects/assets.ts'),
    'utf8',
  );

  it('empty-file case is handled with a distinct check before the catch-all 413', () => {
    // The handler must branch on 'File must not be empty' and NOT fall through to 413.
    // Verify the route source distinguishes the empty-file message from the size message.
    expect(source).toMatch(/File must not be empty/);
  });

  it('empty-file branch returns 400, not 413', () => {
    // Find the ValidationError block and verify the empty-file arm sends status(400)
    const validationBlock = source.match(/instanceof ValidationError\)([\s\S]*?)(?=if \(result\.error instanceof FileConflictError)/)?.[1] ?? '';
    // The block must contain a 400 response for the empty-file case
    expect(validationBlock).toMatch(/status\(400\)/);
  });
});
```

- [ ] **Step 4.2 — Run the test and confirm it fails**

```bash
pnpm --filter @asciidocollab/api jest -- --testPathPattern="assets-validation" --no-coverage
```

Expected: FAIL — the current route source has no `'File must not be empty'` string and no `status(400)` inside the ValidationError block.

- [ ] **Step 4.3 — Implement the fix**

In `apps/api/src/routes/projects/assets.ts`, replace the `ValidationError` handler (currently lines 54-58):

```typescript
if (result.error instanceof ValidationError) {
  if (result.error.message.includes('MIME type')) {
    return reply.status(415).send({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: result.error.message } });
  }
  if (result.error.message.includes('File must not be empty')) {
    return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: result.error.message } });
  }
  return reply.status(413).send({ error: { code: 'FILE_TOO_LARGE', message: 'File exceeds maximum permitted size' } });
}
```

- [ ] **Step 4.4 — Run the test and confirm green**

```bash
pnpm --filter @asciidocollab/api jest -- --testPathPattern="assets-validation" --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 4.5 — Commit**

```bash
git add apps/api/tests/routes/assets-validation.test.ts \
        apps/api/src/routes/projects/assets.ts
git commit -m "fix(api): return 400 for empty-file upload instead of mis-routing to 413 FILE_TOO_LARGE"
```

---

## Task 5 — Issue 4: Missing `parentId` query param → unhandled exception → 500

**Files:**
- Test: `apps/api/tests/routes/assets-validation.test.ts` (add tests to file from Task 4)
- Fix: `apps/api/src/routes/projects/assets.ts` (validate `parentId` presence before use)

- [ ] **Step 5.1 — Write the failing test**

Add to the existing `describe` in `apps/api/tests/routes/assets-validation.test.ts`:

```typescript
it('parentId is validated as a UUID string before being used', () => {
  // The route must not pass request.query.parentId directly to FileNodeId.create
  // without a prior existence check or schema validation.
  // Verify the source either has a Fastify JSON schema requiring parentId,
  // or an explicit presence guard before FileNodeId.create.
  const hasSchemaRequired = source.includes("required: ['parentId']") ||
    source.includes('required: ["parentId"]') ||
    source.includes("'parentId': { type: 'string'") ||
    source.includes('"parentId": { type: "string"');
  const hasGuard = source.match(/parentId[\s\S]{0,60}?FileNodeId\.create/) !== null &&
    (source.includes('if (!request.query.parentId)') ||
     source.includes("if (!parentId)") ||
     source.includes('parentId == null') ||
     source.includes('parentId === undefined'));
  expect(hasSchemaRequired || hasGuard).toBe(true);
});
```

- [ ] **Step 5.2 — Run the test and confirm it fails**

```bash
pnpm --filter @asciidocollab/api jest -- --testPathPattern="assets-validation" --no-coverage
```

Expected: FAIL — neither a schema nor an explicit guard exists; `FileNodeId.create(undefined)` is called raw.

- [ ] **Step 5.3 — Implement the fix**

In `apps/api/src/routes/projects/assets.ts`, add an explicit guard before `FileNodeId.create`. Replace:

```typescript
const parentId = FileNodeId.create(request.query.parentId);
```

with:

```typescript
if (!request.query.parentId) {
  return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'parentId query parameter is required' } });
}
const parentId = FileNodeId.create(request.query.parentId);
```

- [ ] **Step 5.4 — Run the test and confirm green**

```bash
pnpm --filter @asciidocollab/api jest -- --testPathPattern="assets-validation" --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 5.5 — Commit**

```bash
git add apps/api/tests/routes/assets-validation.test.ts \
        apps/api/src/routes/projects/assets.ts
git commit -m "fix(api): return 400 when parentId query param is missing on asset upload"
```

---

## Task 6 — Issue 5: No filesystem rollback in `rename-file` when DB save fails

**Files:**
- Test: `packages/domain/tests/use-cases/rename-file.test.ts` (add test)
- Fix: `packages/domain/src/use-cases/rename-file.ts` (wrap DB save in try/catch with rollback)

- [ ] **Step 6.1 — Write the failing test**

Add this test to `packages/domain/tests/use-cases/rename-file.test.ts`. It needs a fileStore and a repo that throws on `save` after a successful `move`. Read the full existing test first to understand the `beforeEach` setup — the test below must add a `fileStore` to the use case constructor and prime it with the file.

Add at the bottom of the `describe` block (before the closing `}`), adding the necessary imports (`InMemoryProjectFileStore`) at the top of the file if not already present:

```typescript
describe('rename-file with fileStore — filesystem rollback on DB failure', () => {
  let projectRepo: InMemoryProjectRepository;
  let fileNodeRepo: InMemoryFileNodeRepository;
  let projectMemberRepo: InMemoryProjectMemberRepository;
  let auditLogRepo: InMemoryAuditLogRepository;
  let fileStore: InMemoryProjectFileStore;

  const actorId = UserId.create('550e8400-e29b-41d4-a716-446655440001');
  const projectId = ProjectId.create('770e8400-e29b-41d4-a716-446655440003');
  const rootFolderId = FileNodeId.create('880e8400-e29b-41d4-a716-446655440004');
  const fileNodeId = FileNodeId.create('990e8400-e29b-41d4-a716-446655440005');

  beforeEach(async () => {
    projectRepo = new InMemoryProjectRepository();
    fileNodeRepo = new InMemoryFileNodeRepository();
    projectMemberRepo = new InMemoryProjectMemberRepository();
    auditLogRepo = new InMemoryAuditLogRepository();
    fileStore = new InMemoryProjectFileStore();

    const project = new Project(projectId, ProjectName.create('Test Project'), null, [], rootFolderId);
    await projectRepo.save(project);

    const rootFolder = new FileNode(rootFolderId, projectId, null, 'Test Project', FileNodeType.create('folder'), FilePath.create('/'));
    await fileNodeRepo.save(rootFolder);

    const fileNode = new FileNode(fileNodeId, projectId, rootFolderId, 'original.txt', FileNodeType.create('file'), FilePath.create('/original.txt'));
    await fileNodeRepo.save(fileNode);

    await fileStore.write(projectId, FilePath.create('/original.txt'), Buffer.from('content'));

    await projectMemberRepo.addMember(new ProjectMember(projectId, actorId, Role.create('editor')));
  });

  it('rolls back filesystem rename when fileNodeRepo.save throws after fileStore.move succeeds', async () => {
    // Make fileNodeRepo.save throw after the first call (which is for the updated file node)
    const originalSave = fileNodeRepo.save.bind(fileNodeRepo);
    let callCount = 0;
    fileNodeRepo.save = jest.fn(async (node) => {
      callCount++;
      if (callCount === 1) throw new Error('DB failure');
      return originalSave(node);
    });

    const useCase = new RenameFileUseCase(projectMemberRepo, fileNodeRepo, auditLogRepo, fileStore);
    const result = await useCase.execute(actorId, fileNodeId, 'renamed.txt', projectId);

    // The use case should surface the error (not silently swallow it)
    expect(result.success).toBe(false);

    // The file must still be accessible at the ORIGINAL path (rollback succeeded)
    const originalContent = await fileStore.read(projectId, FilePath.create('/original.txt'));
    expect(originalContent).not.toBeNull();

    // The file must NOT exist at the new path (rollback removed it)
    const newContent = await fileStore.read(projectId, FilePath.create('/renamed.txt'));
    expect(newContent).toBeNull();
  });
});
```

Add the missing imports at the top of the test file if not already present:
```typescript
import { InMemoryProjectFileStore } from '../storage/in-memory-project-file-store';
import { Project } from '../../src/entities/project';
import { ProjectMember } from '../../src/entities/project-member';
import { ProjectName } from '../../src/value-objects/project-name';
import { Role } from '../../src/value-objects/role';
```

- [ ] **Step 6.2 — Run the test and confirm it fails**

```bash
pnpm --filter @asciidocollab/domain jest -- --testPathPattern="rename-file" --no-coverage
```

Expected: FAIL — the DB throw propagates uncaught. The file now exists at `/renamed.txt` (no rollback), so `expect(newContent).toBeNull()` fails. The use case also throws instead of returning a Result, so `result.success` check may throw instead.

- [ ] **Step 6.3 — Implement the fix**

In `packages/domain/src/use-cases/rename-file.ts`, wrap the post-move DB operations in a try/catch that rolls back the filesystem move on failure. Replace from line 64 down to the `auditLogRepo.save` call:

```typescript
if (this.fileStore) {
  const moveResult = await this.fileStore.move(projectId, fileNode.path, newPath);
  if (!moveResult.success) {
    return { success: false, error: moveResult.error };
  }
}

try {
  const updatedFileNode = new FileNode(
    fileNode.id,
    fileNode.projectId,
    fileNode.parentId,
    newName,
    fileNode.type,
    newPath,
    new Timestamps(fileNode.createdAt, new Date()),
  );

  await this.fileNodeRepo.save(updatedFileNode);

  if (fileNode.type.value === 'folder') {
    await this.cascadePathUpdate(fileNodeId, fileNode.path.value + '/', newPath.value + '/');
  }
} catch (error) {
  // DB save failed — roll back the filesystem rename to keep FS and DB in sync.
  if (this.fileStore) {
    await this.fileStore.move(projectId, newPath, fileNode.path);
  }
  throw error;
}
```

Note: the `FileNode` constructor call and `Timestamps` import must already be present; the old code placed them outside the try block. Move them inside.

- [ ] **Step 6.4 — Run the test and confirm green**

```bash
pnpm --filter @asciidocollab/domain jest -- --testPathPattern="rename-file" --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 6.5 — Commit**

```bash
git add packages/domain/tests/use-cases/rename-file.test.ts \
        packages/domain/src/use-cases/rename-file.ts
git commit -m "fix(domain): roll back filesystem rename when fileNodeRepo.save fails in rename-file"
```

---

## Task 7 — Issue 6: Orphaned Yjs blob when `yjsStateStore.delete` throws in `delete-file`

**Files:**
- Test: `packages/domain/tests/use-cases/delete-file.test.ts` (add test)
- Fix: `packages/domain/src/use-cases/delete-file.ts` (wrap `yjsStateStore.delete` in try/catch)

- [ ] **Step 7.1 — Write the failing test**

Add this `describe` block at the bottom of `packages/domain/tests/use-cases/delete-file.test.ts`:

```typescript
describe('DeleteFileUseCase — yjsStateStore failure tolerance', () => {
  let fileNodeRepo2: InMemoryFileNodeRepository;
  let projectMemberRepo2: InMemoryProjectMemberRepository;
  let auditLogRepo2: InMemoryAuditLogRepository;
  let documentRepo2: InMemoryDocumentRepository;
  let fileStore2: InMemoryProjectFileStore;

  const actorId2 = UserId.create('550e8400-e29b-41d4-a716-446655440001');
  const projectId2 = ProjectId.create('770e8400-e29b-41d4-a716-446655440003');
  const rootFolderId2 = FileNodeId.create('880e8400-e29b-41d4-a716-446655440004');
  const fileNodeId2 = FileNodeId.create('aa0e8400-e29b-41d4-a716-446655440006');

  beforeEach(async () => {
    fileNodeRepo2 = new InMemoryFileNodeRepository();
    projectMemberRepo2 = new InMemoryProjectMemberRepository();
    auditLogRepo2 = new InMemoryAuditLogRepository();
    documentRepo2 = new InMemoryDocumentRepository();
    fileStore2 = new InMemoryProjectFileStore();

    const rootFolder2 = new FileNode(rootFolderId2, projectId2, null, 'root', FileNodeType.create('folder'), FilePath.create('/'));
    await fileNodeRepo2.save(rootFolder2);

    const fn2 = new FileNode(fileNodeId2, projectId2, rootFolderId2, 'doc.adoc', FileNodeType.create('file'), FilePath.create('/doc.adoc'));
    await fileNodeRepo2.save(fn2);

    const doc2 = new Document(
      DocumentId.create('bb0e8400-e29b-41d4-a716-446655440007'),
      fileNodeId2,
      ContentId.create('cc0e8400-e29b-41d4-a716-446655440008'),
      YjsStateId.create('dd0e8400-e29b-41d4-a716-446655440009'),
      MimeType.create('text/asciidoc'),
    );
    await documentRepo2.save(doc2);
    await fileStore2.write(projectId2, FilePath.create('/doc.adoc'), Buffer.from('hello'));
    await projectMemberRepo2.addMember(new ProjectMember(projectId2, actorId2, Role.create('editor')));
  });

  it('returns success even when yjsStateStore.delete throws — deletion is semantically complete once DB rows are removed', async () => {
    const throwingYjsStore = {
      delete: jest.fn().mockRejectedValue(new Error('Yjs store unavailable')),
      deleteAllForProject: jest.fn().mockResolvedValue(undefined),
    } as unknown as InMemoryYjsStateStore;

    const useCase2 = new DeleteFileUseCase(
      projectMemberRepo2,
      fileNodeRepo2,
      documentRepo2,
      auditLogRepo2,
      fileStore2,
      throwingYjsStore,
    );

    const result = await useCase2.execute(actorId2, fileNodeId2, projectId2);
    expect(result.success).toBe(true);
  });
});
```

Add missing imports at the top of the test file (check which are already there):
```typescript
import { InMemoryProjectFileStore } from '../storage/in-memory-project-file-store';
import { InMemoryYjsStateStore } from '../storage/in-memory-yjs-state-store';
import { ContentId } from '../../src/value-objects/content-id';
import { MimeType } from '../../src/value-objects/mime-type';
import { ProjectMember } from '../../src/entities/project-member';
import { Role } from '../../src/value-objects/role';
```

- [ ] **Step 7.2 — Run the test and confirm it fails**

```bash
pnpm --filter @asciidocollab/domain jest -- --testPathPattern="delete-file" --no-coverage
```

Expected: FAIL — the `yjsStateStore.delete` throws and the exception propagates, causing `useCase.execute` to throw rather than returning `{ success: true }`.

- [ ] **Step 7.3 — Implement the fix**

In `packages/domain/src/use-cases/delete-file.ts`, wrap the `yjsStateStore.delete` call (line 77) in a try/catch:

```typescript
if (document && this.yjsStateStore) {
  try {
    await this.yjsStateStore.delete(projectId, document.yjsStateId);
  } catch {
    // Yjs state cleanup failed; DB records are already deleted so the deletion
    // is semantically complete. The orphaned blob will need manual cleanup.
  }
}
```

- [ ] **Step 7.4 — Run the test and confirm green**

```bash
pnpm --filter @asciidocollab/domain jest -- --testPathPattern="delete-file" --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 7.5 — Commit**

```bash
git add packages/domain/tests/use-cases/delete-file.test.ts \
        packages/domain/src/use-cases/delete-file.ts
git commit -m "fix(domain): swallow yjsStateStore.delete errors in delete-file — deletion is complete once DB rows are gone"
```

---

## Task 8 — Issue 8: `Asset → Project` missing `onDelete: Cascade` causes FK violation on project delete

**Files:**
- Test: `apps/api/tests/routes/prisma-schema-cascades.test.ts` (new file)
- Fix: `packages/db/prisma/schema.prisma` (add `onDelete: Cascade` to Asset.project relation)
- Migration: run `pnpm --filter @asciidocollab/db prisma migrate dev --name add-asset-project-cascade`

- [ ] **Step 8.1 — Write the failing test**

Create `apps/api/tests/routes/prisma-schema-cascades.test.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Prisma schema — cascade delete invariants', () => {
  const schema = readFileSync(
    join(__dirname, '../../../packages/db/prisma/schema.prisma'),
    'utf8',
  );

  it('Asset.project relation has onDelete: Cascade so project deletion does not fail with FK violation', () => {
    // Find the Asset model block
    const assetModelMatch = schema.match(/model Asset \{([\s\S]*?)\n\}/);
    expect(assetModelMatch).not.toBeNull();
    const assetModel = assetModelMatch![1];
    // The project relation line must include onDelete: Cascade
    expect(assetModel).toMatch(/onDelete:\s*Cascade/);
  });
});
```

- [ ] **Step 8.2 — Run the test and confirm it fails**

```bash
pnpm --filter @asciidocollab/api jest -- --testPathPattern="prisma-schema-cascades" --no-coverage
```

Expected: FAIL — the `Asset` model currently has `project  Project @relation(fields: [projectId], references: [id])` with no `onDelete` clause.

- [ ] **Step 8.3 — Implement the fix**

In `packages/db/prisma/schema.prisma`, find the `Asset` model (around line 126) and update the `project` relation:

```prisma
project  Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
```

Then create and apply the migration:

```bash
pnpm --filter @asciidocollab/db prisma migrate dev --name add-asset-project-cascade
```

If a dev DB is not available, generate the migration SQL only:

```bash
pnpm --filter @asciidocollab/db prisma migrate diff \
  --from-schema-datamodel packages/db/prisma/schema.prisma \
  --to-schema-datasource packages/db/prisma/schema.prisma \
  --script
```

The migration SQL will be something like:
```sql
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_projectId_fkey";
ALTER TABLE "assets" ADD CONSTRAINT "assets_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 8.4 — Run the test and confirm green**

```bash
pnpm --filter @asciidocollab/api jest -- --testPathPattern="prisma-schema-cascades" --no-coverage
```

Expected: PASS — the schema now has `onDelete: Cascade` on the `Asset.project` relation.

- [ ] **Step 8.5 — Commit**

```bash
git add packages/db/prisma/schema.prisma \
        packages/db/prisma/migrations/ \
        apps/api/tests/routes/prisma-schema-cascades.test.ts
git commit -m "fix(db): add onDelete: Cascade to Asset.project relation to prevent FK violation on project delete"
```

---

## Task 9 — Issue 9: TOCTOU `stat` + `rename` race in `FilesystemProjectFileStore.move`

**Files:**
- Test: `packages/infrastructure/tests/storage/filesystem-project-file-store.test.ts` (add test)
- Fix: `packages/infrastructure/src/storage/filesystem-project-file-store.ts` (use `link`+`unlink` for file moves)

- [ ] **Step 9.1 — Write the failing test**

Add this `describe` block to `packages/infrastructure/tests/storage/filesystem-project-file-store.test.ts`:

```typescript
describe('move — concurrent exclusive moves to the same destination', () => {
  it('when two moves race to the same destination, exactly one succeeds and one returns FileConflictError', async () => {
    await store.write(projectId, FilePath.create('/a.txt'), Buffer.from('a'));
    await store.write(projectId, FilePath.create('/b.txt'), Buffer.from('b'));

    // Fire both moves concurrently; one should win, one should get a conflict.
    const [r1, r2] = await Promise.all([
      store.move(projectId, FilePath.create('/a.txt'), FilePath.create('/dest.txt')),
      store.move(projectId, FilePath.create('/b.txt'), FilePath.create('/dest.txt')),
    ]);

    const successes = [r1, r2].filter((r) => r.success).length;
    const conflicts = [r1, r2].filter((r) => !r.success && r.error instanceof FileConflictError).length;

    expect(successes).toBe(1);
    expect(conflicts).toBe(1);
  });
});
```

Add `FileConflictError` to the imports at the top if not already present (it should already be imported in the existing test file).

- [ ] **Step 9.2 — Run the test and confirm it fails (or is flaky)**

```bash
pnpm --filter @asciidocollab/infrastructure jest -- --testPathPattern="filesystem-project-file-store" --no-coverage
```

Expected: FAIL or FLAKY — with the current `stat` + `rename` approach, both moves may pass the `stat` check before either `rename` executes, resulting in two successes (0 conflicts).

- [ ] **Step 9.3 — Implement the fix**

In `packages/infrastructure/src/storage/filesystem-project-file-store.ts`:

1. Add `link, unlink, stat as statFs` to the imports:
```typescript
import { mkdir, readFile, writeFile, rename, rm, open, stat, link, unlink } from 'node:fs/promises';
```

2. Replace the `move` method:
```typescript
/** Moves a file or directory to toPath atomically; returns FileConflictError if toPath already exists. */
async move(projectId: ProjectId, fromPath: FilePath, toPath: FilePath): Promise<Result<void, FileConflictError>> {
  const absFrom = this.resolveSafe(projectId, fromPath);
  const absTo = this.resolveSafe(projectId, toPath);

  await mkdir(path.dirname(absTo), { recursive: true });

  // Determine if the source is a directory or a regular file.
  const srcStat = await stat(absFrom);

  if (srcStat.isDirectory()) {
    // For directories, use stat + rename (no portable atomic exclusive rename).
    // A TOCTOU window exists here but is acceptable: directory moves are protected
    // at the DB level (FileNode path uniqueness). Document the known race.
    try {
      await stat(absTo);
      return { success: false, error: new FileConflictError(`File already exists at ${toPath.value}`) };
    } catch (error: unknown) {
      if (!isEnoent(error)) throw error;
    }
    await rename(absFrom, absTo);
  } else {
    // For regular files, use link(2) + unlink(2).
    // link(2) is atomic: it fails with EEXIST if the destination already exists,
    // eliminating the TOCTOU window that existed with stat → rename.
    try {
      await link(absFrom, absTo);
    } catch (error: unknown) {
      if (isEexist(error)) {
        return { success: false, error: new FileConflictError(`File already exists at ${toPath.value}`) };
      }
      throw error;
    }
    await unlink(absFrom);
  }

  return { success: true, value: undefined };
}
```

- [ ] **Step 9.4 — Run the test and confirm green**

```bash
pnpm --filter @asciidocollab/infrastructure jest -- --testPathPattern="filesystem-project-file-store" --no-coverage
```

Expected: all tests PASS, including the new concurrent-moves test.

- [ ] **Step 9.5 — Commit**

```bash
git add packages/infrastructure/tests/storage/filesystem-project-file-store.test.ts \
        packages/infrastructure/src/storage/filesystem-project-file-store.ts
git commit -m "fix(infra): use link+unlink for atomic exclusive file moves, eliminating TOCTOU race"
```

---

## Task 10 — Issue 10: Orphaned files on partial DB failure in `create-file` and `upload-asset`

**Files:**
- Test: `packages/domain/tests/use-cases/create-file.test.ts` (add test)
- Test: `packages/domain/tests/use-cases/upload-asset.test.ts` (add test)
- Fix: `packages/domain/src/use-cases/create-file.ts` (wrap post-`createExclusive` DB ops)
- Fix: `packages/domain/src/use-cases/upload-asset.ts` (wrap post-`createExclusive` DB ops)

### Sub-task 10a — `create-file`

- [ ] **Step 10a.1 — Write the failing test**

Add this `describe` block to `packages/domain/tests/use-cases/create-file.test.ts`. Read the existing file first to know what imports and fixtures are in the `beforeEach`:

```typescript
describe('CreateFileUseCase — orphan cleanup on DB failure', () => {
  let projectMemberRepo2: InMemoryProjectMemberRepository;
  let fileNodeRepo2: InMemoryFileNodeRepository;
  let documentRepo2: InMemoryDocumentRepository;
  let fileStore2: InMemoryProjectFileStore;

  const actorId2 = UserId.create('550e8400-e29b-41d4-a716-446655440001');
  const projectId2 = ProjectId.create('770e8400-e29b-41d4-a716-446655440003');
  const rootFolderId2 = FileNodeId.create('880e8400-e29b-41d4-a716-446655440004');

  beforeEach(async () => {
    projectMemberRepo2 = new InMemoryProjectMemberRepository();
    fileNodeRepo2 = new InMemoryFileNodeRepository();
    documentRepo2 = new InMemoryDocumentRepository();
    fileStore2 = new InMemoryProjectFileStore();

    const rootFolder2 = new FileNode(
      rootFolderId2, projectId2, null, 'root',
      FileNodeType.create('folder'), FilePath.create('/'),
    );
    await fileNodeRepo2.save(rootFolder2);
    await projectMemberRepo2.addMember(new ProjectMember(projectId2, actorId2, Role.create('editor')));
  });

  it('cleans up the disk file when fileNodeRepo.save throws after createExclusive succeeds', async () => {
    fileNodeRepo2.save = jest.fn().mockRejectedValue(new Error('DB down'));

    const useCase2 = new CreateFileUseCase(projectMemberRepo2, fileNodeRepo2, documentRepo2, fileStore2);

    await expect(
      useCase2.execute(actorId2, projectId2, rootFolderId2, 'new.adoc', MimeType.create('text/asciidoc'), Buffer.from(''))
    ).rejects.toThrow('DB down');

    // The file must have been cleaned up — no orphan on disk
    const orphan = await fileStore2.read(projectId2, FilePath.create('/new.adoc'));
    expect(orphan).toBeNull();
  });
});
```

Add missing imports at the top of `create-file.test.ts` if not already present:
```typescript
import { InMemoryProjectFileStore } from '../storage/in-memory-project-file-store';
import { ProjectMember } from '../../src/entities/project-member';
import { Role } from '../../src/value-objects/role';
import { MimeType } from '../../src/value-objects/mime-type';
```

- [ ] **Step 10a.2 — Run the test and confirm it fails**

```bash
pnpm --filter @asciidocollab/domain jest -- --testPathPattern="create-file" --no-coverage
```

Expected: FAIL — `fileStore2.read(...)` returns the file bytes (not null) because there is no cleanup when `fileNodeRepo.save` throws.

- [ ] **Step 10a.3 — Implement the fix**

In `packages/domain/src/use-cases/create-file.ts`, wrap the post-`createExclusive` DB operations in a try/catch:

```typescript
const storeResult = await this.fileStore.createExclusive(projectId, newPath, initialContent);
if (!storeResult.success) {
  return { success: false, error: storeResult.error };
}

try {
  const fileNodeId = FileNodeId.create(randomUUID());
  const fileNode = new FileNode(fileNodeId, projectId, parentId, name, FileNodeType.create('file'), newPath);
  await this.fileNodeRepo.save(fileNode);

  const documentId = DocumentId.create(randomUUID());
  const document = new Document(
    documentId,
    fileNodeId,
    ContentId.create(randomUUID()),
    YjsStateId.create(randomUUID()),
    mimeType,
  );
  await this.documentRepo.save(document);

  return { success: true, value: { fileNodeId, path: newPath } };
} catch (error) {
  // Roll back the exclusive file creation so the path is not permanently reserved.
  await this.fileStore.remove(projectId, newPath);
  throw error;
}
```

- [ ] **Step 10a.4 — Run the test and confirm green**

```bash
pnpm --filter @asciidocollab/domain jest -- --testPathPattern="create-file" --no-coverage
```

Expected: all tests PASS.

### Sub-task 10b — `upload-asset`

- [ ] **Step 10b.1 — Write the failing test**

Add this test inside the existing `describe('UploadAssetUseCase')` block in `packages/domain/tests/use-cases/upload-asset.test.ts`:

```typescript
it('cleans up the disk file when assetRepo.save throws after createExclusive succeeds', async () => {
  assetRepo.save = jest.fn().mockRejectedValue(new Error('DB down'));

  await expect(
    useCase.execute(actorId, projectId, rootFolderId, 'fail.png', MimeType.create('image/png'), smallBytes)
  ).rejects.toThrow('DB down');

  // The file must have been cleaned up — no orphan on disk
  const orphan = await fileStore.read(projectId, FilePath.create('/fail.png'));
  expect(orphan).toBeNull();
});
```

- [ ] **Step 10b.2 — Run the test and confirm it fails**

```bash
pnpm --filter @asciidocollab/domain jest -- --testPathPattern="upload-asset" --no-coverage
```

Expected: FAIL — `fileStore.read(...)` returns the bytes (not null) because there is no cleanup on DB failure.

- [ ] **Step 10b.3 — Implement the fix**

In `packages/domain/src/use-cases/upload-asset.ts`, wrap the post-`createExclusive` DB operations in a try/catch:

```typescript
const storeResult = await this.fileStore.createExclusive(projectId, filePath, bytes);
if (!storeResult.success) {
  return { success: false, error: storeResult.error };
}

try {
  const fileNodeId = FileNodeId.create(randomUUID());
  const fileNode = new FileNode(fileNodeId, projectId, parentId, filename, FileNodeType.create('file'), filePath);
  await this.fileNodeRepo.save(fileNode);

  const assetId = AssetId.create(randomUUID());
  const asset = new Asset(assetId, projectId, filename, storagePath, mimeType, bytes.length, null);
  await this.assetRepo.save(asset);

  return { success: true, value: { assetId, fileNodeId, storagePath } };
} catch (error) {
  // Roll back the exclusive file creation so the path is not permanently reserved.
  await this.fileStore.remove(projectId, filePath);
  throw error;
}
```

- [ ] **Step 10b.4 — Run the test and confirm green**

```bash
pnpm --filter @asciidocollab/domain jest -- --testPathPattern="upload-asset" --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 10b.5 — Commit**

```bash
git add packages/domain/tests/use-cases/create-file.test.ts \
        packages/domain/src/use-cases/create-file.ts \
        packages/domain/tests/use-cases/upload-asset.test.ts \
        packages/domain/src/use-cases/upload-asset.ts
git commit -m "fix(domain): clean up orphaned disk files when DB save fails after createExclusive in create-file and upload-asset"
```

---

## Task 11 — Run All Quality Gates

- [ ] **Step 11.1 — Run the full test suite**

```bash
pnpm test
```

Expected: all tests PASS across all packages.

- [ ] **Step 11.2 — Run type-check**

```bash
pnpm typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 11.3 — Run linter**

```bash
pnpm lint
```

Expected: no lint errors.

- [ ] **Step 11.4 — Run security audit**

```bash
pnpm audit
```

Expected: no high or critical vulnerabilities.

---

## Task 12 — Improve Test Quality and Coverage

After all issues are fixed and quality gates pass, review the new tests against the TDD checklist and improve as needed.

- [ ] **Step 12.1 — Review for testing real behavior vs. implementation**

For Issue 5 (rename rollback), check that the test verifies observable state (files at correct paths) and not just mock call counts. ✓ Already done this way in the plan.

For Issue 6 (Yjs tolerance), confirm the test doesn't just check `throwingYjsStore.delete` was called — it should confirm `result.success === true`.

For Issues 1 & 2 (ownership), add a complementary positive test: a member of project A with a fileNodeId from project A CAN still access content (regression guard). This test likely already passes since the existing positive tests cover it.

- [ ] **Step 12.2 — Add edge-case tests for Issue 3 (NaN guard)**

Add a test for the empty-string edge case:

```typescript
it('falls back to defaultMaxUploadSizeBytes when DB setting is an empty string', async () => {
  await systemSettingRepo.set(SETTING_MAX_UPLOAD_SIZE_BYTES, '');
  const smallMax = new UploadAssetUseCase(
    projectMemberRepo, fileNodeRepo, assetRepo, fileStore, systemSettingRepo, 50,
  );
  const tooBig = Buffer.alloc(100, 0x42);
  const result = await smallMax.execute(
    actorId, projectId, rootFolderId, 'big.png', MimeType.create('image/png'), tooBig,
  );
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error).toBeInstanceOf(ValidationError);
  }
});
```

Note: `Number('') === 0`, which means `bytes.length > 0` is true for any non-empty file, so an empty-string setting would cause ALL non-empty uploads to be rejected. This is a related configuration hazard worth a test.

- [ ] **Step 12.3 — Add integration-level test for Issue 4 (parentId guard)**

The current source-scanning test for Issue 4 is structural. Add a runtime test using a Fastify `inject` call with a missing `parentId` to verify the actual HTTP response is 400:

Create or extend `apps/api/tests/routes/assets-validation.test.ts` with a Fastify runtime test (see the pattern in `keybindings.test.ts` for how to build a test server with mocked repos and auth):

```typescript
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
    asset: { save: jest.fn() },
    systemSetting: { get: jest.fn().mockResolvedValue(null) },
  } as never);
  app.decorate('stores', { fileStore: {} } as never);
  app.decorate('config', { storage: { maxUploadSizeBytes: 20_971_520 } } as never);
  app.decorate('fileTreeEventBus', { emit: jest.fn() } as never);
  await app.register(assetsRoutes);
  await app.ready();
  return app;
}

describe('assets route — parentId validation at runtime', () => {
  it('returns 400 when parentId query param is missing', async () => {
    const app = await buildAssetsTestServer();
    const response = await app.inject({
      method: 'POST',
      url: '/projects/770e8400-e29b-41d4-a716-446655440003/assets',
      // No parentId in query string — triggers the guard
      headers: { 'content-type': 'multipart/form-data; boundary=boundary' },
      payload: '--boundary\r\nContent-Disposition: form-data; name="file"; filename="test.png"\r\nContent-Type: image/png\r\n\r\nhello\r\n--boundary--\r\n',
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
```

- [ ] **Step 12.4 — Run the full test suite one final time to confirm all improvements are green**

```bash
pnpm test
```

Expected: all tests PASS.

- [ ] **Step 12.5 — Final commit**

```bash
git add -p  # stage only test improvements
git commit -m "test: improve edge-case and runtime coverage for code-review bug fixes"
```
