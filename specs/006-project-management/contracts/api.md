# API Contracts: Project Management

**Date**: 2026-05-29
**Feature**: Phase 4 - Project Management

## Base URL

```
/api
```

## Authentication

All endpoints require session-based authentication via HTTP-only cookies.

## Error Response Format

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| UNAUTHORIZED | 401 | User not authenticated |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| VALIDATION_ERROR | 400 | Invalid input data |
| CONFLICT | 409 | Resource already exists |
| PROJECT_LIMIT_EXCEEDED | 400 | User has reached project limit |

---

## Project Endpoints

### List Projects

**Endpoint**: `GET /api/projects`

**Description**: Get all projects where the user is a member.

**Query Parameters**:
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| page | number | No | 1 | Page number |
| limit | number | No | 20 | Items per page (max 100) |
| archived | boolean | No | false | Include archived projects |

**Response (200)**:
```json
{
  "data": {
    "projects": [
      {
        "id": "uuid",
        "name": "Project Name",
        "description": "Optional description",
        "ownerId": "uuid",
        "ownerName": "Display Name",
        "tags": ["tag1", "tag2"],
        "role": "administrator",
        "archivedAt": null,
        "createdAt": "2026-05-29T00:00:00Z",
        "updatedAt": "2026-05-29T00:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3
    }
  }
}
```

---

### Create Project

**Endpoint**: `POST /api/projects`

**Description**: Create a new project.

**Request Body**:
```json
{
  "name": "Project Name",
  "description": "Optional description",
  "tags": ["tag1", "tag2"]
}
```

**Validation**:
- `name`: required, 1-100 characters
- `description`: optional, max 1000 characters
- `tags`: optional, array of strings, max 10 items

**Response (201)**:
```json
{
  "data": {
    "id": "uuid",
    "name": "Project Name",
    "description": "Optional description",
    "ownerId": "uuid",
    "tags": ["tag1", "tag2"],
    "rootFolderId": "uuid",
    "createdAt": "2026-05-29T00:00:00Z",
    "updatedAt": "2026-05-29T00:00:00Z"
  }
}
```

**Errors**:
- 400: Validation error (invalid name, too many tags)
- 409: Project name already exists for this owner

---

### Get Project

**Endpoint**: `GET /api/projects/:id`

**Description**: Get project details by ID.

**Response (200)**:
```json
{
  "data": {
    "id": "uuid",
    "name": "Project Name",
    "description": "Optional description",
    "ownerId": "uuid",
    "ownerName": "Display Name",
    "tags": ["tag1", "tag2"],
    "rootFolderId": "uuid",
    "archivedAt": null,
    "memberCount": 5,
    "createdAt": "2026-05-29T00:00:00Z",
    "updatedAt": "2026-05-29T00:00:00Z"
  }
}
```

**Errors**:
- 404: Project not found
- 403: User is not a member of this project

---

### Update Project

**Endpoint**: `PATCH /api/projects/:id`

**Description**: Update project settings (name, description, tags).

**Request Body**:
```json
{
  "name": "New Project Name",
  "description": "New description",
  "tags": ["new-tag1", "new-tag2"]
}
```

**Validation**:
- `name`: optional, 1-100 characters
- `description`: optional, max 1000 characters
- `tags`: optional, array of strings, max 10 items
- At least one field must be provided

**Response (200)**:
```json
{
  "data": {
    "id": "uuid",
    "name": "New Project Name",
    "description": "New description",
    "tags": ["new-tag1", "new-tag2"],
    "updatedAt": "2026-05-29T00:00:00Z"
  }
}
```

**Errors**:
- 400: Validation error
- 403: User is not an administrator
- 404: Project not found
- 409: Project name already exists for this owner

---

### Archive Project

**Endpoint**: `POST /api/projects/:id/archive`

**Description**: Archive a project (soft delete).

**Response (200)**:
```json
{
  "data": {
    "id": "uuid",
    "archivedAt": "2026-05-29T00:00:00Z"
  }
}
```

**Errors**:
- 403: User is not the project owner
- 404: Project not found
- 400: Project is already archived

---

### Restore Project

**Endpoint**: `POST /api/projects/:id/restore`

**Description**: Restore an archived project.

**Response (200)**:
```json
{
  "data": {
    "id": "uuid",
    "archivedAt": null
  }
}
```

**Errors**:
- 403: User is not the project owner
- 404: Project not found
- 400: Project is not archived

---

## Member Endpoints

### List Members

**Endpoint**: `GET /api/projects/:id/members`

**Description**: Get all members of a project.

**Response (200)**:
```json
{
  "data": {
    "members": [
      {
        "userId": "uuid",
        "email": "user@example.com",
        "displayName": "User Name",
        "role": "editor",
        "joinedAt": "2026-05-29T00:00:00Z"
      }
    ]
  }
}
```

**Errors**:
- 403: User is not a member of this project
- 404: Project not found

---

### Invite Member

**Endpoint**: `POST /api/projects/:id/members`

**Description**: Invite a user to the project by email.

**Request Body**:
```json
{
  "email": "user@example.com",
  "role": "editor"
}
```

**Validation**:
- `email`: required, valid email format
- `role`: required, one of: viewer, editor, administrator

**Response (201)**:
```json
{
  "data": {
    "userId": "uuid",
    "email": "user@example.com",
    "displayName": "User Name",
    "role": "editor",
    "joinedAt": "2026-05-29T00:00:00Z"
  }
}
```

**Errors**:
- 400: Invalid email or role
- 403: User is not an administrator
- 404: Project not found or user not found
- 409: User is already a member

---

### Update Member Role

**Endpoint**: `PATCH /api/projects/:id/members/:userId`

**Description**: Change a member's role.

**Request Body**:
```json
{
  "role": "administrator"
}
```

**Validation**:
- `role`: required, one of: viewer, editor, administrator

**Response (200)**:
```json
{
  "data": {
    "userId": "uuid",
    "role": "administrator"
  }
}
```

**Errors**:
- 400: Invalid role
- 403: User is not an administrator
- 404: Project or member not found
- 400: Cannot change owner's role

---

### Remove Member

**Endpoint**: `DELETE /api/projects/:id/members/:userId`

**Description**: Remove a member from the project.

**Response (200)**:
```json
{
  "data": {
    "message": "Member removed successfully"
  }
}
```

**Errors**:
- 403: User is not an administrator
- 404: Project or member not found
- 400: Cannot remove project owner
- 400: Cannot remove last administrator

---

## Shared DTOs

### ProjectDto

```typescript
interface ProjectDto {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  ownerName: string;
  tags: string[];
  rootFolderId: string | null;
  archivedAt: string | null;
  memberCount?: number;
  role?: 'viewer' | 'editor' | 'administrator';
  createdAt: string;
  updatedAt: string;
}
```

### ProjectMemberDto

```typescript
interface ProjectMemberDto {
  userId: string;
  email: string;
  displayName: string;
  role: 'viewer' | 'editor' | 'administrator';
  joinedAt: string;
}
```

### PaginationDto

```typescript
interface PaginationDto {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
```
