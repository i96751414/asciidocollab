# Data Model: Project Management

**Date**: 2026-05-29
**Feature**: Phase 4 - Project Management

## Entities

### Project

Represents a documentation project.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | UUID | Yes | Unique identifier (ProjectId) |
| name | String | Yes | Human-readable project name (1-100 chars) |
| description | String | No | Optional long-form description |
| ownerId | UUID | Yes | Foreign key to User (project creator) |
| tags | Array[String] | Yes | Categorization tags (max 10, deduplicated) |
| rootFolderId | UUID | No | Foreign key to FileNode (root folder) |
| archivedAt | DateTime | No | Archive timestamp (null = active) |
| createdAt | DateTime | Yes | Creation timestamp |
| updatedAt | DateTime | Yes | Last update timestamp |

**Relationships**:
- Owner: belongs to User (ownerId → User.id)
- Members: has many ProjectMember
- Files: has many FileNode (via rootFolderId)
- AuditLogs: has many AuditLog

**Validation Rules**:
- Name: non-empty, max 100 characters, unique per owner
- Tags: max 10 items, deduplicated
- archivedAt: must be >= createdAt when provided

**State Transitions**:
```
Active → Archived (via archive())
Archived → Active (via unarchive/restore)
```

### ProjectMember

Represents a user's membership in a project with a specific role.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| projectId | UUID | Yes | Foreign key to Project |
| userId | UUID | Yes | Foreign key to User |
| role | Enum | Yes | Role: viewer, editor, administrator |
| joinedAt | DateTime | Yes | When the user joined |

**Relationships**:
- Project: belongs to Project (projectId → Project.id)
- User: belongs to User (userId → User.id)

**Validation Rules**:
- Role must be one of: viewer, editor, administrator
- Composite primary key (projectId, userId) - no duplicates
- Cannot remove project owner
- Cannot remove last administrator

**Role Permissions**:
| Action | Viewer | Editor | Administrator | Owner |
|--------|--------|--------|---------------|-------|
| View project | ✅ | ✅ | ✅ | ✅ |
| Edit files | ❌ | ✅ | ✅ | ✅ |
| Manage members | ❌ | ❌ | ✅ | ✅ |
| Edit settings | ❌ | ❌ | ✅ | ✅ |
| Archive project | ❌ | ❌ | ❌ | ✅ |

### User

Existing entity - no changes needed for Phase 4.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | UUID | Yes | Unique identifier (UserId) |
| email | String | Yes | Unique email address |
| displayName | String | Yes | User's display name |
| passwordHash | String | Yes | Hashed password |
| createdAt | DateTime | Yes | Creation timestamp |
| updatedAt | DateTime | Yes | Last update timestamp |

**Relationships**:
- OwnedProjects: has many Project (as owner)
- ProjectMemberships: has many ProjectMember

### AuditLog

Existing entity - extended for project management actions.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | UUID | Yes | Unique identifier (AuditLogId) |
| actorId | UUID | Yes | Foreign key to User (who performed action) |
| projectId | UUID | Yes | Foreign key to Project |
| action | String | Yes | Action performed (e.g., "project.created") |
| entityType | String | Yes | Type of entity affected |
| entityId | String | Yes | ID of entity affected |
| metadata | JSON | No | Additional action details |
| createdAt | DateTime | Yes | When the action occurred |

**Actions for Phase 4**:
- `project.created` - New project created
- `project.updated` - Project settings changed
- `project.archived` - Project archived
- `project.restored` - Project restored from archive
- `member.invited` - User invited to project
- `member.role_changed` - Member role updated
- `member.removed` - Member removed from project

## Value Objects

### Role

Enumerates project membership roles.

| Value | Description |
|-------|-------------|
| viewer | Read-only access |
| editor | Can edit files |
| administrator | Can manage members and settings |

### ProjectName

Validated project name value object.

- Factory method: `ProjectName.create(value)`
- Validation: 1-100 characters, non-empty
- Throws: `ValidationError` on invalid input

## In-Memory Fakes

All repository interfaces have corresponding in-memory fakes for testing:

- `InMemoryProjectRepository` - Map<ProjectId, Project>
- `InMemoryProjectMemberRepository` - Map<compositeKey, ProjectMember>
- `InMemoryAuditLogRepository` - Map<AuditLogId, AuditLog>

## Database Schema (Existing)

The Prisma schema already includes:
- `Project` table with all required fields
- `ProjectMember` table with composite key
- `AuditLog` table for tracking changes
- Proper indexes and foreign key constraints

No schema changes required for Phase 4.
