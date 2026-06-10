# Feature Specification: Audit Log Coverage Review

**Feature Branch**: `025-audit-log-coverage`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "review that there sufficient audit logs being captured in the database (e.g. file deleted/moved/renamed/created/uploaded, project created/archived/deleted, user added, user permissions changed, user password or email changed...)"

## Overview

The system already records audit log entries for a subset of security- and governance-relevant actions (project lifecycle, member management, user administration, email verification, system settings). However, a review of the captured events reveals **gaps** where consequential actions complete without leaving any audit trail, and where existing entries lack the context needed to investigate an incident.

This feature defines the *desired end state*: every consequential action against files, projects, memberships, and accounts produces a trustworthy, queryable audit record so that administrators can answer "who did what, to which resource, and when" for any auditable event.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Complete account & authentication audit trail (Priority: P1)

As an administrator responsible for security, when an account-security event occurs — a sign-in, a sign-out, a failed sign-in attempt, a password change, a password reset, an email-address change, or a new registration — I need an audit record so I can investigate suspicious activity and demonstrate compliance.

**Why this priority**: Account-takeover and credential abuse are the highest-impact security risks, and these events currently leave **no** persisted audit trail. Without them an administrator cannot detect or reconstruct a compromise. This is the most valuable single slice.

**Independent Test**: Perform each account/auth action in a test environment (sign in, fail a sign-in, sign out, change password, reset password, change email, register) and confirm that a corresponding audit record appears in the audit log with the correct actor, action, target, and timestamp — verifiable on its own without any of the other stories.

**Acceptance Scenarios**:

1. **Given** a registered user, **When** they successfully sign in, **Then** an audit record is captured identifying the user, the action "signed in", and the time.
2. **Given** a sign-in attempt with invalid credentials, **When** it is rejected, **Then** the failed attempt is captured as security telemetry (see FR-025–FR-030) — attributable to the attempted identity, identical in shape whether or not that account exists, and without storing the submitted password.
3. **Given** a signed-in user, **When** they change their password, **Then** an audit record is captured for the password change without storing either the old or new password.
4. **Given** a user who initiates and completes a password reset, **When** the reset succeeds, **Then** an audit record is captured for the password reset.
5. **Given** a user who changes and confirms a new email address, **When** the change is confirmed, **Then** an audit record is captured noting the change, including the prior and new addresses for traceability.
6. **Given** a new visitor, **When** they complete registration, **Then** an audit record is captured for the account creation.

---

### User Story 2 - Complete file & folder lifecycle audit trail (Priority: P2)

As an administrator or project owner, when content is added, removed, or reorganized in a project, I need every file and folder lifecycle action captured so I can determine who created, uploaded, renamed, moved, or deleted a given item.

**Why this priority**: File deletion and rename are already audited, but creation, upload, and move are not — so the trail has holes precisely where data-loss or unexpected-reorganization disputes arise. High value, but secondary to account-security events.

**Independent Test**: In a test project, create a file and a folder, upload an asset, rename an item, move an item to a different folder, and delete an item; confirm an audit record exists for each action identifying actor, project, target item, and (for moves/renames) the before/after location or name.

**Acceptance Scenarios**:

1. **Given** a project member with edit rights, **When** they create a new file or folder, **Then** an audit record is captured identifying the actor, the project, and the created item.
2. **Given** a project member, **When** they upload an asset/file, **Then** an audit record is captured identifying the actor, the project, and the uploaded item.
3. **Given** an existing file or folder, **When** it is moved to a different location, **Then** an audit record is captured including the source and destination locations.
4. **Given** an existing file or folder, **When** it is renamed, **Then** the audit record includes the previous and new names.
5. **Given** an existing file or folder, **When** it is deleted, **Then** an audit record is captured identifying the actor, the project, and the deleted item.

---

### User Story 3 - Sufficient context on every audit record (Priority: P3)

As an administrator investigating an incident, when I open an audit record for a change action, I need enough context — what specifically changed (before/after values) and where the request originated — to act on it without consulting other systems.

**Why this priority**: Existing change records (e.g. project updated, member role changed) confirm *that* something changed but not *what* changed, which limits their investigative value. Important for forensic quality, but the events themselves already exist, so this enriches rather than fills a hole.

**Independent Test**: Change a member's role and update a project's details, then inspect the resulting audit records and confirm they include the previous and new values and the origin of the request (e.g. source network address), without needing any other data source.

**Acceptance Scenarios**:

1. **Given** a member-role change, **When** the audit record is created, **Then** it includes the previous role and the new role.
2. **Given** a project-details update, **When** the audit record is created, **Then** it identifies which fields changed and their previous and new values.
3. **Given** any auditable action initiated via an authenticated request, **When** the audit record is created, **Then** it captures the origin of the request (source network address and client identifier) where available.
4. **Given** a permission/role change on a project membership, **When** the audit record is created, **Then** it is attributable to the actor who made the change and the subject whose access changed.

---

### Edge Cases

- **Actor cannot be determined**: For a failed sign-in or a password reset requested by an unauthenticated visitor, the record MUST still be captured, identifying the attempted account (by the submitted identifier) where the acting user is unknown.
- **Audit write fails while the action succeeds**: The system MUST NOT silently lose audit records. If an audit record cannot be written, the failure MUST be surfaced/observable (e.g. via operational logging) rather than dropped without trace. The desired behaviour when the action has already taken effect (proceed vs. fail the action) is recorded under Assumptions.
- **High-volume or automated events**: A distributed brute-force or credential-stuffing attack can generate failed sign-ins far faster than per-account/per-origin rate limits bound in aggregate. The system MUST keep these attempts reconstructable (see FR-025–FR-030) without the recording write becoming an attacker-driven amplification point against the database or an unbounded, ever-growing table.
- **Bulk operations**: When a single user action affects many items (e.g. deleting a folder containing many files, or removing a user who owns multiple projects), the audit trail MUST make the scope of the action determinable.
- **Subject deleted after the fact**: If the actor or target referenced by an audit record is later removed, the historical audit record MUST remain readable and MUST NOT be destroyed by the removal.
- **Sensitive values**: Audit records MUST NOT store secrets (passwords, reset tokens, raw credentials) even when auditing actions that involve them.

## Requirements *(mandatory)*

### Functional Requirements

#### Coverage — actions that MUST produce an audit record

- **FR-001**: The system MUST capture an audit record for each successful user sign-in.
- **FR-002**: The system MUST capture failed sign-in attempts as security telemetry, subject to the volume, retention, and safety constraints in *Failed-authentication handling* below (FR-025–FR-030), rather than as one unbounded governance record per attempt.
- **FR-003**: The system MUST capture an audit record for each user sign-out.
- **FR-004**: The system MUST capture an audit record for each successful new-account registration.
- **FR-005**: The system MUST capture an audit record for each password change.
- **FR-006**: The system MUST capture an audit record for each completed password reset.
- **FR-007**: The system MUST capture an audit record for each confirmed email-address change, including the previous and new addresses.
- **FR-008**: The system MUST capture an audit record for file creation.
- **FR-009**: The system MUST capture an audit record for file/asset upload.
- **FR-010**: The system MUST capture an audit record for file or folder move, including source and destination locations.
- **FR-011**: The system MUST capture an audit record for file or folder rename, including previous and new names.
- **FR-012**: The system MUST capture an audit record for folder creation.
- **FR-013**: The system MUST continue to capture audit records for the actions already covered today: file deletion; project created/updated/archived/restored/deleted; member invited/removed/role-changed; user invitation sent/accepted, user removed, admin granted/revoked; email verified; and system-setting changes.
- **FR-031**: The system MUST capture an audit record for authorization denials — a permission-denied attempt on a consequential action — identifying the actor, the resource type and id, and the reason. (Delivered across all authorization boundaries within this feature, sequenced incrementally per `architecture-migration-plan.md`.)

#### Failed-authentication handling (security telemetry)

- **FR-025**: Failed sign-in attempts MUST be recorded in a way that bounds storage volume regardless of attack scale — e.g. by coalescing/aggregating repeated failures (such as "N failures for a given account from a given origin within a time window") rather than persisting one unbounded record per attempt.
- **FR-026**: Failed-authentication records MUST be distinguishable from governance audit events (a separate action category) so they can be excluded from the standard governance audit review and stored/retained under their own policy. Genuine credential-stuffing or brute-force patterns MUST remain reconstructable from this data.
- **FR-027**: Recording a failed sign-in MUST NOT become a synchronous amplification point in the authentication path: protective rate limiting MUST be able to reject abusive attempts without the failure-recording write being forced first, and the failure-recording write MUST be best-effort and off the response path — it MUST NOT add latency to the login response (so it cannot weaken the constant-time login defence; see FR-033).
- **FR-033**: The audit and failed-sign-in telemetry writes added to the authentication path MUST NOT introduce an account-existence-dependent timing differential, and MUST preserve the existing constant-time login behaviour. Login response time MUST remain independent of whether the attempted account exists and of whether the audit/telemetry write succeeds, fails, or is slow.
- **FR-028**: Failed-authentication records MUST have the same shape and presence whether or not the attempted account exists, so the audit channel cannot be used to enumerate which accounts exist.
- **FR-029**: Failed-authentication records MUST NOT store the raw submitted secret in any field; the attempted identifier MUST be handled so that a credential mistakenly entered in the identifier field is not retained verbatim.
- **FR-030**: Failed-authentication records MUST be automatically purged after a bounded retention window (default 90 days), independent of the indefinite retention applied to governance audit events. The purge MUST be an actual scheduled deletion and MUST be reported/observable (what was purged and when) rather than silently removing records.

#### Record content & quality

- **FR-014**: Every audit record MUST identify the action performed, the type and identity of the resource acted upon, and the time it occurred.
- **FR-015**: Every audit record MUST identify the acting user where known; where the actor is unauthenticated or unknown, the record MUST capture the best available identifier of the attempted subject.
- **FR-016**: Audit records for change actions (role change, project update, email change, rename, move) MUST capture the relevant before and after values.
- **FR-017**: Audit records MUST capture the origin of the request (source network address and client identifier) where that information is available.
- **FR-018**: Audit records MUST NOT contain secrets or sensitive credentials (passwords, reset/verification tokens, raw email-change tokens).
- **FR-019**: Governance audit records MUST be immutable once written — the system MUST NOT update or alter an existing governance audit record. (Failed-authentication telemetry is the deliberate exception: its coalesced counters are updated within the active window per FR-025; once a window closes its bucket is no longer altered.)
- **FR-020**: Governance audit records (every auditable action other than failed-authentication telemetry) MUST be retained even after the referenced actor, project, or resource is deleted.

#### Integrity & access

- **FR-021**: The system MUST NOT silently discard an audit record; a failure to persist an audit record MUST be observable to operators.
- **FR-022**: Audit records MUST be queryable by administrators, filterable by time range, actor, and action type, consistent with the existing audit-log review capability.
- **FR-023**: The set of auditable action types MUST be discoverable so that administrators can see which categories of events are captured.
- **FR-032**: Administrators MUST be able to review failed-authentication telemetry — filterable by attempted identifier, origin, and time — so credential-stuffing and brute-force patterns are reconstructable (FR-026), not merely captured.

#### Review deliverable

- **FR-024**: This feature MUST produce a documented inventory of consequential actions in the system, each marked as "audited today", "gap — to be added", or "intentionally not audited (with rationale)", so coverage decisions are explicit and reviewable.

### Key Entities *(include if feature involves data)*

- **Audit Record**: An immutable entry describing a single consequential action. Attributes: acting user (nullable when unknown), associated project scope (nullable for global actions), action identifier, resource type, resource identity, timestamp, and structured contextual detail (before/after values, request origin, scope of bulk operations, attempted-subject identifier). Never contains secrets.
- **Auditable Action**: A catalogued category of consequential operation (e.g. "file uploaded", "password changed", "member role changed") with a stable identifier and a defined coverage status.
- **Failed-authentication telemetry**: A volume-bounded, separately-retained record (or aggregate) of failed sign-in attempts, kept distinct from governance audit records. It is account-existence neutral, never contains the submitted secret, and is purged after a bounded window.
- **Actor**: The user who initiated the action; may be unknown for failed or unauthenticated attempts.
- **Target Resource**: The file, folder, project, membership, account, or system setting the action affected.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the actions enumerated in the auditable-action inventory that are marked "should be audited" produce an audit record when performed.
- **SC-002**: For any audited action performed in the last reporting period, an administrator can locate the corresponding record and identify actor, action, target, and time in under 1 minute using existing review tools.
- **SC-003**: Zero audit records contain secrets or raw credentials, verified by review of every audited action that handles sensitive input.
- **SC-004**: Every change-type audit record (rename, move, role change, project update, email change) contains both before and after values for the changed attribute(s).
- **SC-005**: 100% of newly covered authentication and account-security events (sign-in success/failure, sign-out, password change, password reset, email change, registration) are captured, where before this feature 0% were.
- **SC-006**: The coverage review inventory accounts for every consequential action surface in the application, with no action left uncategorised.
- **SC-007**: Governance audit records survive deletion of their referenced actor or target — a record created before a user/project deletion remains retrievable afterward.
- **SC-008**: Under a simulated distributed failed-login burst, stored failed-authentication records grow sub-linearly with attempt count (bounded by coalescing), the authentication path stays within its normal latency and rate-limit behaviour, and records older than the retention window are absent after the next purge cycle.

## Assumptions

- **Scope — structural & security events, not content keystrokes**: "Audit logs" covers structural and security-relevant actions (lifecycle, membership, account, settings, file/folder operations). Continuous document-content editing and real-time collaboration session join/leave events are considered out of scope, as content history is handled by the collaborative-editing/versioning mechanism rather than the audit log.
- **Failed-action auditing**: The system audits successful consequential actions, failed *authentication* attempts (security telemetry), and *authorization denials* (FR-031). Authorization-denial logging is delivered for all boundaries within this feature, sequenced incrementally (file-tree first, then project/membership/admin) per `architecture-migration-plan.md`, reusing the governance audit store — fully closing the Security Constitution MUST, not deferring it.
- **Behaviour when audit write fails after the action succeeded**: The action is allowed to stand (not rolled back), but the audit-write failure is surfaced through operational logging so it can be detected and remediated. This preserves current behaviour (audit writes are not transactional with the action) while closing the "silent loss" gap.
- **Request origin best-effort**: Source network address and client identifier are captured when the action originates from an authenticated request; actions originating from background/system contexts may legitimately lack this and that is acceptable.
- **Retention**: Governance audit events continue to be kept indefinitely with no automated purge. Failed-authentication telemetry is the deliberate exception: it is kept only for a bounded window (default 90 days) and then automatically purged (FR-030). Defining a formal retention/archival policy for governance events beyond "indefinite" remains out of scope.
- **Reuse of existing infrastructure**: The existing audit-log storage, admin review screen, and filtering capability are assumed to be the foundation; this feature extends coverage and record content rather than introducing a separate auditing system.
- **Privacy**: Capturing source network address and client identifier for audit purposes is assumed to be acceptable for the application's administrative/security needs; no additional consent flow is assumed to be required.
