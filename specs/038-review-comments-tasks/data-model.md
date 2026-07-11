# Phase 1 Data Model: Review Comments and Tasks

## Entities

### ReviewComment (aggregate root — a "review item")

A single comment or task attached to a document. A root item plus its replies (`parentId`) form a thread.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `projectId` | UUID | FK → Project; tenant key (every query filters on it) |
| `documentId` | UUID | FK → Document |
| `parentId` | UUID? | FK → ReviewComment (self); null = root; non-null = reply |
| `kind` | ReviewItemKind | `COMMENT` \| `TASK` |
| `body` | text | sanitized on render; emoji allowed; max length enforced at boundary |
| `authorId` | UUID? | FK → User, ON DELETE SET NULL ("Deleted user" when null) |
| `status` | ReviewItemStatus? | tasks only: `OPEN`\|`IN_PROGRESS`\|`RESOLVED`\|`WONTFIX`; null for pure comments |
| `assigneeId` | UUID? | tasks only; FK → User, ON DELETE SET NULL |
| `dueDate` | date? | tasks only |
| `resolvedAt` | timestamptz? | set when a thread/task is resolved |
| `resolvedById` | UUID? | FK → User, ON DELETE SET NULL |
| **Anchor (root items only)** | | replies inherit the root's anchor |
| `anchorRelPos` | bytes? | encoded Yjs RelativePosition pair (start,end) |
| `anchorQuotePrefix` | text? | ≤ N chars before the passage |
| `anchorQuoteExact` | text? | the quoted passage |
| `anchorQuoteSuffix` | text? | ≤ N chars after |
| `anchorLineHint` | int? | 1-based line at creation |
| `anchorSectionId` | text? | section symbol id (structural fallback) |
| `anchorState` | AnchorState | `LOCATED`\|`SECTION`\|`DETACHED` (derived/persisted) |
| `createdAt` | timestamptz | default now |
| `updatedAt` | timestamptz | @updatedAt |

**Indexes**: `(projectId)`, `(documentId)`, `(parentId)`, `(assigneeId, status)` for the "assigned to me / open" query, `(documentId, resolvedAt)` for default-view filtering.

**Invariants**:
- A reply (`parentId != null`) MUST share `projectId`/`documentId` with its root and MUST NOT carry anchor fields, `status`, `assigneeId`, or `dueDate`.
- `status`/`assigneeId`/`dueDate` are non-null only when `kind = TASK`.
- Deleting a root cascades to its replies and its reactions.
- Anchor fields are present only on root items.

**State transitions**:
- kind: `COMMENT → TASK` (convert; gains default `status=OPEN`) and `TASK → COMMENT` (clears status/assignee/dueDate).
- task status: `OPEN → IN_PROGRESS → RESOLVED`; any → `WONTFIX`; `RESOLVED/WONTFIX → OPEN` (reopen). Setting `RESOLVED`/`WONTFIX` stamps `resolvedAt`/`resolvedById`; reopening clears them.

> **Resolution authority (single source of the stamp)**: the `resolvedAt`/`resolvedById` stamp has exactly one writer per kind. For a **task** (`kind=TASK`), resolution flows through `SetTaskStatus`→`RESOLVED`/`WONTFIX` (the status carries the meaning). For a pure **comment thread** (`kind=COMMENT`, `status=null`), resolution flows through `ResolveReviewItem`, which stamps the same two fields and is a no-op path for tasks (a task is resolved by setting its status, never by `ResolveReviewItem`). Both operations share one internal stamp/clear helper so the audit entry and timestamps are identical regardless of entry point.
- anchor: `LOCATED → SECTION → DETACHED` (degradation) and `DETACHED/SECTION → LOCATED` (manual reattach).

### ReviewReaction

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `reviewCommentId` | UUID | FK → ReviewComment (cascade delete) |
| `userId` | UUID | FK → User (cascade delete) |
| `emoji` | text | normalized unicode-emoji key, validated against allowlist at boundary |
| `createdAt` | timestamptz | default now |

**Unique**: `(reviewCommentId, userId, emoji)` — makes react idempotent (toggle = delete existing / insert). **Index**: `(reviewCommentId)`.

## Prisma sketch (packages/db/prisma/schema.prisma)

```prisma
enum ReviewItemKind { COMMENT TASK }
enum ReviewItemStatus { OPEN IN_PROGRESS RESOLVED WONTFIX }
enum AnchorState { LOCATED SECTION DETACHED }

model ReviewComment {
  id            String            @id @default(uuid()) @db.Uuid
  projectId     String            @db.Uuid
  documentId    String            @db.Uuid
  parentId      String?           @db.Uuid
  kind          ReviewItemKind
  body          String
  authorId      String?           @db.Uuid
  status        ReviewItemStatus?
  assigneeId    String?           @db.Uuid
  dueDate       DateTime?         @db.Date
  resolvedAt    DateTime?
  resolvedById  String?           @db.Uuid
  anchorRelPos  Bytes?
  anchorQuotePrefix String?
  anchorQuoteExact  String?
  anchorQuoteSuffix String?
  anchorLineHint    Int?
  anchorSectionId   String?
  anchorState   AnchorState       @default(LOCATED)
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  project   Project         @relation(fields: [projectId], references: [id], onDelete: Cascade)
  document  Document        @relation(fields: [documentId], references: [id], onDelete: Cascade)
  parent    ReviewComment?  @relation("ReviewThread", fields: [parentId], references: [id], onDelete: Cascade)
  replies   ReviewComment[] @relation("ReviewThread")
  author    User?           @relation("ReviewAuthor",   fields: [authorId],     references: [id], onDelete: SetNull)
  assignee  User?           @relation("ReviewAssignee", fields: [assigneeId],   references: [id], onDelete: SetNull)
  resolver  User?           @relation("ReviewResolver", fields: [resolvedById], references: [id], onDelete: SetNull)
  reactions ReviewReaction[]

  @@index([projectId])
  @@index([documentId])
  @@index([parentId])
  @@index([assigneeId, status])
  @@index([documentId, resolvedAt])
}

model ReviewReaction {
  id              String @id @default(uuid()) @db.Uuid
  reviewCommentId String @db.Uuid
  userId          String @db.Uuid
  emoji           String
  createdAt       DateTime @default(now())

  comment ReviewComment @relation(fields: [reviewCommentId], references: [id], onDelete: Cascade)
  user    User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([reviewCommentId, userId, emoji])
  @@index([reviewCommentId])
}
```

> **Migration gate**: generating/applying this migration requires explicit user approval (Architecture Constitution). It is a dedicated gated task in `tasks.md`.

## DTOs (packages/shared/src/review)

- `AnchorDTO { relPos?: string /* base64 */, quote?: { prefix, exact, suffix }, lineHint?: number, sectionId?: string, state: 'located'|'section'|'detached' }`
- `ReactionSummaryDTO { emoji: string, count: number, reactedByMe: boolean, userIds: string[] }`
- `ReviewItemDTO { id, documentId, projectId, parentId?, kind: 'comment'|'task', body, author: { id, displayName } | null, status?, assignee?, dueDate?, resolvedAt?, resolvedBy?, anchor?: AnchorDTO, reactions: ReactionSummaryDTO[], createdAt, updatedAt }`
- `ThreadDTO { root: ReviewItemDTO, replies: ReviewItemDTO[] }`
- Command DTOs: `CreateReviewItemInput`, `ReplyInput`, `ResolveInput`, `ConvertToTaskInput`, `AssignTaskInput`, `SetStatusInput`, `ReactInput`, `DeleteInput`, `BulkDeleteDocumentInput`, `BulkDeleteProjectInput`.
- Shared error types: `ReviewError = NotFound | Forbidden | ValidationFailed | AnchorInvalid` (typed; no internal leakage — Security Constitution).

All DTOs live in `packages/shared`; no package redefines them (Architecture Constitution §Contracts).

## Domain ports (packages/domain/src/ports/review)

- `ReviewCommentRepository`: `create`, `findById`, `listByDocument(projectId, documentId, {includeResolved})`, `listByProject(projectId, {assigneeId?, status?, documentId?})`, `update`, `delete(id)`, `deleteByDocument(projectId, documentId)`, `deleteByProject(projectId)`. All reads/writes filtered by `projectId`.
- `ReviewReactionRepository`: `toggle(reviewCommentId, userId, emoji)`, `listForItems(ids[])`.

Each port has an in-memory fake under `tests/` (Principle III).
