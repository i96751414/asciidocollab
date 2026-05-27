# Phase 2 Design: Database Layer

**Date:** 2026-05-27
**Status:** Draft
**Based on:** Architecture Design (2026-05-26), Section 11 Phased Delivery

---

## 1. Overview

Phase 2 implements the persistence layer for all 9 domain entities. It provides two new packages (`packages/db` and `packages/infrastructure`) with a Prisma schema, generated client, and concrete repository implementations backed by PostgreSQL.

The domain layer (Phase 1) remains untouched — all new code lives in downstream packages that implement domain interfaces.

---

## 2. Scope

### In Scope

- `packages/db/` — Prisma schema covering all 9 entities, migration scaffolding, generated client re-exports
- `packages/infrastructure/` — All 9 repository interfaces implemented with PrismaClient
- `onion.config.json` — Add `infrastructure` and `db` layers with correct import rules
- Root `tsconfig.json` — Add project references for both new packages
- Integration tests — testcontainers-based tests for each Prisma repository against a real PostgreSQL instance
- Build chain — `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm fresh-onion` all pass

### Out of Scope (Future Phases)

- Filesystem storage adapter (`packages/infrastructure/src/storage/`) — deferred to Phase 3+
- Docker Git adapter (`packages/infrastructure/src/git/`) — deferred to Phase 11
- PDF Ruby sidecar adapter (`packages/infrastructure/src/pdf/`) — deferred to Phase 13
- Hocuspocus collaboration server — deferred to Phase 9
- API routes and controllers — deferred to Phase 3

---

## 3. Package Configuration

### 3.1 `packages/db/`

```
packages/db/
├── package.json            # @prisma/client dependency, prisma devDep
├── tsconfig.json           # composite, references shared
├── prisma/
│   └── schema.prisma       # All 9 entity mappings
└── src/
    └── index.ts            # Re-exports generated PrismaClient
```

**Dependencies:** `@prisma/client`
**DevDependencies:** `prisma`
**Import rule (onion):** `db` imports nothing from the monorepo

### 3.2 `packages/infrastructure/`

```
packages/infrastructure/
├── package.json            # Depends on domain, db, @prisma/client
├── tsconfig.json           # composite, references domain, shared, db
├── jest.config.ts          # testcontainers-friendly config
└── src/
    └── persistence/
        ├── prisma-project.repository.ts
        ├── prisma-user.repository.ts
        ├── prisma-file-node.repository.ts
        ├── prisma-document.repository.ts
        ├── prisma-project-member.repository.ts
        ├── prisma-git-repository.repository.ts
        ├── prisma-template.repository.ts
        ├── prisma-image.repository.ts
        └── prisma-audit-log.repository.ts
```

**Dependencies:** `@asciidocollab/domain`, `@asciidocollab/db`, `@prisma/client`
**Import rule (onion):** `infrastructure` may import `domain`, `shared`, `db`

### 3.3 Root Config Updates

**`onion.config.json`** — updated layers and rules:

| Layer | Path | Allows Imports From |
|-------|------|-------------------|
| `domain` | `./packages/domain/src` | `shared` |
| `shared` | `./packages/shared/src` | *(none)* |
| `infrastructure` | `./packages/infrastructure/src` | `domain`, `shared` |
| `db` | `./packages/db` | *(none)* |

**`tsconfig.json`** — add project references:
- `{ "path": "packages/db" }`
- `{ "path": "packages/infrastructure" }`

---

## 4. Prisma Schema Design

### 4.1 Schema Overview

All tables use PostgreSQL UUID columns for primary keys. Foreign keys are UUID columns with cascade or restrict rules matching domain invariants. Enum types use Prisma native `enum` for `Role`, `FileNodeType`, and `GitProvider`.

### 4.2 Enums

```prisma
enum Role {
  VIEWER
  EDITOR
  ADMINISTRATOR
}

enum FileNodeType {
  FILE
  FOLDER
}

enum GitProvider {
  GITHUB
  GITLAB
  BITBUCKET
}
```

### 4.3 Tables

**User**
```
id          String   @id @default(uuid())
email       String   @unique
displayName String
passwordHash String?
samlSubject  String?
mfaSecret    String?
createdAt   DateTime @default(now())
updatedAt   DateTime @updatedAt
```

**Project**
```
id          String   @id @default(uuid())
name        String
description String?
ownerId     String
createdAt   DateTime @default(now())
updatedAt   DateTime @updatedAt
```

**ProjectMember** (composite unique on projectId + userId)
```
projectId String
userId    String
role      Role
joinedAt  DateTime @default(now())
@@id([projectId, userId])
```

**FileNode** — self-referencing FK for parentId
```
id         String       @id @default(uuid())
projectId  String
parentId   String?
name       String
type       FileNodeType
path       String
createdAt  DateTime     @default(now())
updatedAt  DateTime     @updatedAt
@@index([projectId])
@@index([parentId])
```

**Document** — unique FileNodeId FK
```
id         String   @id @default(uuid())
fileNodeId String   @unique
contentId  String
yjsStateId String
mimeType   String
createdAt  DateTime @default(now())
updatedAt  DateTime @updatedAt
```

**Image**
```
id          String   @id @default(uuid())
projectId   String
filename    String
storagePath String
mimeType    String
sizeBytes   Int
parentId    String?
uploadedAt  DateTime @default(now())
updatedAt   DateTime?
@@index([projectId])
```

**Template**
```
id              String   @id @default(uuid())
name            String
description     String?
category        String
sourceProjectId String?
createdAt       DateTime @default(now())
```

**GitRepository** — unique ProjectId FK
```
id             String   @id @default(uuid())
projectId      String   @unique
provider       GitProvider
remoteUrl      String
credentialRef  String
currentBranch  String   @default("main")
lastSyncAt     DateTime?
createdAt      DateTime @default(now())
```

**AuditLog**
```
id          String   @id @default(uuid())
userId      String
projectId   String?
action      String
resourceType String
resourceId  String
timestamp   DateTime @default(now())
metadata    Json?
@@index([projectId])
@@index([userId])
```

### 4.4 Key Relationships

- Project → User (ownerId FK) — many-to-one, no cascade delete
- ProjectMember → Project + User — many-to-one on both sides, cascade delete child on project delete
- FileNode → Project — many-to-one, cascade delete children
- FileNode.parentId — self-referencing nullable FK to FileNode.id
- Document → FileNode — one-to-one via unique fileNodeId FK, cascade delete
- Image → Project — many-to-one
- GitRepository → Project — one-to-one via unique projectId FK
- Template → Project (sourceProjectId) — optional many-to-one
- AuditLog → User + Project — many-to-one, no cascade (audit retention)

---

## 5. Repository Implementation Pattern

Each repository follows the same structure. Example — `PrismaProjectRepository`:

```
class PrismaProjectRepository implements ProjectRepository
  constructor(prisma: PrismaClient)

  async findById(id: ProjectId): Promise<Project | null>
    → prisma.project.findUnique → toDomain()

  async findByOwnerId(ownerId: UserId): Promise<Project[]>
    → prisma.project.findMany → map(toDomain)

  async save(project: Project): Promise<void>
    → prisma.project.upsert (create or update)

  async delete(id: ProjectId): Promise<void>
    → prisma.project.delete
```

### 5.1 toDomain() mapping

Converts Prisma record to domain entity:

- UUID strings → domain ID VOs via `XxxId.create()`
- Prisma enum strings → domain VOs via `Role.create()`, `FileNodeType.create()`, etc.
- Dates → `Timestamps` value object
- Null handling matches domain model (nullable fields map to `| null`)

### 5.2 toPersistence() mapping

Converts domain entity to Prisma upsert input:

- Domain ID VOs → `.value` string
- Domain value objects → `.value` for enums, raw strings for others
- `Timestamps` → `{ createdAt, updatedAt }` Date objects
- Nulls preserved as-is

### 5.3 Special Cases

- **FileNodeRepository.move()** — `prisma.fileNode.update({ where: { id }, data: { parentId: newParentId } })`
- **ProjectMemberRepository.addMember()** — `prisma.projectMember.create`
- **ProjectMemberRepository.removeMember()** — `prisma.projectMember.delete({ where: { projectId_userId: { projectId, userId } } })`
- **ProjectMemberRepository.updateRole()** — `prisma.projectMember.update({ where: { projectId_userId: {...} }, data: { role } })`
- **AuditLogRepository** — `metadata` maps to/from Prisma `Json` type (Record<string, unknown>)

---

## 6. Integration Testing

### 6.1 Strategy

Each Prisma repository is tested against a real PostgreSQL instance via testcontainers. Contract tests mirror the in-memory fake tests from Phase 1, ensuring the same behavior through the same repository interface.

Test structure in `packages/infrastructure/tests/`:
```
tests/
└── persistence/
    ├── prisma-project.repository.test.ts
    ├── prisma-user.repository.test.ts
    ├── prisma-file-node.repository.test.ts
    ├── prisma-document.repository.test.ts
    ├── prisma-project-member.repository.test.ts
    ├── prisma-git-repository.repository.test.ts
    ├── prisma-template.repository.test.ts
    ├── prisma-image.repository.test.ts
    └── prisma-audit-log.repository.test.ts
```

### 6.2 Test Pattern

Each test file:
1. Spins up a PostgreSQL testcontainer using the `testcontainers` library
2. Runs Prisma migrations (`prisma db push` or migrate) against the test container
3. Creates a fresh `PrismaClient` connected to the test DB
4. Instantiates the repository under test
5. Runs the same scenarios as the in-memory fake tests (save, find, update, delete, edge cases)
6. Tears down the container

### 6.3 Dependencies

Dev dependencies for `packages/infrastructure`:
- `testcontainers` — PostgreSQL container management
- `@types/node` — Node.js type definitions

---

## 7. Implementation Tasks

### Phase 2a: Package Setup
1. Scaffold `packages/db/` with package.json, tsconfig.json, Prisma init
2. Scaffold `packages/infrastructure/` with package.json, tsconfig.json, jest.config.ts
3. Update `onion.config.json` with new layers
4. Update root `tsconfig.json` with project references
5. Verify `pnpm install`, `pnpm build` pass

### Phase 2b: Prisma Schema
1. Write `schema.prisma` with all 9 entity mappings
2. Generate `prisma migrate` scaffold
3. Generate and verify Prisma client types
4. Run `pnpm -F db build` to confirm generation

### Phase 2c: Repository Implementations
1. Implement `PrismaProjectRepository`
2. Implement `PrismaUserRepository`
3. Implement `PrismaProjectMemberRepository`
4. Implement `PrismaFileNodeRepository`
5. Implement `PrismaDocumentRepository`
6. Implement `PrismaImageRepository`
7. Implement `PrismaTemplateRepository`
8. Implement `PrismaGitRepositoryRepository`
9. Implement `PrismaAuditLogRepository`

### Phase 2d: Integration Tests
1. Set up testcontainers test helper (shared PostgreSQL startup)
2. Write tests for all 9 repositories
3. Verify all tests pass against real PostgreSQL
4. Run full `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm fresh-onion`
