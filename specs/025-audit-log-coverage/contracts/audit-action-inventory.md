# Audit Action Coverage Inventory (FR-024 deliverable)

Status legend: **AUDITED** = already recorded today · **GAP** = added by this feature (all GAP items are now IMPLEMENTED ✓) · **TELEMETRY** = recorded in the separate `FailedSignInAttempt` store · **DEFER** = intentionally not audited now (rationale given).

> **Implementation status (feature complete):** every GAP/TELEMETRY row below is implemented and test-covered — auth events (login/logout/register/password/email), file/folder lifecycle (create/upload/move + rename before-after), authorization denials (`authz.denied`, all boundaries), the coalesced failed-sign-in telemetry with admin review + scheduled purge, and request-origin metadata on all audited records.

This inventory is the source of truth for SC-001 (all "should-audit" actions produce a record) and SC-006 (no action uncategorised).

## Account & Authentication

| Action | action string | Status | Notes |
|--------|--------------|--------|-------|
| Successful sign-in | `auth.signed_in` | GAP | new governance record |
| Failed sign-in | — | TELEMETRY | coalesced `FailedSignInAttempt`; bounded retention |
| Sign-out | `auth.signed_out` | GAP | |
| Registration | `auth.registered` | GAP | actor = new user |
| Password changed | `auth.password_changed` | GAP | no secret stored |
| Password reset completed | `auth.password_reset` | GAP | actor resolved from token |
| Email change confirmed | `auth.email_changed` | GAP | metadata `{ previousEmail, newEmail }` |
| Email verified | `auth.email_verified` (a.k.a. `user.email_verified`) | AUDITED | existing |
| Password reset **requested** | — | DEFER | request-stage event; the *completion* is audited. Low forensic value vs. noise |
| Email change **requested** | — | DEFER | as above; confirmation is audited |
| Resend verification email | — | DEFER | non-state-changing convenience action |

## Files & Folders

| Action | action string | Status | Notes |
|--------|--------------|--------|-------|
| File created | `file.created` | GAP | metadata `{ path }` |
| Folder created | `folder.created` | GAP | metadata `{ path }` |
| File/asset uploaded | `file.uploaded` | GAP | metadata `{ path, sizeBytes }` |
| File/folder moved | `file.moved` | GAP | metadata `{ from, to }` |
| File/folder renamed | `file.renamed` | AUDITED+ | existing; **enriched** with `{ previousName, newName }` |
| File deleted | `file.deleted` | AUDITED | existing |
| Document content edits | — | DEFER | handled by CRDT/version history (spec Assumptions: out of audit scope) |

## Projects

| Action | action string | Status | Notes |
|--------|--------------|--------|-------|
| Project created | `project.created` | AUDITED | existing |
| Project updated | `project.updated` | AUDITED+ | existing; **enriched** with changed-fields before/after |
| Project archived | `project.archived` | AUDITED | existing |
| Project restored | `project.restored` | AUDITED | existing |
| Project deleted | `project.deleted` | AUDITED | existing |

## Membership & User Administration

| Action | action string | Status | Notes |
|--------|--------------|--------|-------|
| Member invited | `member.invited` | AUDITED | existing |
| Member removed | `member.removed` | AUDITED | existing |
| Member role changed | `member.roleChanged` | AUDITED+ | existing; **enriched** with `{ previousRole, newRole }` |
| User invitation sent | `user.invitation_sent` | AUDITED | existing |
| User invitation accepted | `user.invitation_accepted` | AUDITED | existing |
| User removed | `user.removed` | AUDITED | existing |
| Admin granted | `user.admin_granted` | AUDITED | existing |
| Admin revoked | `user.admin_revoked` | AUDITED | existing |
| Display-name / profile update | — | DEFER | self-service cosmetic change; candidate for a later `user.profile_updated` |

## System Settings

| Action | action string | Status | Notes |
|--------|--------------|--------|-------|
| Max upload size changed | `settings.max_upload_size_changed` | AUDITED | existing |
| Open registration toggled | `settings.open_registration_changed` | AUDITED | existing |

## Cross-cutting (not a single action)

| Concern | Status | Notes |
|---------|--------|-------|
| Authorization denials (permission-denied on a consequential action) | GAP | `authz.denied` (FR-031); incremental rollout per `architecture-migration-plan.md`, file-tree boundary first. Best-effort; reuses `AuditLog` |
| Failed-sign-in telemetry review (admin) | GAP | `GET /admin/failed-sign-ins` read surface (FR-032) so attack patterns are reconstructable, separate from `/admin/audit-logs` |
| Request origin (IP / user-agent) on records | GAP | added via `metadata.origin` on all audited use cases |
