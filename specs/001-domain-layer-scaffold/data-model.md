# Data Model: Monorepo Scaffold & Domain Layer

## Entity-Relationship Overview

```
User ──╼ ProjectMember
Project ──╼ ProjectMember      (many-to-many via join entity)

Project ──╼ FileNode ──╼ Document  (type=file nodes only)
  │         └── FileNode (child)   (self-referential parentId, type=folder only)
  │
  ├── GitRepository (*)
  ├── Template (*)
  └── Image (*) (version chain)

User ──╼ AuditLog (*)

Legend:
  ──╼  "has-many" direction (source has many targets)
  │    vertical continuation of the owning entity's children
  (*)  optional relationship (0 or 1)
```

---

## Entities

### User

Core identity entity representing a human user of the system.

| Field | Type | Constraints |
|-------|------|-------------|
| id | UserId | UUID v4, required |
| email | Email | Unique, case-insensitive normalization |
| displayName | string | Required, max 255 chars |
| passwordHash | string | null | Null for SSO-only users |
| samlSubject | string | null | IdP NameID for SAML users |
| mfaSecret | string | null | Encrypted TOTP secret |
| createdAt | Date | Set on creation |
| updatedAt | Date | Updated on mutation |

**Invariants**:
- `email` MUST be unique (case-insensitive)
- At least one of `passwordHash` or `samlSubject` MUST be present
- `createdAt` <= `updatedAt`

---

### Project

Container for collaboration — groups documents, members, and configuration.

| Field | Type | Constraints |
|-------|------|-------------|
| id | ProjectId | UUID v4, required |
| name | ProjectName | Required, non-empty, max 100 chars |
| description | string | null | Optional, max 1000 chars |
| ownerId | UserId | Required, FK to User |
| tags | string[] | Optional, max 10 unique tags, each max 50 chars |
| rootFolderId | FileNodeId | Set atomically during the creation use case; never null after the use case completes |
| createdAt | Date | Set on creation |
| updatedAt | Date | Updated on mutation |
| archivedAt | Date | null | Set when archived |

**Invariants**:
- `name` MUST NOT be empty or whitespace-only
- `rootFolderId` MUST point to a FileNode of type=folder with parentId=null
- A project MUST have exactly one root folder
- `ownerId` MUST have a corresponding `ProjectMember` with `role=administrator`
- `archivedAt` can only be set once (no un-archive)

---

### ProjectMember

Association between a User and a Project with a role.

| Field | Type | Constraints |
|-------|------|-------------|
| projectId | ProjectId | FK to Project |
| userId | UserId | FK to User |
| role | Role | One of: viewer, editor, administrator |
| joinedAt | Date | Set when member is added |

**Invariants**:
- Unique constraint on (projectId, userId)
- A project MUST have at least one administrator (the owner)

---

### FileNode

A file or folder in the project's file tree.

| Field | Type | Constraints |
|-------|------|-------------|
| id | FileNodeId | UUID v4, required |
| projectId | ProjectId | FK to Project |
| parentId | FileNodeId | null | Null only for root folder |
| name | string | Required, max 255 chars |
| type | FileNodeType | One of: file, folder |
| path | FilePath | Materialized path |
| createdAt | Date | Set on creation |
| updatedAt | Date | Updated on mutation |

**Invariants**:
- Root folder (type=folder, parentId=null): exactly one per project
- All non-root nodes MUST have a non-null parentId
- `parentId` MUST reference an existing FileNode of type=folder
- `name` MUST be unique within the same parent folder
- `path` MUST be consistent with parent's path + name
- Deleting a folder MUST cascade to all descendants

---

### Document

An AsciiDoc text document associated with a FileNode.

| Field | Type | Constraints |
|-------|------|-------------|
| id | DocumentId | UUID v4, required |
| fileNodeId | FileNodeId | FK to FileNode, unique |
| contentId | ContentId | Opaque reference (UUID) to current content revision in content store |
| yjsStateId | YjsStateId | Opaque reference (UUID) to current Yjs CRDT state in state store |
| mimeType | MimeType | e.g., "text/asciidoc" |

**Invariants**:
- Exactly one Document per FileNode (FileNode with type=file)
- `contentId` and `yjsStateId` MUST be distinct UUIDs

---

### GitRepository

Git integration configuration linked to a Project.

| Field | Type | Constraints |
|-------|------|-------------|
| id | GitRepositoryId | UUID v4, required |
| projectId | ProjectId | FK to Project, unique |
| provider | GitProvider | One of: github, gitlab, bitbucket |
| remoteUrl | string | Valid URL, required |
| credentialRef | string | Reference to encrypted credential |
| currentBranch | string | Default: "main" |
| lastSyncAt | Date | null | Null before first sync |
| createdAt | Date | Set on creation |

**Invariants**:
- One GitRepository per Project

---

### Template

A reusable document template.

| Field | Type | Constraints |
|-------|------|-------------|
| id | TemplateId | UUID v4, required |
| name | string | Required, max 100 chars |
| description | string | null | Optional, max 500 chars |
| category | TemplateCategory | Required, non-empty, max 50 chars |
| sourceProjectId | ProjectId | null | FK to Project if created from a project |
| createdAt | Date | Set on creation |

---

### Image

An image asset with optional version tracking (append-only chain).

| Field | Type | Constraints |
|-------|------|-------------|
| id | ImageId | UUID v4, required |
| projectId | ProjectId | FK to Project |
| filename | string | Original filename |
| storagePath | string | Path on storage |
| mimeType | MimeType | e.g., "image/png" |
| sizeBytes | number | File size in bytes, MUST be > 0 |
| parentId | ImageId | null | Previous version (version chain) |
| uploadedAt | Date | Set on upload |
| updatedAt | Date | null | Set on mutation |

**Invariants**:
- `parentId` forms an append-only version chain (no branching)

---

### AuditLog

Security audit entry for tracking actions.

| Field | Type | Constraints |
|-------|------|-------------|
| id | AuditLogId | UUID v4, required |
| userId | UserId | FK to User |
| projectId | ProjectId | null | FK to Project, for scoped audit queries |
| action | string | e.g., "project.created", "member.invited" |
| resourceType | string | e.g., "Project", "FileNode" |
| resourceId | string | ID of the affected resource |
| timestamp | Date | Set on creation |
| metadata | Record<string, unknown> | Arbitrary JSON metadata |

**Written by use cases**: All mutating use cases create an AuditLog entry on success. GetProjectTree is exempted (read-only).

| Use Case | Action | resourceType | metadata (example) |
|---|---|---|---|
| CreateProject | "project.created" | "Project" | `{ projectName }` |
| RenameFile | "file.renamed" | "FileNode" | `{ oldName, newName }` |
| DeleteFile | "file.deleted" | "FileNode" | `{ fileType, parentId }` |
| InviteUser | "member.invited" | "ProjectMember" | `{ invitedEmail, role }` |
| RemoveMember | "member.removed" | "ProjectMember" | `{ removedUserId }` |
| ChangeMemberRole | "member.roleChanged" | "ProjectMember" | `{ oldRole, newRole }` |

---

## Relationship Invariants

Cross-entity rules that MUST hold true for the domain to be consistent.

### Project + User (Owner)

1. `Project.ownerId` MUST reference an existing User.
2. The owner MUST always be a `ProjectMember` with `role=administrator`.
3. The owner's membership MUST NOT be removed (`RemoveMember` rejects with `CannotRemoveOwnerError`).
4. The owner's role MUST NOT be changed away from `administrator` (`ChangeMemberRole` rejects with `CannotChangeOwnerRoleError`).

### Project + ProjectMember

1. `ProjectMember.projectId` MUST reference an existing Project.
2. `ProjectMember.userId` MUST reference an existing User.
3. `(projectId, userId)` MUST be unique.
4. A Project MUST have **at least one administrator** at all times. Removing or demoting the last administrator is rejected with `CannotRemoveLastAdminError`.

### Project + Root Folder

1. `Project.rootFolderId` MUST reference a `FileNode` with `type=folder`, `parentId=null`, and `projectId` matching the Project.
2. `rootFolderId` is set atomically during Project creation and MUST NOT be null after creation.

### FileNode + FileNode (parent-child)

1. `FileNode.parentId` MUST reference a `FileNode` with `type=folder` within the same project.
2. `parentId` is `null` only for the root folder; all other FileNodes MUST have a non-null `parentId`.
3. Exactly one root folder exists per project.
4. Deleting a folder (type=folder) MUST cascade to all descendant FileNodes and their Documents.

### FileNode + Document

1. `Document.fileNodeId` MUST reference a `FileNode` with `type=file`. Attaching a Document to a folder FileNode is rejected with `CannotAttachDocumentToFolderError`.
2. Exactly one Document per file-type FileNode (`fileNodeId` is unique).

### FileNode.path Consistency

1. For a non-root FileNode: `path` MUST equal `parent.path + "/" + name`.
2. Renaming a FileNode MUST recursively update `path` for all descendants.
3. Moving a FileNode (changing `parentId`) MUST recursively update `path` for all descendants.

### GitRepository + Project

1. `GitRepository.projectId` MUST reference an existing Project and MUST be unique across the system (one GitRepository per Project).

### Image + Project + Image (version chain)

1. `Image.projectId` MUST reference an existing Project.
2. `Image.parentId` MUST reference an existing Image within the same project.
3. `parentId` forms an append-only version chain: no branching, no cycles.
4. Deleting a non-head Image (one with descendants) MUST be blocked or the chain MUST be re-linked.

### Template + Project

1. `Template.sourceProjectId` MUST reference an existing Project if non-null.

### AuditLog + User + Project

1. `AuditLog.userId` MUST reference an existing User (immutable — audit trails never lose the actor reference).
2. `AuditLog.projectId` is optional; when set, it enables project-scoped audit queries without scanning `metadata`.

## Cascade Semantics

Delete operations cascade as follows. "Restrict" means the delete is rejected if related entities exist.

| Delete Action | Cascade | Restrict | Set Null | Notes |
|---|---|---|---|---|
| **Project** | FileNode, Document, ProjectMember, GitRepository, Image (all), Template (if sourceProjectId matches) | — | AuditLog.projectId | — |
| **FileNode (folder)** | All descendant FileNodes + their Documents | — | — | Recursive; entire subtree removed |
| **FileNode (file)** | Document | — | — | — |
| **User (owner)** | — | Delete Project; if owner, block with `CannotRemoveOwnerError` | — | Ownership transfer is future scope |
| **User (non-owner)** | AuditLog entries remain | ProjectMember | — | — |
| **Image (head version)** | — | — | — | Head deletion allowed; prior versions survive |
| **Image (non-head)** | — | Block delete; must delete from head | — | Enforced via version chain invariant |

---

## Aggregate Boundaries

Aggregates define transactional consistency boundaries. References between aggregates use IDs only (never object references).

| Aggregate Root | Entities Within | Notes |
|---|---|---|
| **User** | User, AuditLog | AuditLog is append-only; never modified after creation |
| **Project** | Project, FileNode, Document, ProjectMember, GitRepository | Loaded together for mutations; FileNode tree can be partially loaded for reads via repository queries |
| **Image** | Image | Separate root despite projectId FK — loaded independently, eventual consistency with Project (cascade on delete) |
| **Template** | Template | Can live independently of any Project (global templates have sourceProjectId=null) |

### Cross-Aggregate Reference Map

| Source Aggregate | Referenced By | Via Field |
|---|---|---|
| User | Project | `Project.ownerId` |
| User | ProjectMember | `ProjectMember.userId` |
| User | AuditLog | `AuditLog.userId` |
| Project | ProjectMember | `ProjectMember.projectId` |
| Project | Image | `Image.projectId` |
| Project | Template | `Template.sourceProjectId` (nullable) |
| Project | AuditLog | `AuditLog.projectId` (optional, nullable) |

All cross-aggregate invariants (e.g., "owner is always an admin") are enforced at the **use case** level, not at the entity level.

---

## Value Objects

| Value Object | Base Type | Validation |
|-------------|-----------|------------|
| UserId | UUID v4 string | Valid UUID format |
| ProjectId | UUID v4 string | Valid UUID format |
| FileNodeId | UUID v4 string | Valid UUID format |
| DocumentId | UUID v4 string | Valid UUID format |
| GitRepositoryId | UUID v4 string | Valid UUID format |
| TemplateId | UUID v4 string | Valid UUID format |
| ImageId | UUID v4 string | Valid UUID format |
| AuditLogId | UUID v4 string | Valid UUID format |
| Email | string | RFC 5322 email format; case-insensitive |
| FilePath | string | Must start with `/`; valid path characters; no `..` or path traversal sequences |
| Role | enum | One of: "viewer", "editor", "administrator" |
| ProjectName | string | Non-empty, <= 100 chars, no leading/trailing whitespace |
| GitProvider | enum | One of: "github", "gitlab", "bitbucket" |
| MimeType | string | Valid MIME type format |
| FileNodeType | enum | One of: "file", "folder" |
| ContentId | UUID v4 string | Opaque reference to content revision |
| YjsStateId | UUID v4 string | Opaque reference to Yjs CRDT state |
| TemplateCategory | string | Required, non-empty, max 50 chars |

---

## Result Type

```typescript
// Shared type for all fallible domain operations
type Result<T, E extends DomainError> =
  | { success: true; value: T }
  | { success: false; error: E };
```

## Domain Error Hierarchy

```
DomainError (base)
├── ProjectNotFoundError
├── UserNotFoundError
├── FileNodeNotFoundError
├── PermissionDeniedError
├── DuplicateEmailError
├── InvalidProjectNameError
├── FileConflictError
├── ProjectMemberAlreadyExistsError
├── CannotRemoveOwnerError
├── CannotChangeOwnerRoleError
├── CannotRemoveLastAdminError
└── CannotAttachDocumentToFolderError
```
