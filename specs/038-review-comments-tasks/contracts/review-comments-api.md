# Contract: Review Comments & Tasks REST API

All routes are under an authenticated project scope. **AuthZ** is enforced in the use case (RBAC) and re-checked at the route via the existing project-membership guard; every query is tenant-filtered by `projectId`. Bodies validated by Fastify JSON schema at the boundary (Constitution IX). Errors are typed and non-leaky: `400` validation, `403` forbidden (audited), `404` not found, `409` conflict, `429` rate-limited.

**Rate-limit decisions (Security Constitution — must be recorded):**
- **Limited** (abuse-prone / amplifying writes): `POST` create, `POST` reply, `POST` react, `DELETE` single, and especially `POST .../bulk-delete/*`. Limits are `rateLimitMax` + `rateLimitWindow` config/env-driven (no hardcoded literals); each returns `429` when exceeded.
- **Skip with recorded reason** (cheap authenticated reads): the `GET` list/thread routes — read-only, tenant-scoped, low amplification. Reason recorded here and in the route contract.

Base: `/api/projects/:projectId`

| Method & Path | Purpose | Role | Rate-limited |
|---|---|---|---|
| `GET /documents/:documentId/review-items?includeResolved=` | List a document's items (threads + anchors + reaction summaries) | viewer+ | No (read; reason: cheap tenant-scoped read) |
| `GET /review-items?assigneeId=&status=&documentId=` | Project-wide task/comment list (panel filters) | viewer+ | No (read) |
| `POST /documents/:documentId/review-items` | Create a root comment/task (kind, body, anchor) | editor | Yes |
| `POST /review-items/:id/replies` | Reply in a thread | editor | Yes |
| `PATCH /review-items/:id` | Edit body / convert kind / set status / assign / due date / reopen | editor | Yes |
| `POST /review-items/:id/resolve` | Resolve (stamps resolvedAt/By) | editor | Yes |
| `POST /review-items/:id/reactions` | Toggle an emoji reaction | editor | Yes |
| `POST /review-items/:id/reanchor` | Manual reattach of a SECTION/DETACHED item | editor | Yes |
| `DELETE /review-items/:id` | Permanent delete (root ⇒ thread) | editor | Yes |
| `POST /documents/:documentId/review-items/bulk-delete` | Delete all items for a document (confirm) | editor | Yes |
| `POST /review-items/bulk-delete` | Delete all items across the project (confirm) | **owner** | Yes |

## Representative schemas

**Create (POST …/review-items)** — request:
```json
{
  "kind": "comment",
  "body": "Can we cut this to one sentence? 🙂",
  "anchor": {
    "relPos": "<base64 encoded Y.RelativePosition pair>",
    "quote": { "prefix": "…before ", "exact": "the overview paragraph", "suffix": " …after" },
    "lineHint": 42,
    "sectionId": "getting-started/overview"
  }
}
```
Validation: `kind ∈ {comment,task}`; `body` non-empty, ≤ `REVIEW_BODY_MAX_LEN` (= 4000, the shared named constant), sanitized on render; `anchor.quote.exact` required; `relPos` base64 ≤ bound; `sectionId` optional string. `403` if caller is not editor/owner.

**React (POST …/reactions)** — request `{ "emoji": "👍" }`; `emoji` MUST pass the unicode-emoji allowlist validator; toggles the caller's reaction; returns the updated `ReactionSummaryDTO[]`.

**Bulk-delete** — request `{ "confirm": true, "expectedCount": 37 }`; `confirm` required true; `expectedCount` optional optimistic check (returns `409` if the live count differs, to guard against surprise wipes). Response `{ "deleted": 37 }`. Project-wide route returns `403` for non-owners (audited).

**List item (response element)** = `ReviewItemDTO` (see data-model.md), with `author: null` rendered as "Deleted user" by the client, `assignee: null` as unassigned, and `anchor.state` driving located/section/detached presentation.

## Real-time
On any successful mutation the server emits a document-scoped `review-items-changed` event (payload includes `documentId`) onto the existing **per-project event bus** (`apps/api/src/plugins/file-tree-event-bus.ts`), delivered over the existing **project SSE stream** (`apps/api/src/routes/projects/events.ts`) that already carries `content-changed` / `main-file-changed` (research D2/D4). This is **not** a new Yjs type and **not** a new transport. Open clients refetch the affected document's items and re-resolve anchors against the live `Y.Text`. Target visibility < 2 s (SC-001).
