# AsciiDocCollab — Architecture Design

**Date:** 2026-05-26  
**Status:** Approved

---

## 1. Overview

AsciiDocCollab is a browser-based collaborative AsciiDoc editor supporting real-time multi-user editing, project and file management, Git integration, HTML live preview, PDF generation, and enterprise authentication. It is designed for both self-hosted (on-premises) and SaaS (cloud-hosted) deployments.

---

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend framework | Next.js 14 (App Router) + TypeScript | SSR for dashboard/auth flows; editor runs as client component |
| Code editor | CodeMirror 6 | Lightweight, extensible, excellent Yjs binding |
| HTML preview | Asciidoctor.js (client-side, Web Worker) | Zero server round-trips for live preview |
| API server | Node.js + TypeScript + Fastify | Schema-first, fast, good plugin ecosystem |
| Real-time CRDT | Yjs | De-facto standard for collaborative text editing |
| Collaboration server | Hocuspocus (standalone process) | Purpose-built Yjs server with auth hooks and persistence |
| PDF generation | Asciidoctor-PDF (Ruby sidecar) | Production-quality PDF via the canonical Ruby gem |
| Database | PostgreSQL | Relational integrity, JSONB for flexible metadata |
| ORM | Prisma | Type-safe schema, migrations |
| Authentication | Passport.js + passport-saml | Local accounts + SAML 2.0 + Entra ID SSO |
| File storage | Local filesystem | Configurable root path; suitable for self-hosted and container volumes |
| Git isolation | Docker sandbox containers | Spawned per operation to satisfy FR-011 sandboxing |
| Monorepo tooling | pnpm workspaces | Shared types between all packages |
| Unit/integration tests | Jest + Testing Library | Standard for Next.js ecosystem |
| E2E tests | Playwright | Cross-browser end-to-end coverage |

---

## 3. Architecture

### 3.1 Architectural Style

The system follows **Clean Architecture**. Dependencies flow strictly inward:

```
┌─────────────────────────────────────────────────────────────┐
│  Frameworks & Drivers (outermost)                           │
│  Next.js, Fastify, Prisma, Hocuspocus, Docker, filesystem   │
├─────────────────────────────────────────────────────────────┤
│  Interface Adapters                                         │
│  Route controllers, repository implementations, presenters  │
├─────────────────────────────────────────────────────────────┤
│  Application Layer (Use Cases)                              │
│  CreateProject, RenameFile, CommitChanges, RenderPDF, ...   │
├─────────────────────────────────────────────────────────────┤
│  Domain (Entities + Rules) — zero outward dependencies      │
│  Project, Document, User, Permission, GitRepository         │
└─────────────────────────────────────────────────────────────┘
```

**Rules enforced:**
- The `domain` package has no external dependencies (no Prisma, no Fastify, no filesystem).
- The `infrastructure` package implements domain interfaces; domain never imports infrastructure.
- All cross-boundary communication uses DTOs defined in `shared`.
- Dependency injection wires concrete implementations to domain interfaces at startup.

### 3.2 Deployment Topology

```
┌──────────────────────────────────────────────────────────┐
│                    Docker Compose Stack                    │
│                                                            │
│  ┌─────────────────────┐   ┌──────────────────────────┐   │
│  │  Next.js Frontend   │   │  Fastify API             │   │
│  │  (port 3000)        │   │  (port 4000)             │   │
│  └──────────┬──────────┘   └────────────┬─────────────┘   │
│             │                           │                  │
│  ┌──────────▼───────────────────────────▼─────────────┐   │
│  │           Hocuspocus Collaboration Server          │   │
│  │           (port 4001, WebSocket)                   │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  ┌─────────────────┐  ┌──────────────┐  ┌─────────────┐   │
│  │   PostgreSQL    │  │  Filesystem  │  │  PDF Ruby   │   │
│  │   (port 5432)   │  │   Volume     │  │  Sidecar    │   │
│  └─────────────────┘  └──────────────┘  └─────────────┘   │
│                                                            │
│  ┌────────────────────────────────────────────────────┐   │
│  │   Git Sandbox Containers (spawned per operation)   │   │
│  └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### 3.3 Monorepo Structure

```
asciidocollab/
├── apps/
│   ├── web/                      # Next.js 14 — delivery mechanism only
│   └── api/                      # Fastify — delivery mechanism only
├── packages/
│   ├── domain/                   # Entities, value objects, use cases, repository interfaces
│   │   └── src/
│   │       ├── entities/         # Project, Document, User, Permission, GitRepository
│   │       ├── value-objects/    # ProjectId, UserId, FilePath, Role, ...
│   │       ├── repositories/     # ProjectRepository, DocumentRepository (interfaces)
│   │       ├── use-cases/        # CreateProject, RenameFile, InviteUser, CommitChanges, ...
│   │       └── errors/           # ProjectNotFoundError, PermissionDeniedError, ...
│   ├── infrastructure/           # Concrete implementations
│   │   └── src/
│   │       ├── persistence/      # PrismaProjectRepository, PrismaDocumentRepository, ...
│   │       ├── storage/          # FilesystemStorageAdapter
│   │       ├── git/              # DockerGitAdapter
│   │       └── pdf/              # RubySidecarPdfAdapter
│   ├── collaboration/            # Hocuspocus server (standalone process)
│   ├── shared/                   # DTOs, error types, shared TypeScript interfaces
│   └── db/                       # Prisma schema, migrations, generated client
├── docker/
│   ├── git-sandbox/              # Dockerfile for sandboxed git operations
│   └── pdf/                      # Dockerfile for Asciidoctor-PDF Ruby service
├── docker-compose.yml
├── docker-compose.prod.yml
└── pnpm-workspace.yaml
```

### 3.4 Request Flow

- **Dashboard/auth pages:** Browser → Next.js (SSR) → Fastify API
- **Editor:** Browser → Next.js (client component: CodeMirror + Yjs) → WebSocket to Hocuspocus (collab) + HTTP to Fastify (save, metadata)
- **File operations:** Browser → Fastify API → `domain` use case → `PrismaFileNodeRepository` + `FilesystemStorageAdapter`
- **PDF generation:** Browser → Fastify API → `RubySidecarPdfAdapter` → Ruby container → PDF stream returned
- **Git operations:** Browser → Fastify API → `DockerGitAdapter` → spawned sandbox container → result streamed back

---

## 4. Data Model

### 4.1 Core Entities

```
User
  id            UUID PK
  email         String UNIQUE
  displayName   String
  passwordHash  String?         # null for SSO-only users
  samlSubject   String?         # IdP NameID for SAML users
  mfaSecret     String?         # encrypted TOTP secret
  createdAt     DateTime
  updatedAt     DateTime

Project
  id            UUID PK
  name          String
  description   String?
  ownerId       UUID FK → User
  tags          String[]
  rootFolderId  UUID FK → FileNode   # set atomically on creation
  createdAt     DateTime
  updatedAt     DateTime
  archivedAt    DateTime?

ProjectMember
  projectId     UUID FK → Project
  userId        UUID FK → User
  role          Enum: viewer | editor | administrator
  PRIMARY KEY (projectId, userId)

FileNode
  id            UUID PK
  projectId     UUID FK → Project
  parentId      UUID? FK → FileNode  # null only for root folder
  name          String
  type          Enum: file | folder
  path          String              # materialized path (e.g. /docs/api/overview.adoc)
  createdAt     DateTime
  updatedAt     DateTime

Document
  id            UUID PK
  fileNodeId    UUID FK → FileNode UNIQUE
  contentPath   String              # path to file content on filesystem
  yjsStatePath  String              # path to persisted Yjs binary state
  mimeType      String

GitRepository
  id            UUID PK
  projectId     UUID FK → Project UNIQUE
  provider      Enum: github | gitlab | bitbucket
  remoteUrl     String
  credentialRef String              # reference to encrypted credential in secret store
  currentBranch String
  lastSyncAt    DateTime?

Template
  id            UUID PK
  name          String
  description   String?
  category      String
  sourceProjectId UUID? FK → Project
  createdAt     DateTime

Image
  id            UUID PK
  projectId     UUID FK → Project
  filename      String
  storagePath   String
  mimeType      String
  sizeBytes     Int
  parentId      UUID? FK → Image    # for version tracking (append-only chain)
  uploadedAt    DateTime

AuditLog
  id            UUID PK
  userId        UUID FK → User
  action        String
  resourceType  String
  resourceId    UUID
  timestamp     DateTime
  metadata      JSONB
```

### 4.2 Key Relationships

- `Project` has exactly one root `FileNode` (type=folder, parentId=null), referenced by `Project.rootFolderId`.
- All other `FileNode` rows for a project have `parentId` set (never null after initial creation).
- `FileNode` (type=file) has exactly one `Document` child.
- `Project` optionally has one `GitRepository`.
- `ProjectMember` is the join table for User ↔ Project with role assignment.
- `Image.parentId` forms a version chain (each new version points to its predecessor).

### 4.3 Project Creation Invariant

When a `Project` is created, the following happens atomically in a single database transaction:

1. Insert `Project` row (rootFolderId temporarily null).
2. Insert root `FileNode` (type=folder, parentId=null, name=project.name, projectId=new project id).
3. Update `Project.rootFolderId` = new FileNode id.

This invariant ensures every project always has a root folder.

---

## 5. Authentication & Access Control

### 5.1 Authentication Strategies

- **Local accounts:** email + bcrypt password hash. Managed via Passport.js `local` strategy.
- **SAML 2.0:** via `passport-saml`. Supports Entra ID (Microsoft) and generic SAML 2.0 providers. Users are matched by `samlSubject` (IdP NameID); new users are provisioned on first SSO login.
- **Sessions:** server-side sessions stored in PostgreSQL via `connect-pg-simple`. HTTP-only, Secure cookies. Configurable TTL.
- **MFA:** TOTP via `otplib`. Users enroll via QR code; secret stored encrypted on the `User` row. Enforced at login after password validation.

### 5.2 Role-Based Access Control

Roles are assigned per project via `ProjectMember`. Global administrators (system-wide) are a separate flag on `User`.

| Action | Viewer | Editor | Administrator |
|---|---|---|---|
| Read files and preview | ✓ | ✓ | ✓ |
| Edit files | | ✓ | ✓ |
| Upload/delete files | | ✓ | ✓ |
| Generate PDF | ✓ | ✓ | ✓ |
| Git operations | | ✓ | ✓ |
| Manage project members | | | ✓ |
| Rename/delete project | | | ✓ |
| Connect Git repository | | | ✓ |

### 5.3 Additional Controls

- **IP restrictions:** configurable allowlist (CIDR ranges) per installation, enforced in Fastify middleware before any route handler.
- **Encryption in transit:** TLS terminated at the load balancer/reverse proxy (Nginx or cloud LB).
- **Encryption at rest:** PostgreSQL volume encryption at the infrastructure level; credential secrets encrypted with AES-256 before storage.

---

## 6. Collaboration & Editor

### 6.1 Editor

- CodeMirror 6 with a custom AsciiDoc Lezer grammar for syntax highlighting.
- Auto-completion for AsciiDoc attributes, cross-references, and include directives.
- `y-codemirror.next` binds the CodeMirror document state to a Yjs `Y.Text` type.
- Auto-save: debounced write to Fastify API (content flush) after 2 seconds of inactivity.
- CodeFolding, multi-cursor, find/replace, and regex search via CodeMirror 6 built-in extensions.

### 6.2 Collaboration Server (Hocuspocus)

- Runs as a standalone Node.js process (`packages/collaboration`).
- Each open document maps to a Hocuspocus room keyed by `documentId`.
- On WebSocket connect: Hocuspocus calls the Fastify API to verify the connecting user has at least `viewer` access. Unauthenticated or unauthorized connections are rejected immediately.
- Yjs document state is persisted to filesystem (`.yjs` binary files) by Hocuspocus's persistence hook.
- Awareness data (cursor positions, user presence) is transmitted via Yjs awareness protocol and never persisted.
- Collaborative undo/redo: each client maintains its own `UndoManager` scoped to its own operations.

### 6.3 HTML Preview

- Asciidoctor.js is loaded once in the browser as a dedicated Web Worker.
- Editor changes are debounced and the current document text is posted to the worker.
- The worker renders HTML and posts the result back; the preview pane updates without blocking the editor thread.
- Side-by-side and full-screen modes are toggled via UI layout state.

---

## 7. Git Integration & Sandbox

### 7.1 Isolation (FR-011)

Each git operation spawns a short-lived Docker container from the `git-sandbox` image:

- The container mounts **only** the requesting project's file directory (read-write).
- No other project directories or host paths are mounted.
- Network egress is restricted to the configured remote URL for that operation.
- The container is destroyed immediately after the operation completes or times out.

### 7.2 Credential Handling

- Git credentials (tokens, SSH keys) are stored encrypted (AES-256) in the database via `GitRepository.credentialRef`.
- Credentials are decrypted at runtime in the Fastify process using the application's AES-256 encryption key (provided via environment variable) and injected into the sandbox container as environment variables.
- Credentials are never written to disk inside or outside the container.

### 7.3 Provider Abstraction

A `GitProviderAdapter` interface is defined in `domain`. Implementations in `infrastructure`:

- `GithubGitAdapter`
- `GitlabGitAdapter`
- `BitbucketGitAdapter`

All three support configurable base URLs for self-hosted instances.

Merge requests and pull requests are created via each provider's REST API (not via git protocol).

### 7.4 Supported Operations

clone, pull, push, commit, branch switch, merge request / pull request creation.

---

## 8. Error Handling

- Domain errors are typed value objects (e.g., `ProjectNotFoundError`, `PermissionDeniedError`, `FileConflictError`). No raw strings or generic `Error` instances in the domain layer.
- Use cases return `Result<T, DomainError>` (discriminated union) — no exception-driven control flow in the domain or application layers.
- Infrastructure adapters catch external errors (DB failures, container timeouts, filesystem errors) at the adapter boundary and map them to domain error types.
- Fastify's error handler maps domain errors to HTTP status codes and returns structured JSON error responses.
- The Next.js frontend maps API error responses to user-facing messages via a centralized error display layer.

---

## 9. Testing Strategy

| Layer | Test type | Tool |
|---|---|---|
| Domain entities & use cases | Unit tests (pure, no I/O) | Jest |
| Repository/adapter implementations | Integration tests (real DB/filesystem) | Jest + testcontainers |
| API routes | Integration tests (HTTP) | Jest + Fastify inject |
| Frontend components | Unit + interaction tests | Jest + Testing Library |
| Collaboration | Integration tests (WebSocket) | Jest + Hocuspocus test client |
| End-to-end flows | E2E tests | Playwright |

**Key principle:** Domain use cases are tested with in-memory fakes (not mocks) of repository interfaces. This keeps unit tests fast, honest, and decoupled from infrastructure choices.

---

## 10. Phased Delivery

The system is large enough to require phased implementation. Recommended order:

| Phase | Scope |
|---|---|
| 1 | Monorepo setup, domain entities, PostgreSQL schema, auth (local + SAML), project & file management |
| 2 | CodeMirror editor, Asciidoctor.js preview, single-user editing, auto-save |
| 3 | Hocuspocus collaboration server, real-time multi-user editing, presence indicators |
| 4 | Git integration (Docker sandbox, provider adapters) |
| 5 | PDF generation (Ruby sidecar), template system, image management |
| 6 | MFA, IP restrictions, audit log, advanced RBAC, performance hardening |
