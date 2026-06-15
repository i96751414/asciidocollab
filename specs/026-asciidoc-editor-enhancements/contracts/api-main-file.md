# Contract: Project Main-File Setting API (FR-045)

The only new server contract in this feature. Lets a project member designate the main/master AsciiDoc file that roots cross-file resolution (US8). All other features are client-side editor behavior (see `editor-extensions.md`).

## Project DTO change (`packages/shared`)

```diff
 ProjectDto {
   id: string
   name: string
   rootFolderId: string
+  mainFileNodeId: string | null   // configured main AsciiDoc file; null ⇒ current-file-only resolution
   ...
 }
```

## PUT /projects/{projectId}/main-file

Set or clear the project's main file.

**Auth**: authenticated. The project-edit permission check is enforced **inside `SetProjectMainFileUseCase`**
(it takes the `actorId`, loads the caller's project membership, and rejects non-editors), mirroring
`UpdateProjectUseCase`. The route MUST NOT duplicate or independently perform the permission check
(security_constitution: "Permission checks MUST live in use cases, not in route handlers"); it only
authenticates the session, maps the request, and translates the typed `Result` to HTTP. A denial is
recorded via the audit log (actor, resource, reason) per the security constitution.

**Path params**: `projectId: string`.

**Request body** (Fastify schema + Zod):
```json
{ "mainFileNodeId": "string | null" }
```

**Responses**:
| Status | Condition | Body |
|--------|-----------|------|
| `200` | set/cleared | updated `ProjectDto` |
| `400` | node not an `.adoc` file | `{ error: "MainFileNotAsciiDoc" }` |
| `403` | caller lacks project-edit permission (from the use-case `Result`) | `{ error: "PermissionDenied" }` |
| `404` | project or node not found / not in project | `{ error: "MainFileNotFound" }` |
| `401` | unauthenticated | error |
| `429` | per-route rate limit exceeded | `{ error: { code: "RATE_LIMITED", ... } }` (existing error handler) |

**Validation & authorization** (all delegated to `SetProjectMainFileUseCase`, returns `Result` — the route performs no business checks):
- Caller MUST have project-edit permission: the use case loads `actorId`'s membership and returns `PermissionDeniedError` (→ 403) + records an authorization-denial audit entry if not permitted.
- `mainFileNodeId === null` ⇒ clear (always allowed for an authorized caller).
- else node MUST exist, belong to `projectId`, and have an AsciiDoc extension.

**Idempotent**: setting the same value twice yields the same result.

**Rate limiting**: this route opts into the limiter explicitly (the plugin runs `global: false`) via
`rateLimit: { max, timeWindow }` sourced from `app.config.project.mainFile.rateLimitMax` /
`rateLimitWindow` — environment-bound options in `apps/api/src/config/schema.ts`
(`ASCIIDOCOLLAB_PROJECT_MAIN_FILE_RATE_LIMIT_MAX` / `_WINDOW`), never hardcoded. Over-limit ⇒ `429`
`RATE_LIMITED` through the existing error handler. (security_constitution "API & Integration Security";
FR-073 / SC-025.)

## Read path

`mainFileNodeId` is returned wherever the project is fetched (existing project GET). The editor reads it to seed the include-graph; no separate endpoint.

## Consistency across move/rename/delete (FR-070)

`mainFileNodeId` references a **node id**, so it survives move/rename with no rewrite. The file-tree use cases enforce the remaining cases:
- **Delete main file** → FK `onDelete: SetNull` clears the configuration.
- **Rename main file to a non-AsciiDoc type** → `RenameFileUseCase` clears `mainFileNodeId` and returns a **typed `mainFileCleared: boolean`** field on its result DTO (defined in `packages/shared`, not an ad-hoc signal) so the client informs the user.
- The main file MUST NOT be looked up by path anywhere (path-based lookup would break on move/rename).
This contract has no extra endpoint — it is invariant maintenance inside `MoveFileUseCase`/`RenameFileUseCase`, covered by their domain tests (move keeps the id; rename-to-non-adoc and delete clear it) and the US12 e2e spec.

## File-content read (reused, not new)

The client symbol index fetches file contents through the **existing** project file-content read path already used to open a file in the editor — **no new endpoint** (U2 decision). The tree walk fetches each reachable file via that path, cached by the index and invalidated on SSE; the open file's content comes from the live editor buffer. No write semantics.

## Tests (TDD)

- Domain: `SetProjectMainFileUseCase` with in-memory project + project-member + file-tree fakes — **permission-denied (non-editor)**, set, clear, not-found, wrong-project, non-adoc (red→green); assert the authorization-denial audit entry is recorded.
- API: route tests for 200/400/403/404/401 (mirroring source layout `apps/api/tests/routes/...`); the 403 case asserts the route surfaces the use case's `PermissionDeniedError` rather than performing its own check.
- E2E: configure main file from the UI; verify cross-file resolution activates (covered by the US8 e2e spec).
