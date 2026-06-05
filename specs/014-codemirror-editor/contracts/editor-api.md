# API Contracts: Editor Preferences

**Branch**: `014-codemirror-editor` | **Date**: 2026-06-04

---

## Overview

Phase 6 introduces two new API endpoints for editor preferences. All other editor operations (reading/writing file content, browsing the file tree for include-path completion) reuse **existing** endpoints and require no new routes.

---

## Existing Endpoints (reused, no changes)

| Method | Path | Used by |
|--------|------|---------|
| `GET` | `/projects/:projectId/files/:fileNodeId/content` | Initial load of file content into editor |
| `PUT` | `/projects/:projectId/files/:fileNodeId/content` | Auto-save on debounce expiry |
| `GET` | `/projects/:projectId/tree` | Include-path completion (project file list) |

**ETag header addition** (minimal change to existing GET endpoint):
The `GET /projects/:projectId/files/:fileNodeId/content` route will include an `ETag: "<contentId>"` response header. This lets the frontend detect external saves by polling with `If-None-Match`. A 304 response means no change; a 200 response means another user has saved.

---

## New Endpoints

### GET /users/me/editor-preferences

Returns the authenticated user's editor preferences. If no preferences have been saved yet, returns the default values.

**Authentication**: Required (existing `requireAuth` plugin).

**Response 200**:

```json
{
  "fontSize": 14,
  "theme": "default"
}
```

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `fontSize` | integer | 8–32 | Editor font size in pixels |
| `theme` | string | `"default"`, `"high-contrast"` | Active colour theme |

**Response 401**: Unauthenticated.

---

### PUT /users/me/editor-preferences

Persists the authenticated user's editor preferences. Uses upsert semantics.

**Authentication**: Required.

**Request body**:

```json
{
  "fontSize": 16,
  "theme": "high-contrast"
}
```

**Validation** (Fastify JSON schema):

```json
{
  "type": "object",
  "required": ["fontSize", "theme"],
  "additionalProperties": false,
  "properties": {
    "fontSize": { "type": "integer", "minimum": 8, "maximum": 32 },
    "theme": { "type": "string", "enum": ["default", "high-contrast"] }
  }
}
```

**Response 204**: Preferences saved. No body.

**Response 400**: Validation failure. Body: `{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }`

**Response 401**: Unauthenticated.

---

## Shared DTO *(packages/shared)*

```ts
// packages/shared/src/dtos/editor-preferences.dto.ts

export interface EditorPreferencesDto {
  fontSize: number;
  theme: 'default' | 'high-contrast';
}

export interface UpdateEditorPreferencesDto {
  fontSize: number;
  theme: 'default' | 'high-contrast';
}
```

These DTOs are the single source of truth for the shape crossing the API boundary. Both the Fastify route handler and the Next.js `fetch` wrapper use them. They MUST NOT be independently redefined in `apps/api` or `apps/web`.

---

## ETag Change Detection Protocol

1. On initial file load, the frontend stores the `ETag` value from the `GET content` response header.
2. Every 30 seconds, the frontend sends `GET /projects/:projectId/files/:fileNodeId/content` with `If-None-Match: "<storedETag>"`.
3. A **304** response: no external change — polling continues silently.
4. A **200** response: a different user has saved — the frontend shows a toast ("This file was updated by another user") and updates the stored ETag. The user's in-progress edits are NOT overwritten; they must decide whether to keep theirs or reload.
