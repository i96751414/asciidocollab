# Code-Review Bug Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 10 confirmed/plausible bugs found in the 011-project-file-storage code review: IDOR cross-project access, stale descendant paths, wrong SSE event ID for uploads, wrong folder ID on 409, missing MIME allowlist, zero-byte upload crash, missing Yjs cleanup on folder delete, missing SSE event for combined rename+move, disk-before-DB ordering in save-document, and multipart size limit mismatch.

**Architecture:** All domain-layer fixes are pure TypeScript with the existing Result pattern — no new dependencies. Route-layer fixes touch Fastify handlers only. The client-side 409 fix threads an `existingFileNodeId` field through error, API function, and hook.

**Tech Stack:** TypeScript, Jest, Fastify, Prisma (domain tests use in-memory fakes)

---

## Task 1: IDOR — cross-project node access in domain use cases

**Files:**
- Modify: `packages/domain/src/use-cases/delete-file.ts` (line 56: add projectId check after findById)
- Modify: `packages/domain/src/use-cases/move-file.ts` (line 37, 46: add projectId checks)
- Modify: `packages/domain/src/use-cases/rename-file.ts` (line 54: add projectId check)
- Modify: `packages/domain/src/use-cases/get-asset-content.ts` (line 37: add projectId check)
- Modify: `packages/domain/src/use-cases/upload-asset.ts` (line 57: add projectId check on parent folder)
- Test: `packages/domain/tests/use-cases/delete-file.test.ts`
- Test: `packages/domain/tests/use-cases/move-file.test.ts`
- Test: `packages/domain/tests/use-cases/rename-file.test.ts`
- Test: `packages/domain/tests/use-cases/get-asset-content.test.ts`
- Test: `packages/domain/tests/use-cases/upload-asset.test.ts`

- [ ] **Step 1: Write failing tests — one per use case**

Add to `packages/domain/tests/use-cases/delete-file.test.ts` (inside the existing `describe` block, after existing tests):

```typescript
it('returns FileNodeNotFoundError when the file node belongs to a different project', async () => {
  const otherProjectId = ProjectId.create('ff0e8400-e29b-41d4-a716-446655440099');
  const alienNodeId = FileNodeId.create('ee0e8400-e29b-41d4-a716-446655440011');
  const alienNode = new FileNode(
    alienNodeId,
    otherProjectId,
    rootFolderId,
    'alien.adoc',
    FileNodeType.create('file'),
    FilePath.create('/alien.adoc'),
  );
  await fileNodeRepo.save(alienNode);

  // actor is a member of projectId, but alienNode belongs to otherProjectId
  const result = await useCase.execute(actorId, alienNodeId, projectId);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error).toBeInstanceOf(FileNodeNotFoundError);
  }
});
```

Add to `packages/domain/tests/use-cases/move-file.test.ts` (inside the existing `describe` block):

```typescript
it('returns FileNodeNotFoundError when fileNode belongs to a different project', async () => {
  const otherProjectId = ProjectId.create('ff0e8400-e29b-41d4-a716-446655440099');
  const alienNodeId = FileNodeId.create('ee0e8400-e29b-41d4-a716-446655440011');
  const alienNode = new FileNode(
    alienNodeId,
    otherProjectId,
    null,
    'alien.adoc',
    FileNodeType.create('file'),
    FilePath.create('/alien.adoc'),
  );
  await fileNodeRepo.save(alienNode);

  const result = await useCase.execute(actorId, projectId, alienNodeId, subFolderId);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error).toBeInstanceOf(FileNodeNotFoundError);
  }
});

it('returns FileNodeNotFoundError when newParent belongs to a different project', async () => {
  const otherProjectId = ProjectId.create('ff0e8400-e29b-41d4-a716-446655440099');
  const alienFolderId = FileNodeId.create('ee0e8400-e29b-41d4-a716-446655440012');
  const alienFolder = new FileNode(
    alienFolderId,
    otherProjectId,
    null,
    'alienfolder',
    FileNodeType.create('folder'),
    FilePath.create('/alienfolder'),
  );
  await fileNodeRepo.save(alienFolder);

  const result = await useCase.execute(actorId, projectId, fileNodeId, alienFolderId);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error).toBeInstanceOf(FileNodeNotFoundError);
  }
});
```

Add to `packages/domain/tests/use-cases/rename-file.test.ts` (inside the existing `describe` block):

```typescript
it('returns FileNodeNotFoundError when the file node belongs to a different project', async () => {
  const otherProjectId = ProjectId.create('ff0e8400-e29b-41d4-a716-446655440099');
  const alienNodeId = FileNodeId.create('ee0e8400-e29b-41d4-a716-446655440013');
  const alienNode = new FileNode(
    alienNodeId,
    otherProjectId,
    rootFolderId,
    'alien.adoc',
    FileNodeType.create('file'),
    FilePath.create('/alien.adoc'),
  );
  await fileNodeRepo.save(alienNode);

  const result = await useCase.execute(actorId, alienNodeId, 'new-name.adoc', projectId);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error).toBeInstanceOf(FileNodeNotFoundError);
  }
});
```

Add to `packages/domain/tests/use-cases/get-asset-content.test.ts` (inside the existing `describe` block):

```typescript
it('returns FileNodeNotFoundError when the image belongs to a different project', async () => {
  const otherProjectId = ProjectId.create('ff0e8400-e29b-41d4-a716-446655440099');
  const alienAssetId = ImageId.create('cc0e8400-e29b-41d4-a716-446655440010');
  // Note: Image constructor requires sizeBytes > 0
  const alienImage = new Image(alienAssetId, otherProjectId, 'secret.png', '/secret.png', MimeType.create('image/png'), 100, null);
  await imageRepo.save(alienImage);

  // actor is a member of projectId, but alienImage belongs to otherProjectId
  const result = await useCase.execute(actorId, projectId, alienAssetId);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error).toBeInstanceOf(FileNodeNotFoundError);
  }
});
```

Add to `packages/domain/tests/use-cases/upload-asset.test.ts` (inside the existing `describe` block):

```typescript
it('returns FileNodeNotFoundError when parentId belongs to a different project', async () => {
  const otherProjectId = ProjectId.create('ff0e8400-e29b-41d4-a716-446655440099');
  const alienFolderId = FileNodeId.create('ee0e8400-e29b-41d4-a716-446655440014');
  const alienFolder = new FileNode(
    alienFolderId,
    otherProjectId,
    null,
    'alienroot',
    FileNodeType.create('folder'),
    FilePath.create('/'),
  );
  await fileNodeRepo.save(alienFolder);

  const result = await useCase.execute(actorId, projectId, alienFolderId, 'img.png', MimeType.create('image/png'), smallBytes);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error).toBeInstanceOf(FileNodeNotFoundError);
  }
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/joao/Development/asciidocollab && pnpm --filter @asciidocollab/domain test -- --testPathPattern="delete-file|move-file|rename-file|get-asset-content|upload-asset" 2>&1 | tail -30
```

Expected: 5 new tests fail (IDOR checks not yet implemented).

- [ ] **Step 3: Implement the fixes**

In `packages/domain/src/use-cases/delete-file.ts`, replace the findById + null check:

```typescript
// Old:
const fileNode = await this.fileNodeRepo.findById(fileNodeId);
if (!fileNode) {
  return { success: false, error: new FileNodeNotFoundError(fileNodeId.value) };
}

// New:
const fileNode = await this.fileNodeRepo.findById(fileNodeId);
if (!fileNode || fileNode.projectId.value !== projectId.value) {
  return { success: false, error: new FileNodeNotFoundError(fileNodeId.value) };
}
```

In `packages/domain/src/use-cases/move-file.ts`, update both findById checks:

```typescript
// After "const fileNode = await this.fileNodeRepo.findById(fileNodeId);"
if (!fileNode || fileNode.projectId.value !== projectId.value) {
  return { success: false, error: new FileNodeNotFoundError(fileNodeId.value) };
}

// After "const newParent = await this.fileNodeRepo.findById(newParentId);"
if (!newParent || newParent.type.value !== 'folder' || newParent.projectId.value !== projectId.value) {
  return { success: false, error: new FileNodeNotFoundError(newParentId.value) };
}
```

In `packages/domain/src/use-cases/rename-file.ts`, update the findById check:

```typescript
// After "const fileNode = await this.fileNodeRepo.findById(fileNodeId);"
if (!fileNode || fileNode.projectId.value !== projectId.value) {
  return { success: false, error: new FileNodeNotFoundError(fileNodeId.value) };
}
```

In `packages/domain/src/use-cases/get-asset-content.ts`, update the imageRepo.findById check:

```typescript
// After "const image = await this.imageRepo.findById(assetId);"
if (!image || image.projectId.value !== projectId.value) {
  return { success: false, error: new FileNodeNotFoundError(assetId.value) };
}
```

In `packages/domain/src/use-cases/upload-asset.ts`, update the parent findById check:

```typescript
// After "const parent = await this.fileNodeRepo.findById(parentId);"
if (!parent || parent.type.value !== 'folder' || parent.projectId.value !== projectId.value) {
  return { success: false, error: new FileNodeNotFoundError(parentId.value) };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /home/joao/Development/asciidocollab && pnpm --filter @asciidocollab/domain test -- --testPathPattern="delete-file|move-file|rename-file|get-asset-content|upload-asset" 2>&1 | tail -15
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/joao/Development/asciidocollab && git add packages/domain/src/use-cases/delete-file.ts packages/domain/src/use-cases/move-file.ts packages/domain/src/use-cases/rename-file.ts packages/domain/src/use-cases/get-asset-content.ts packages/domain/src/use-cases/upload-asset.ts packages/domain/tests/use-cases/delete-file.test.ts packages/domain/tests/use-cases/move-file.test.ts packages/domain/tests/use-cases/rename-file.test.ts packages/domain/tests/use-cases/get-asset-content.test.ts packages/domain/tests/use-cases/upload-asset.test.ts && git commit -m "$(cat <<'EOF'
fix(security): verify file node and image belong to the requested project before mutating or reading

Closes IDOR: a project member could read/write/delete nodes from other projects
by supplying a valid UUID belonging to a different project while passing the
membership check for their own project.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Zero-byte upload crashes with unhandled exception

**Files:**
- Modify: `packages/domain/src/use-cases/upload-asset.ts`
- Test: `packages/domain/tests/use-cases/upload-asset.test.ts`

- [ ] **Step 1: Write failing test**

Add to `packages/domain/tests/use-cases/upload-asset.test.ts`:

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

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /home/joao/Development/asciidocollab && pnpm --filter @asciidocollab/domain test -- --testPathPattern="upload-asset" 2>&1 | tail -20
```

Expected: The new test fails (currently throws unhandled Error from Image constructor instead of returning ValidationError).

- [ ] **Step 3: Implement fix**

In `packages/domain/src/use-cases/upload-asset.ts`, add an empty-bytes guard immediately after the size-limit check (line ~53):

```typescript
// After the "bytes.length > effectiveLimit" check:
if (bytes.length === 0) {
  return { success: false, error: new ValidationError('File must not be empty') };
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd /home/joao/Development/asciidocollab && pnpm --filter @asciidocollab/domain test -- --testPathPattern="upload-asset" 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/joao/Development/asciidocollab && git add packages/domain/src/use-cases/upload-asset.ts packages/domain/tests/use-cases/upload-asset.test.ts && git commit -m "$(cat <<'EOF'
fix: return ValidationError for zero-byte uploads instead of letting Image constructor throw

The size limit check used strict greater-than so 0 passed through, causing the
Image constructor to throw an unhandled Error that escaped the Result pattern.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: MIME type allowlist — block text/html uploads that enable XSS

**Files:**
- Modify: `packages/domain/src/use-cases/upload-asset.ts`
- Modify: `apps/api/src/routes/projects/images.ts` (Content-Disposition: attachment)
- Test: `packages/domain/tests/use-cases/upload-asset.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `packages/domain/tests/use-cases/upload-asset.test.ts`:

```typescript
it('returns ValidationError when MIME type is text/html', async () => {
  const result = await useCase.execute(
    actorId,
    projectId,
    rootFolderId,
    'evil.html',
    MimeType.create('text/html'),
    smallBytes,
  );
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error).toBeInstanceOf(ValidationError);
  }
});

it('returns ValidationError when MIME type is text/javascript', async () => {
  const result = await useCase.execute(
    actorId,
    projectId,
    rootFolderId,
    'evil.js',
    MimeType.create('text/javascript'),
    smallBytes,
  );
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error).toBeInstanceOf(ValidationError);
  }
});

it('accepts image/png (allowed MIME type)', async () => {
  const result = await useCase.execute(
    actorId,
    projectId,
    rootFolderId,
    'photo.png',
    MimeType.create('image/png'),
    smallBytes,
  );
  expect(result.success).toBe(true);
});

it('accepts application/pdf (allowed MIME type)', async () => {
  const result = await useCase.execute(
    actorId,
    projectId,
    rootFolderId,
    'report.pdf',
    MimeType.create('application/pdf'),
    smallBytes,
  );
  expect(result.success).toBe(true);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/joao/Development/asciidocollab && pnpm --filter @asciidocollab/domain test -- --testPathPattern="upload-asset" 2>&1 | tail -20
```

Expected: text/html and text/javascript tests fail (currently accepted).

- [ ] **Step 3: Implement MIME allowlist in upload-asset.ts**

Add a constant and guard at the top of `UploadAssetUseCase.execute`, after the member check and before the size check:

```typescript
private static readonly ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  'application/pdf',
  'application/octet-stream',
  'text/plain',
  'text/csv',
]);
```

Add the guard in `execute()` right after the member check:

```typescript
if (!UploadAssetUseCase.ALLOWED_MIME_TYPES.has(mimeType.value)) {
  return { success: false, error: new ValidationError(`MIME type '${mimeType.value}' is not permitted`) };
}
```

- [ ] **Step 4: Change Content-Disposition to attachment in images.ts**

In `apps/api/src/routes/projects/images.ts`, change the GET route response header from `inline` to `attachment` and sanitize the filename:

```typescript
// Old:
.header('Content-Disposition', `inline; filename="${result.value.filename}"`)

// New:
.header('Content-Disposition', `attachment; filename="${result.value.filename.replaceAll('"', '')}"`)
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd /home/joao/Development/asciidocollab && pnpm --filter @asciidocollab/domain test -- --testPathPattern="upload-asset" 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
cd /home/joao/Development/asciidocollab && git add packages/domain/src/use-cases/upload-asset.ts apps/api/src/routes/projects/images.ts packages/domain/tests/use-cases/upload-asset.test.ts && git commit -m "$(cat <<'EOF'
fix(security): add MIME type allowlist to asset upload and force attachment download

Blocks text/html and other script-capable MIME types that could enable XSS.
Changes Content-Disposition from inline to attachment to prevent browser
execution of any accepted MIME type served from the API origin.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: SSE event uses ImageId instead of FileNodeId for uploads

**Files:**
- Modify: `packages/domain/src/use-cases/upload-asset.ts` (add fileNodeId to return value)
- Modify: `apps/api/src/routes/projects/images.ts` (use fileNodeId in SSE event)
- Test: `packages/domain/tests/use-cases/upload-asset.test.ts`

- [ ] **Step 1: Write failing test**

Add to `packages/domain/tests/use-cases/upload-asset.test.ts`:

```typescript
it('returns fileNodeId distinct from assetId in the success value', async () => {
  const result = await useCase.execute(
    actorId,
    projectId,
    rootFolderId,
    'photo.png',
    MimeType.create('image/png'),
    smallBytes,
  );
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value.fileNodeId).toBeDefined();
    expect(result.value.fileNodeId).not.toEqual(result.value.assetId);
  }
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /home/joao/Development/asciidocollab && pnpm --filter @asciidocollab/domain test -- --testPathPattern="upload-asset" 2>&1 | tail -20
```

Expected: The new test fails because the return value has no `fileNodeId` field.

- [ ] **Step 3: Implement fix in upload-asset.ts**

In `packages/domain/src/use-cases/upload-asset.ts`, update the return type and the return statement:

Change the execute signature return type from:
```typescript
Promise<Result<{ assetId: ImageId; storagePath: string }, DomainError>>
```
to:
```typescript
Promise<Result<{ assetId: ImageId; fileNodeId: FileNodeId; storagePath: string }, DomainError>>
```

Change the return statement at the end of execute:
```typescript
// Old:
return { success: true, value: { assetId, storagePath } };

// New:
return { success: true, value: { assetId, fileNodeId, storagePath } };
```

- [ ] **Step 4: Fix the SSE event in images.ts**

In `apps/api/src/routes/projects/images.ts`, update the SSE event emission to use `result.value.fileNodeId.value` instead of `result.value.assetId.value`:

```typescript
// Old:
const event: FileTreeEventDto = { type: 'created', fileNodeId: result.value.assetId.value, nodeType: 'file', name: data.filename, path: result.value.storagePath, parentId: request.query.parentId };

// New:
const event: FileTreeEventDto = { type: 'created', fileNodeId: result.value.fileNodeId.value, nodeType: 'file', name: data.filename, path: result.value.storagePath, parentId: request.query.parentId };
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd /home/joao/Development/asciidocollab && pnpm --filter @asciidocollab/domain test -- --testPathPattern="upload-asset" 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
cd /home/joao/Development/asciidocollab && git add packages/domain/src/use-cases/upload-asset.ts apps/api/src/routes/projects/images.ts packages/domain/tests/use-cases/upload-asset.test.ts && git commit -m "$(cat <<'EOF'
fix: emit SSE event with FileNodeId instead of ImageId after asset upload

UploadAssetUseCase now returns fileNodeId alongside assetId. The images route
uses fileNodeId for the SSE event so frontend file tree consumers can match
the event to the correct node record.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 409 folder conflict returns wrong ID — nested uploads go to wrong parent

**Files:**
- Modify: `packages/domain/src/errors/file-conflict.ts` (add optional existingId field)
- Modify: `packages/domain/src/use-cases/create-folder.ts` (pre-check for duplicate child)
- Modify: `apps/api/src/routes/projects/file-tree.ts` (include existingFileNodeId in 409 body)
- Modify: `apps/web/src/lib/api/file-tree.ts` (extend FileTreeApiError + expose existingFileNodeId)
- Modify: `apps/web/src/hooks/use-drop-upload.ts` (use existingFileNodeId on 409)
- Test: `packages/domain/tests/use-cases/create-folder.test.ts`
- Test: `apps/web/tests/hooks/use-drop-upload.test.tsx`

- [ ] **Step 1: Write failing domain test**

Add to `packages/domain/tests/use-cases/create-folder.test.ts` (inside the existing `describe`):

```typescript
it('returns FileConflictError with existingId when a folder with the same name already exists under the same parent', async () => {
  // First creation succeeds
  const first = await useCase.execute(actorId, projectId, rootFolderId, 'docs');
  expect(first.success).toBe(true);
  if (!first.success) return;
  const existingId = first.value.fileNodeId.value;

  // Second creation with same name should conflict and include existingId
  const second = await useCase.execute(actorId, projectId, rootFolderId, 'docs');
  expect(second.success).toBe(false);
  if (!second.success) {
    expect(second.error).toBeInstanceOf(FileConflictError);
    const conflict = second.error as FileConflictError;
    expect(conflict.existingId).toBe(existingId);
  }
});
```

Add import at top of that test file:
```typescript
import { FileConflictError } from '../../src/errors/file-conflict';
```

- [ ] **Step 2: Write failing client-side test**

Add to `apps/web/tests/hooks/use-drop-upload.test.tsx`:

```typescript
it('uses existingFileNodeId from 409 response when folder already exists', async () => {
  const existingFolderId = 'existing-folder-uuid';

  // First call (the folder creation): return 409 with existingFileNodeId
  const { FileTreeApiError } = jest.requireMock('@/lib/api/file-tree');
  mockCreateFolder.mockRejectedValueOnce(
    new FileTreeApiError(409, 'CONFLICT', 'Folder already exists', existingFolderId),
  );

  // Second call (a nested file upload): we need to verify it used existingFolderId
  mockUploadAsset.mockResolvedValue({ assetId: 'asset-1', storagePath: '/docs/file.txt' });

  // Simulate dropping: docs/ contains file.txt
  mockWalkEntries.mockReturnValue(
    makeAsyncIterable([{ file: makeFile('file.txt'), relativePath: 'docs/file.txt' }]),
  );

  const { result } = renderHook(() => useDropUpload('root-folder-id', 'project-123'));

  const dataTransfer = { items: {} } as DataTransferItemList;
  await act(async () => {
    await result.current.onDrop(dataTransfer);
  });

  // createFolder was called for the 'docs' folder
  expect(mockCreateFolder).toHaveBeenCalledWith('project-123', 'root-folder-id', 'docs');

  // uploadAsset must have used existingFolderId (not root-folder-id) as the parentId
  expect(mockUploadAsset).toHaveBeenCalledWith('project-123', existingFolderId, expect.any(File));
});
```

Note: You also need to update the mock factory for `FileTreeApiError` in this test file to expose the 4th constructor argument as `existingFileNodeId`. Ensure the top of the file has:
```typescript
jest.mock('@/lib/api/file-tree', () => ({
  createFolder: jest.fn(),
  FileTreeApiError: class FileTreeApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
      public existingFileNodeId?: string,
    ) {
      super(message);
      this.name = 'FileTreeApiError';
    }
  },
}));
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd /home/joao/Development/asciidocollab && pnpm --filter @asciidocollab/domain test -- --testPathPattern="create-folder" 2>&1 | tail -20
pnpm --filter @asciidocollab/web test -- --testPathPattern="use-drop-upload" 2>&1 | tail -20
```

Expected: Both new tests fail.

- [ ] **Step 4: Extend FileConflictError with existingId**

Replace the entire body of `packages/domain/src/errors/file-conflict.ts`:

```typescript
import { DomainError } from './domain-error';

/**
 * Thrown when a file operation fails due to a naming or content conflict.
 * When the conflicting entity is known, `existingId` carries its identifier
 * so callers can locate and reuse it instead of creating a duplicate.
 */
export class FileConflictError extends DomainError {
  readonly name = 'FileConflictError';

  constructor(message: string, public readonly existingId?: string) {
    super(message);
  }
}
```

- [ ] **Step 5: Add duplicate-child pre-check to CreateFolderUseCase**

In `packages/domain/src/use-cases/create-folder.ts`, add the check after parent is fetched and before the fileStore call. Import `FileConflictError` at the top:

```typescript
import { FileConflictError } from '../errors/file-conflict';
```

Then in `execute()`, after the parent validity check:

```typescript
// Check for existing folder with the same name under this parent
const siblings = await this.fileNodeRepo.findByParentId(parentId);
const duplicate = siblings.find((n) => n.name === name && n.type.value === 'folder');
if (duplicate) {
  return { success: false, error: new FileConflictError(`Folder '${name}' already exists`, duplicate.id.value) };
}
```

- [ ] **Step 6: Include existingFileNodeId in 409 response in file-tree.ts**

In `apps/api/src/routes/projects/file-tree.ts`, update `sendFileTreeError` to pass existingId:

```typescript
// Old:
if (error instanceof FileConflictError) {
  return reply.status(409).send({ error: { code: 'CONFLICT', message: error.message } });
}

// New:
if (error instanceof FileConflictError) {
  const body: Record<string, unknown> = { error: { code: 'CONFLICT', message: error.message } };
  if (error.existingId) body['existingFileNodeId'] = error.existingId;
  return reply.status(409).send(body);
}
```

- [ ] **Step 7: Extend FileTreeApiError and createFolder in apps/web/src/lib/api/file-tree.ts**

Update `FileTreeApiError` class:
```typescript
export class FileTreeApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly existingFileNodeId?: string,
  ) {
    super(message);
    this.name = 'FileTreeApiError';
  }
}
```

Update the `createFolder` function to pass the 4th argument:
```typescript
throw new FileTreeApiError(
  response.status,
  body?.error?.code ?? 'ERROR',
  body?.error?.message ?? 'Failed to create folder',
  body?.existingFileNodeId,
);
```

- [ ] **Step 8: Fix use-drop-upload.ts to use existingFileNodeId**

In `apps/web/src/hooks/use-drop-upload.ts`, update the 409 catch block in `getOrCreateFolder`:

```typescript
// Old:
if (error instanceof FileTreeApiError && error.status === 409) {
  // Folder already exists — this is fine
  folderCache.set(folderPath, parentId);
  return parentId;
}

// New:
if (error instanceof FileTreeApiError && error.status === 409) {
  const resolvedId = error.existingFileNodeId ?? parentId;
  folderCache.set(folderPath, resolvedId);
  return resolvedId;
}
```

- [ ] **Step 9: Run tests to confirm they pass**

```bash
cd /home/joao/Development/asciidocollab && pnpm --filter @asciidocollab/domain test -- --testPathPattern="create-folder" 2>&1 | tail -10
pnpm --filter @asciidocollab/web test -- --testPathPattern="use-drop-upload" 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 10: Commit**

```bash
cd /home/joao/Development/asciidocollab && git add packages/domain/src/errors/file-conflict.ts packages/domain/src/use-cases/create-folder.ts apps/api/src/routes/projects/file-tree.ts apps/web/src/lib/api/file-tree.ts apps/web/src/hooks/use-drop-upload.ts packages/domain/tests/use-cases/create-folder.test.ts apps/web/tests/hooks/use-drop-upload.test.tsx && git commit -m "$(cat <<'EOF'
fix: return existingFileNodeId in 409 so drop-upload places nested files in the correct folder

CreateFolderUseCase now detects duplicate children and includes the existing
folder's ID in FileConflictError. The route echoes it in the 409 body.
useDropUpload reads it instead of falling back to the parent, so files nested
under an already-existing folder land in the right place.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Stale descendant paths after folder rename or move

**Files:**
- Modify: `packages/domain/src/use-cases/rename-file.ts` (cascade path update to children)
- Modify: `packages/domain/src/use-cases/move-file.ts` (cascade path update to children)
- Test: `packages/domain/tests/use-cases/rename-file.test.ts`
- Test: `packages/domain/tests/use-cases/move-file.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `packages/domain/tests/use-cases/rename-file.test.ts` (inside the existing `describe` block):

First add `fileStore` to the `beforeEach` setup (the existing test may not set up a fileStore). The test needs access to `fileNodeRepo` to verify child paths. Add these tests assuming `fileNodeRepo` is already in scope:

```typescript
it('updates descendant FileNode paths in DB when renaming a folder', async () => {
  // Build: root/ -> docs/ -> intro.adoc
  const docsId = FileNodeId.create('dd0e8400-e29b-41d4-a716-446655440020');
  const introId = FileNodeId.create('dd0e8400-e29b-41d4-a716-446655440021');
  const fileStore = new InMemoryProjectFileStore();
  const useCaseWithStore = new RenameFileUseCase(projectMemberRepo, fileNodeRepo, auditLogRepo, fileStore);

  const docsFolder = new FileNode(docsId, projectId, rootFolderId, 'docs', FileNodeType.create('folder'), FilePath.create('/docs'));
  await fileNodeRepo.save(docsFolder);
  await fileStore.createDirectory(projectId, FilePath.create('/docs'));

  const introFile = new FileNode(introId, projectId, docsId, 'intro.adoc', FileNodeType.create('file'), FilePath.create('/docs/intro.adoc'));
  await fileNodeRepo.save(introFile);
  await fileStore.write(projectId, FilePath.create('/docs/intro.adoc'), Buffer.from('content'));

  const result = await useCaseWithStore.execute(actorId, docsId, 'documentation', projectId);
  expect(result.success).toBe(true);

  const updatedIntro = await fileNodeRepo.findById(introId);
  expect(updatedIntro?.path.value).toBe('/documentation/intro.adoc');
});
```

Add to `packages/domain/tests/use-cases/move-file.test.ts` (inside the existing `describe` block):

```typescript
it('updates descendant FileNode paths in DB when moving a folder', async () => {
  // Build: root/ -> src/utils/ -> helper.adoc, AND root/ -> lib/
  const srcId = FileNodeId.create('cc0e8400-e29b-41d4-a716-446655440020');
  const utilsId = FileNodeId.create('cc0e8400-e29b-41d4-a716-446655440021');
  const helperId = FileNodeId.create('cc0e8400-e29b-41d4-a716-446655440022');
  const libId = FileNodeId.create('cc0e8400-e29b-41d4-a716-446655440023');

  const srcFolder = new FileNode(srcId, projectId, rootFolderId, 'src', FileNodeType.create('folder'), FilePath.create('/src'));
  await fileNodeRepo.save(srcFolder);
  await fileStore.createDirectory(projectId, FilePath.create('/src'));

  const utilsFolder = new FileNode(utilsId, projectId, srcId, 'utils', FileNodeType.create('folder'), FilePath.create('/src/utils'));
  await fileNodeRepo.save(utilsFolder);
  await fileStore.createDirectory(projectId, FilePath.create('/src/utils'));

  const helperFile = new FileNode(helperId, projectId, utilsId, 'helper.adoc', FileNodeType.create('file'), FilePath.create('/src/utils/helper.adoc'));
  await fileNodeRepo.save(helperFile);
  await fileStore.write(projectId, FilePath.create('/src/utils/helper.adoc'), Buffer.from('helper'));

  const libFolder = new FileNode(libId, projectId, rootFolderId, 'lib', FileNodeType.create('folder'), FilePath.create('/lib'));
  await fileNodeRepo.save(libFolder);
  await fileStore.createDirectory(projectId, FilePath.create('/lib'));

  // Move /src/utils -> /lib/utils
  const result = await useCase.execute(actorId, projectId, utilsId, libId);
  expect(result.success).toBe(true);

  const updatedHelper = await fileNodeRepo.findById(helperId);
  expect(updatedHelper?.path.value).toBe('/lib/utils/helper.adoc');
});
```

Make sure `InMemoryProjectFileStore` is imported in that test file (it already should be).

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/joao/Development/asciidocollab && pnpm --filter @asciidocollab/domain test -- --testPathPattern="rename-file|move-file" 2>&1 | tail -20
```

Expected: Both new cascade tests fail (children paths are not updated).

- [ ] **Step 3: Implement cascade path update in rename-file.ts**

Add a private helper to `RenameFileUseCase` and call it after saving the renamed node:

```typescript
private async cascadePathUpdate(
  folderId: FileNodeId,
  oldPathPrefix: string,
  newPathPrefix: string,
): Promise<void> {
  const children = await this.fileNodeRepo.findByParentId(folderId);
  for (const child of children) {
    const newChildPath = FilePath.create(
      newPathPrefix + child.path.value.slice(oldPathPrefix.length),
    );
    const updatedChild = new FileNode(
      child.id,
      child.projectId,
      child.parentId,
      child.name,
      child.type,
      newChildPath,
      new Timestamps(child.createdAt, new Date()),
    );
    await this.fileNodeRepo.save(updatedChild);
    if (child.type.value === 'folder') {
      await this.cascadePathUpdate(child.id, oldPathPrefix + child.name + '/', newPathPrefix + child.name + '/');
    }
  }
}
```

Then in `execute()`, after `await this.fileNodeRepo.save(updatedFileNode)` and only when the node is a folder:

```typescript
if (fileNode.type.value === 'folder') {
  await this.cascadePathUpdate(fileNodeId, fileNode.path.value + '/', newPath.value + '/');
}
```

Make sure `Timestamps` is imported at the top (it already should be, since `updatedFileNode` uses it).

- [ ] **Step 4: Implement cascade path update in move-file.ts**

Add the same private helper to `MoveFileUseCase`:

```typescript
private async cascadePathUpdate(
  folderId: FileNodeId,
  oldPathPrefix: string,
  newPathPrefix: string,
): Promise<void> {
  const children = await this.fileNodeRepo.findByParentId(folderId);
  for (const child of children) {
    const newChildPath = FilePath.create(
      newPathPrefix + child.path.value.slice(oldPathPrefix.length),
    );
    const updatedChild = new FileNode(
      child.id,
      child.projectId,
      child.parentId,
      child.name,
      child.type,
      newChildPath,
      new Timestamps(child.createdAt, new Date()),
    );
    await this.fileNodeRepo.save(updatedChild);
    if (child.type.value === 'folder') {
      await this.cascadePathUpdate(child.id, oldPathPrefix + child.name + '/', newPathPrefix + child.name + '/');
    }
  }
}
```

Add import for `Timestamps` if not already present:
```typescript
import { Timestamps } from '../value-objects/timestamps';
```

In `execute()`, after `await this.fileNodeRepo.save(updated)`:

```typescript
if (fileNode.type.value === 'folder') {
  await this.cascadePathUpdate(fileNodeId, fileNode.path.value + '/', newPath.value + '/');
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd /home/joao/Development/asciidocollab && pnpm --filter @asciidocollab/domain test -- --testPathPattern="rename-file|move-file" 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
cd /home/joao/Development/asciidocollab && git add packages/domain/src/use-cases/rename-file.ts packages/domain/src/use-cases/move-file.ts packages/domain/tests/use-cases/rename-file.test.ts packages/domain/tests/use-cases/move-file.test.ts && git commit -m "$(cat <<'EOF'
fix: cascade descendant path updates when renaming or moving a folder

Previously only the top-level node's path was updated in the DB while all
children retained stale paths, causing every subsequent read, move, or rename
of a descendant to use the wrong filesystem path.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Yjs state not cleaned up when deleting a folder

**Files:**
- Modify: `packages/domain/src/use-cases/delete-file.ts`
- Test: `packages/domain/tests/use-cases/delete-file.test.ts`

- [ ] **Step 1: Write failing test**

Add to `packages/domain/tests/use-cases/delete-file.test.ts` (uses the `fileStore` + `yjsStateStore` that the test already declares — verify they are wired up in `useCase` for this test or create a separate `useCaseWithStores`):

```typescript
it('cleans up Yjs state for all documents inside a deleted folder', async () => {
  const fileStore = new InMemoryProjectFileStore();
  const yjsStateStore = new InMemoryYjsStateStore();
  const useCaseWithStores = new DeleteFileUseCase(
    projectMemberRepo,
    fileNodeRepo,
    documentRepo,
    auditLogRepo,
    fileStore,
    yjsStateStore,
  );

  // childFolder contains a file with a Document + Yjs state
  const childFileId = FileNodeId.create('ff0e8400-e29b-41d4-a716-446655440030');
  const childDocId = DocumentId.create('ff0e8400-e29b-41d4-a716-446655440031');
  const childYjsStateId = YjsStateId.create('ff0e8400-e29b-41d4-a716-446655440032');

  const childFile = new FileNode(
    childFileId,
    projectId,
    childFolderId,
    'note.adoc',
    FileNodeType.create('file'),
    FilePath.create('/child/note.adoc'),
  );
  await fileNodeRepo.save(childFile);

  const childDoc = new Document(
    childDocId,
    childFileId,
    ContentId.create('aa0e8400-e29b-41d4-a716-446655440033'),
    childYjsStateId,
    MimeType.create('text/asciidoc'),
  );
  await documentRepo.save(childDoc);

  // Seed the Yjs state store so we can verify deletion
  await yjsStateStore.save(projectId, childYjsStateId, Buffer.from('yjs-data'));
  expect(await yjsStateStore.load(projectId, childYjsStateId)).not.toBeNull();

  const result = await useCaseWithStores.execute(actorId, childFolderId, projectId);
  expect(result.success).toBe(true);

  // Yjs state must be cleaned up
  expect(await yjsStateStore.load(projectId, childYjsStateId)).toBeNull();
});
```

The test setup uses `childFolderId` which already exists in the fixture as a child of `rootFolder`. Ensure `childFolder` has `parentId = rootFolderId` (not null).

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /home/joao/Development/asciidocollab && pnpm --filter @asciidocollab/domain test -- --testPathPattern="delete-file" 2>&1 | tail -20
```

Expected: The new test fails (Yjs state not deleted for folder children).

- [ ] **Step 3: Implement fix in delete-file.ts**

In `deleteFolderRecursively`, collect Yjs state IDs during the traversal and delete them after all DB records are removed. The method needs `projectId` and `yjsStateStore`. Update its signature and collect stateIds:

```typescript
private async deleteFolderRecursively(folderId: FileNodeId, projectId: ProjectId): Promise<void> {
  const stack: FileNodeId[] = [folderId];
  const toDelete: FileNodeId[] = [];
  const yjsStateIds: YjsStateId[] = [];

  while (stack.length > 0) {
    const currentId = stack.pop()!;
    toDelete.push(currentId);

    const children = await this.fileNodeRepo.findByParentId(currentId);

    for (const child of children) {
      if (child.type.value === 'file') {
        const document = await this.documentRepo.findByFileNodeId(child.id);
        if (document) {
          yjsStateIds.push(document.yjsStateId);
          await this.documentRepo.delete(document.id);
        }
        toDelete.push(child.id);
      } else {
        stack.push(child.id);
      }
    }
  }

  // eslint-disable-next-line unicorn/no-array-reverse
  for (const id of [...toDelete].reverse()) {
    await this.fileNodeRepo.delete(id);
  }

  if (this.yjsStateStore) {
    for (const stateId of yjsStateIds) {
      await this.yjsStateStore.delete(projectId, stateId);
    }
  }
}
```

Then update the call site in `execute()` to pass `projectId`:

```typescript
// Old:
await this.deleteFolderRecursively(fileNodeId);

// New:
await this.deleteFolderRecursively(fileNodeId, projectId);
```

Add the `YjsStateId` import at the top if not already present:
```typescript
import { YjsStateId } from '../value-objects/yjs-state-id';
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd /home/joao/Development/asciidocollab && pnpm --filter @asciidocollab/domain test -- --testPathPattern="delete-file" 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/joao/Development/asciidocollab && git add packages/domain/src/use-cases/delete-file.ts packages/domain/tests/use-cases/delete-file.test.ts && git commit -m "$(cat <<'EOF'
fix: clean up Yjs state for all documents inside a deleted folder

deleteFolderRecursively now collects YjsStateIds from every document child and
calls yjsStateStore.delete for each after removing the DB records, preventing
unbounded orphan state accumulation on disk.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Combined rename+move PATCH emits no SSE event

**Files:**
- Modify: `apps/api/src/routes/projects/file-tree.ts`
- Test: `apps/api/tests/routes/` (new test file or extend existing)

- [ ] **Step 1: Write failing test**

Create `apps/api/tests/routes/file-tree-patch.test.ts`:

```typescript
import Fastify from 'fastify';
import { fileTreeEventBusPlugin } from '../../src/plugins/file-tree-event-bus';
import { fileTreeRoutes } from '../../src/routes/projects/file-tree';

jest.mock('../../src/plugins/require-auth', () => ({
  requireAuth: jest.fn((_req: unknown, _rep: unknown, done: () => void) => done()),
  getAuthenticatedUserId: jest.fn(() => '550e8400-e29b-41d4-a716-446655440001'),
}));

const projectId = '770e8400-e29b-41d4-a716-446655440003';
const fileNodeId = 'aa0e8400-e29b-41d4-a716-446655440006';
const newParentId = '990e8400-e29b-41d4-a716-446655440005';

async function buildApp(opts: {
  renameMock?: jest.Mock;
  moveMock?: jest.Mock;
  findByIdMock?: jest.Mock;
}) {
  const app = Fastify();
  await app.register(fileTreeEventBusPlugin);

  const renameMock = opts.renameMock ?? jest.fn().mockResolvedValue({ success: true, value: { fileNodeId: { value: fileNodeId }, newName: 'renamed.adoc', newPath: { value: '/parent/renamed.adoc' } } });
  const moveMock = opts.moveMock ?? jest.fn().mockResolvedValue({ success: true, value: { fileNodeId: { value: fileNodeId }, newPath: { value: '/parent/renamed.adoc' } } });
  const findByIdMock = opts.findByIdMock ?? jest.fn().mockResolvedValue({ id: { value: fileNodeId }, type: { value: 'file' }, name: 'renamed.adoc', path: { value: '/parent/renamed.adoc' }, parentId: { value: newParentId } });

  app.decorate('repos', {
    projectMember: { findByCompositeKey: jest.fn().mockResolvedValue({ role: { value: 'editor' } }) },
    fileNode: { findById: findByIdMock },
    document: {},
    auditLog: {},
  } as never);
  app.decorate('stores', { fileStore: { move: jest.fn().mockResolvedValue({ success: true, value: undefined }), createDirectory: jest.fn() }, yjsStateStore: {} } as never);
  app.decorate('config', { storage: { maxUploadSizeBytes: 20_971_520, path: '/tmp' } } as never);
  app.decorate('services', {} as never);
  app.decorate('prisma', null as never);

  // Inject use-case factories via module mock is complex; instead spy on the event bus
  await app.register(fileTreeRoutes);
  await app.ready();
  return app;
}

describe('PATCH /projects/:projectId/files/:fileNodeId — combined rename+move', () => {
  it('emits a SSE event when both name and parentId are provided and both succeed', async () => {
    const app = await buildApp({});
    const emitSpy = jest.spyOn(app.fileTreeEventBus, 'emit');

    const response = await app.inject({
      method: 'PATCH',
      url: `/projects/${projectId}/files/${fileNodeId}`,
      payload: { name: 'renamed.adoc', parentId: newParentId },
    });

    // The route may return 204 or propagate errors from the real use cases;
    // what matters is that emit was called
    expect(emitSpy).toHaveBeenCalledWith(
      projectId,
      expect.objectContaining({ fileNodeId, parentId: newParentId }),
    );

    await app.close();
  });
});
```

Note: This test injects a Fastify app with mocked repos and spies on the event bus. Because the use cases construct their own instances, some mocking is needed at the repo level. Adjust mock return shapes if the test fails for a reason other than the missing emit.

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /home/joao/Development/asciidocollab && pnpm --filter @asciidocollab/api test -- --testPathPattern="file-tree-patch" 2>&1 | tail -20
```

Expected: The new test fails (no emit call recorded).

- [ ] **Step 3: Implement fix in file-tree.ts**

In `apps/api/src/routes/projects/file-tree.ts`, find the combined rename+move branch (the `if (name !== undefined && parentId !== undefined)` block) and add SSE emission before `return reply.status(204).send()`:

```typescript
if (name !== undefined && parentId !== undefined) {
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

  // Emit SSE event (combined rename+move)
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
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd /home/joao/Development/asciidocollab && pnpm --filter @asciidocollab/api test -- --testPathPattern="file-tree-patch" 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/joao/Development/asciidocollab && git add apps/api/src/routes/projects/file-tree.ts apps/api/tests/routes/file-tree-patch.test.ts && git commit -m "$(cat <<'EOF'
fix: emit SSE event after combined rename+move PATCH

The branch handling both name+parentId in a single PATCH returned 204 without
emitting a file tree event, leaving connected clients with a stale view.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: DB update before disk write in SaveDocumentContentUseCase

**Files:**
- Modify: `packages/domain/src/use-cases/save-document-content.ts`
- Test: `packages/domain/tests/use-cases/save-document-content.test.ts`

- [ ] **Step 1: Write failing test**

Add to `packages/domain/tests/use-cases/save-document-content.test.ts`:

```typescript
it('does not update the DB ContentId when the disk write fails', async () => {
  // Swap fileStore for a failing one
  const failingFileStore = {
    write: jest.fn().mockRejectedValue(new Error('disk full')),
  } as unknown as typeof fileStore;

  const useCaseWithFailingStore = new SaveDocumentContentUseCase(
    projectMemberRepo,
    fileNodeRepo,
    documentRepo,
    failingFileStore,
  );

  const docBefore = await documentRepo.findByFileNodeId(fileNodeId);
  const contentIdBefore = docBefore?.contentId.value;

  // Should propagate or surface the error as a failed Result
  let threw = false;
  try {
    await useCaseWithFailingStore.execute(actorId, projectId, fileNodeId, newContent);
  } catch {
    threw = true;
  }

  const docAfter = await documentRepo.findByFileNodeId(fileNodeId);
  // If disk write failed before DB update, ContentId must still be the original
  if (!threw) {
    // If use case returns a result instead of throwing, that's also fine
  }
  // In either case, DB must not have been updated
  expect(docAfter?.contentId.value).toBe(contentIdBefore);
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /home/joao/Development/asciidocollab && pnpm --filter @asciidocollab/domain test -- --testPathPattern="save-document-content" 2>&1 | tail -20
```

Expected: The new test fails because `documentRepo.save` is called even when disk write throws.

- [ ] **Step 3: Implement fix — wrap disk write + only update DB if disk write succeeded**

Replace the body of `execute()` in `packages/domain/src/use-cases/save-document-content.ts` after the document lookup:

```typescript
// Write content to disk first; if this fails, abort before updating DB
try {
  await this.fileStore.write(projectId, fileNode.path, content);
} catch {
  return { success: false, error: new FileNodeNotFoundError(fileNodeId.value) };
}

const updated = new Document(
  document.id,
  document.fileNodeId,
  ContentId.create(randomUUID()),
  document.yjsStateId,
  document.mimeType,
  new Timestamps(document.createdAt, new Date()),
);
await this.documentRepo.save(updated);

return { success: true, value: undefined };
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd /home/joao/Development/asciidocollab && pnpm --filter @asciidocollab/domain test -- --testPathPattern="save-document-content" 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/joao/Development/asciidocollab && git add packages/domain/src/use-cases/save-document-content.ts packages/domain/tests/use-cases/save-document-content.test.ts && git commit -m "$(cat <<'EOF'
fix: abort DB ContentId update when disk write fails in SaveDocumentContentUseCase

Disk write now runs before the DB save so a disk failure surfaces as a Result
error rather than leaving the DB with a ContentId that points to content that
was never actually written.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Multipart size limit larger than enforced domain limit

**Files:**
- Modify: `apps/api/src/routes/projects/images.ts`
- Test: (configuration verification — checked by reading the source after change)

- [ ] **Step 1: Write failing test**

Add to the existing API-level test or create a simple snapshot assertion. Since this is a configuration check, we verify it in code review by reading the file. For a testable approach, add a unit check in the images route test or just verify the config is used:

Create `apps/api/tests/routes/images-multipart-limit.test.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('images route multipart limit', () => {
  it('uses app.config.storage.maxUploadSizeBytes for the multipart file size limit instead of a hardcoded value', () => {
    const source = readFileSync(
      join(__dirname, '../../src/routes/projects/images.ts'),
      'utf8',
    );
    // Should NOT contain a hardcoded 50MB literal
    expect(source).not.toMatch(/50\s*\*\s*1024\s*\*\s*1024/);
    // Should reference config
    expect(source).toMatch(/config\.storage\.maxUploadSizeBytes/);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /home/joao/Development/asciidocollab && pnpm --filter @asciidocollab/api test -- --testPathPattern="images-multipart" 2>&1 | tail -15
```

Expected: Test fails (source still has `50 * 1024 * 1024`).

- [ ] **Step 3: Implement fix in images.ts**

In `apps/api/src/routes/projects/images.ts`, replace:

```typescript
// Old:
await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

// New:
await app.register(multipart, { limits: { fileSize: app.config.storage.maxUploadSizeBytes } });
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd /home/joao/Development/asciidocollab && pnpm --filter @asciidocollab/api test -- --testPathPattern="images-multipart" 2>&1 | tail -10
```

Expected: Test passes.

- [ ] **Step 5: Commit**

```bash
cd /home/joao/Development/asciidocollab && git add apps/api/src/routes/projects/images.ts apps/api/tests/routes/images-multipart-limit.test.ts && git commit -m "$(cat <<'EOF'
fix: set multipart file size limit from config instead of hardcoded 50 MB

Previously the multipart plugin allowed 50 MB regardless of the admin-configured
limit. The full payload was buffered into memory before the domain rejected it,
enabling memory exhaustion with concurrent large uploads.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Run all quality gates

- [ ] **Step 1: Run full domain test suite**

```bash
cd /home/joao/Development/asciidocollab && pnpm --filter @asciidocollab/domain test 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 2: Run full API test suite**

```bash
cd /home/joao/Development/asciidocollab && pnpm --filter @asciidocollab/api test 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 3: Run full web test suite**

```bash
cd /home/joao/Development/asciidocollab && pnpm --filter @asciidocollab/web test 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 4: Run TypeScript type checks**

```bash
cd /home/joao/Development/asciidocollab && pnpm --filter @asciidocollab/domain exec tsc --noEmit 2>&1 | tail -20
pnpm --filter @asciidocollab/api exec tsc --noEmit 2>&1 | tail -20
pnpm --filter @asciidocollab/web exec tsc --noEmit 2>&1 | tail -20
```

Expected: No type errors.

- [ ] **Step 5: Run linter**

```bash
cd /home/joao/Development/asciidocollab && pnpm lint 2>&1 | tail -20
```

Expected: No lint errors.

---

## Task 12: Improve test quality and coverage

- [ ] **Step 1: Add edge-case tests for IDOR (cross-project root folder cannot be deleted)**

Add to `packages/domain/tests/use-cases/delete-file.test.ts`:

```typescript
it('returns PermissionDeniedError (not FileNodeNotFoundError) when actor is not a member of the URL project', async () => {
  const nonMemberId = UserId.create('000e8400-e29b-41d4-a716-446655440099');
  const result = await useCase.execute(nonMemberId, fileNodeId, projectId);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error).toBeInstanceOf(PermissionDeniedError);
  }
});
```

- [ ] **Step 2: Add upload-asset tests for boundary size conditions**

Add to `packages/domain/tests/use-cases/upload-asset.test.ts`:

```typescript
it('accepts a file exactly at the size limit', async () => {
  await systemSettingRepo.set(SETTING_MAX_UPLOAD_SIZE_BYTES, '100');
  const exactBytes = Buffer.alloc(100, 0x42);
  const result = await useCase.execute(actorId, projectId, rootFolderId, 'exact.png', MimeType.create('image/png'), exactBytes);
  expect(result.success).toBe(true);
});

it('rejects a file one byte over the size limit', async () => {
  await systemSettingRepo.set(SETTING_MAX_UPLOAD_SIZE_BYTES, '100');
  const overBytes = Buffer.alloc(101, 0x42);
  const result = await useCase.execute(actorId, projectId, rootFolderId, 'over.png', MimeType.create('image/png'), overBytes);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error).toBeInstanceOf(ValidationError);
  }
});

it('stores the asset bytes and allows retrieval after successful upload', async () => {
  const bytes = Buffer.from([0x89, 0x50, 0x4E, 0x47]); // PNG magic bytes
  const result = await useCase.execute(actorId, projectId, rootFolderId, 'photo.png', MimeType.create('image/png'), bytes);
  expect(result.success).toBe(true);
  if (result.success) {
    const stored = await fileStore.read(projectId, FilePath.create(`/${result.value.storagePath}`));
    // storagePath may be relative; accept either
    const storedAlt = await fileStore.read(projectId, FilePath.create(result.value.storagePath));
    expect(stored ?? storedAlt).toEqual(bytes);
  }
});
```

- [ ] **Step 3: Add deep-nesting cascade test for rename**

Add to `packages/domain/tests/use-cases/rename-file.test.ts`:

```typescript
it('updates deeply nested descendants (3 levels) when renaming a folder', async () => {
  const fileStore = new InMemoryProjectFileStore();
  const useCaseWithStore = new RenameFileUseCase(projectMemberRepo, fileNodeRepo, auditLogRepo, fileStore);

  const aId = FileNodeId.create('a10e8400-e29b-41d4-a716-446655440040');
  const bId = FileNodeId.create('b10e8400-e29b-41d4-a716-446655440041');
  const leafId = FileNodeId.create('c10e8400-e29b-41d4-a716-446655440042');

  await fileNodeRepo.save(new FileNode(aId, projectId, rootFolderId, 'a', FileNodeType.create('folder'), FilePath.create('/a')));
  await fileNodeRepo.save(new FileNode(bId, projectId, aId, 'b', FileNodeType.create('folder'), FilePath.create('/a/b')));
  await fileNodeRepo.save(new FileNode(leafId, projectId, bId, 'leaf.adoc', FileNodeType.create('file'), FilePath.create('/a/b/leaf.adoc')));
  await fileStore.createDirectory(projectId, FilePath.create('/a'));
  await fileStore.createDirectory(projectId, FilePath.create('/a/b'));
  await fileStore.write(projectId, FilePath.create('/a/b/leaf.adoc'), Buffer.from('leaf'));

  const result = await useCaseWithStore.execute(actorId, aId, 'alpha', projectId);
  expect(result.success).toBe(true);

  const updatedB = await fileNodeRepo.findById(bId);
  const updatedLeaf = await fileNodeRepo.findById(leafId);
  expect(updatedB?.path.value).toBe('/alpha/b');
  expect(updatedLeaf?.path.value).toBe('/alpha/b/leaf.adoc');
});
```

- [ ] **Step 4: Add SSE event shape test for asset upload**

Add to `apps/api/tests/routes/` a test that verifies the SSE event `fileNodeId` matches the FileNode record and not the Image record. This can be done by extending the API-level upload test to spy on the event bus.

Create `apps/api/tests/routes/images-sse.test.ts`:

```typescript
import Fastify from 'fastify';
import { fileTreeEventBusPlugin } from '../../src/plugins/file-tree-event-bus';
import { imagesRoutes } from '../../src/routes/projects/images';

jest.mock('../../src/plugins/require-auth', () => ({
  requireAuth: jest.fn((_req: unknown, _rep: unknown, done: () => void) => done()),
  getAuthenticatedUserId: jest.fn(() => '550e8400-e29b-41d4-a716-446655440001'),
}));

describe('POST /projects/:projectId/images — SSE event', () => {
  it('emits a created event with a fileNodeId that differs from assetId', async () => {
    const capturedEvents: unknown[] = [];
    const app = Fastify();
    await app.register(fileTreeEventBusPlugin);

    // Spy on emit before routes register
    const originalEmit = app.fileTreeEventBus.emit.bind(app.fileTreeEventBus);
    jest.spyOn(app.fileTreeEventBus, 'emit').mockImplementation((pid, ev) => {
      capturedEvents.push(ev);
      return originalEmit(pid, ev);
    });

    const fileNodeIdValue = 'fn-uuid-1234';
    const assetIdValue = 'asset-uuid-5678';

    app.decorate('repos', {
      projectMember: { findByCompositeKey: jest.fn().mockResolvedValue({ role: { value: 'editor' } }) },
      fileNode: {
        findById: jest.fn().mockResolvedValue({ type: { value: 'folder' }, path: { value: '/' }, projectId: { value: '770e8400-e29b-41d4-a716-446655440003' } }),
        save: jest.fn(),
      },
      image: { save: jest.fn() },
      systemSetting: { get: jest.fn().mockResolvedValue(null) },
    } as never);
    app.decorate('stores', {
      fileStore: { createExclusive: jest.fn().mockResolvedValue({ success: true, value: undefined }) },
    } as never);
    app.decorate('config', { storage: { maxUploadSizeBytes: 20_971_520 } } as never);
    app.decorate('services', {} as never);
    app.decorate('prisma', null as never);

    // Override randomUUID to return predictable values
    jest.spyOn(require('crypto'), 'randomUUID')
      .mockReturnValueOnce(fileNodeIdValue)  // fileNodeId
      .mockReturnValueOnce(assetIdValue);    // assetId

    await app.register(imagesRoutes);
    await app.ready();

    const form = new FormData();
    form.append('file', new Blob(['PNG bytes'], { type: 'image/png' }), 'photo.png');

    await app.inject({
      method: 'POST',
      url: '/projects/770e8400-e29b-41d4-a716-446655440003/images?parentId=880e8400-e29b-41d4-a716-446655440004',
      headers: { 'content-type': 'multipart/form-data; boundary=---boundary' },
      payload: Buffer.from('---boundary\r\nContent-Disposition: form-data; name="file"; filename="photo.png"\r\nContent-Type: image/png\r\n\r\nPNG bytes\r\n---boundary--\r\n'),
    });

    expect(capturedEvents).toHaveLength(1);
    const event = capturedEvents[0] as { fileNodeId: string };
    expect(event.fileNodeId).toBe(fileNodeIdValue);
    expect(event.fileNodeId).not.toBe(assetIdValue);

    await app.close();
  });
});
```

- [ ] **Step 5: Run all tests to confirm the full suite is green**

```bash
cd /home/joao/Development/asciidocollab && pnpm --filter @asciidocollab/domain test 2>&1 | tail -5
pnpm --filter @asciidocollab/api test 2>&1 | tail -5
pnpm --filter @asciidocollab/web test 2>&1 | tail -5
```

Expected: All suites pass.

- [ ] **Step 6: Commit**

```bash
cd /home/joao/Development/asciidocollab && git add -A && git commit -m "$(cat <<'EOF'
test: improve coverage and edge-case tests for all 10 bug fixes

Adds boundary size tests, deep-nesting cascade tests, IDOR non-member
ordering checks, SSE event shape verification, and improved retrieval
assertions for uploaded assets.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```
