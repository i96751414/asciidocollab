# Feature Specification: Hocuspocus 4 Upgrade

**Feature Branch**: `023-hocuspocus-4-upgrade`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "upgrade to hocuspocus 4, most recent version (and yjs to the most recent and compatible version)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Real-time collaboration keeps working after the upgrade (Priority: P1)

People who edit the same document together must notice no difference after the realtime collaboration stack is upgraded. Two or more users open the same file, type at the same time, and continue to see each other's changes and cursors/presence live, exactly as before. Saving, reconnecting after a network blip, the offline read-only fallback, and the single-editor edit lock all behave identically.

**Why this priority**: Collaboration is the product's core differentiator. An upgrade that silently breaks co-editing, presence, or persistence is worse than not upgrading at all. Behavior parity is the whole point of the change.

**Independent Test**: With the upgraded stack deployed, have two clients open the same document, edit concurrently, and confirm changes/presence sync, content persists, reconnection recovers, and the offline fallback still triggers — without any user-visible change from the prior version.

**Acceptance Scenarios**:

1. **Given** two users have the same document open, **When** one types, **Then** the other sees the change live and both converge to the same content.
2. **Given** a collaborator is connected, **When** another joins or leaves, **Then** presence/awareness updates for everyone as before.
3. **Given** edits are made, **When** the room is closed or the session ends, **Then** the content is written back and reopening the document shows the latest content.
4. **Given** a user temporarily loses connection, **When** connectivity returns, **Then** the session resyncs and the user's role/permissions are re-checked, with no lost edits.
5. **Given** the collaboration backend is unreachable within the timeout, **When** a user opens a document, **Then** it opens read-only with the existing offline notice and no edits are silently lost.

---

### User Story 2 - Run on the current, supported realtime stack (Priority: P2)

The team needs the collaboration server, the editor client, and shared packages to run on the most recent Hocuspocus major release (v4) and the most recent Yjs version compatible with it, so the project stays on maintained, secure, non-deprecated dependencies.

**Why this priority**: The current versions are several majors behind. Staying current reduces security exposure, unblocks future fixes/features, and avoids accumulating a larger, riskier migration later. It delivers value even though it is not directly user-facing.

**Independent Test**: Inspect the resolved dependency tree and confirm the collaboration server and client run on Hocuspocus v4 (latest) and a single, latest-compatible Yjs version across all packages, with the application building and all quality gates passing.

**Acceptance Scenarios**:

1. **Given** the upgrade is complete, **When** dependencies are resolved, **Then** the realtime server/client use Hocuspocus v4 (latest stable) and one consistent latest-compatible Yjs version across all packages.
2. **Given** the upgraded dependencies, **When** the project is built and its quality gates run, **Then** the build and all gates pass.
3. **Given** the upgraded stack, **When** the dependency tree is inspected, **Then** exactly one version of the realtime document library is present (no duplicate instances).

---

### User Story 3 - Existing documents remain usable (Priority: P3)

Documents and collaborative state created before the upgrade must open and edit correctly afterward, with no data loss or corruption.

**Why this priority**: Users have existing project content. The upgrade must preserve it; a migration that loses or corrupts stored collaborative state would be unacceptable.

**Independent Test**: Take documents created on the pre-upgrade version, deploy the upgraded stack, and confirm each opens, displays its prior content, and accepts new edits that persist.

**Acceptance Scenarios**:

1. **Given** a document was created/edited before the upgrade, **When** it is opened after the upgrade, **Then** it shows its previous content intact.
2. **Given** a pre-upgrade document is opened after the upgrade, **When** a user edits and the room closes, **Then** the new edits persist and reopening shows them.

---

### Edge Cases

- **Version skew during rollout**: a client running the old protocol connects to the upgraded server (or vice versa) mid-deploy. Assumed mitigation: coordinated deploy of server and client together (see Assumptions); behavior during transient skew should fail safe (reject/retry), never corrupt content.
- **Stored-state format compatibility**: collaborative state persisted by the old version must be readable by the new version; if any on-disk/stored representation changed, it must be handled without data loss.
- **Duplicate realtime-library instances**: mismatched transitive versions causing two copies of the document library (which breaks document identity) must be eliminated.
- **Module-format / packaging changes** introduced by the newer major(s) must not break the server start, the web build, or test execution.
- **Companion libraries** — the awareness/sync protocol library and the editor binding library — that depend on the document library must stay at compatible versions in lockstep.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The collaboration server MUST run on the most recent stable Hocuspocus v4 release.
- **FR-002**: The collaboration client/provider MUST run on the matching Hocuspocus v4 release and remain protocol-compatible with the server (a client can connect, sync, and edit).
- **FR-003**: The shared realtime document library (Yjs) MUST be at the most recent version compatible with the chosen Hocuspocus v4 release. (If it is already at that version, this is a confirmation, not a version bump.)
- **FR-004**: The realtime document library MUST resolve to a single, consistent version across every package that uses it (server, web client, and any shared/back-end package), with no duplicate instances.
- **FR-005**: The companion libraries that depend on the document library — the awareness/sync protocol library and the editor binding library — MUST be at versions compatible with the document library and Hocuspocus v4. (Presence/awareness ships within the protocol library, not as a separate package.)
- **FR-006**: All existing collaboration behaviors MUST be preserved with parity: concurrent multi-user editing, live presence/awareness, write-back persistence, room open/teardown lifecycle, the single-source edit lock, reconnection with mid-session role re-check, and the offline read-only fallback.
- **FR-007**: Collaborative state persisted by the pre-upgrade version MUST load and remain editable under the upgraded version, with no data loss or corruption.
- **FR-008**: Any API/hook/extension changes required by the new majors MUST be adapted internally without removing or degrading existing collaboration capabilities; user-facing behavior MUST NOT change.
- **FR-009**: The application MUST build successfully and ALL existing automated tests (unit, integration, and collaboration end-to-end) MUST pass after the upgrade.
- **FR-010**: Beyond the build and tests in FR-009, all remaining project quality gates MUST pass after the upgrade: lint, type checks, architecture checks, dependency audit at the project's enforced severity, and coverage thresholds.
- **FR-011**: The upgrade MUST NOT introduce dependency vulnerabilities at or above the project's enforced audit severity.

### Key Entities

- **Collaborative document state**: the shared, mergeable representation of a file's content used for real-time co-editing and persisted between sessions. Its continuity across the upgrade (load + edit + persist) is the data-integrity concern.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of existing collaboration scenarios (concurrent editing, presence, persistence, edit lock, reconnection, offline fallback) pass after the upgrade with no functional regression.
- **SC-002**: Real-time sync parity is preserved — the collaboration end-to-end suite passes with two users seeing each other's changes promptly and no perceived slowdown versus the pre-upgrade version (verified qualitatively via the collaboration e2e + manual smoke; no dedicated latency benchmark).
- **SC-003**: 100% of documents created before the upgrade open, display prior content, and accept persisting edits afterward (zero data loss).
- **SC-004**: The dependency tree resolves exactly one version of the realtime document library across all packages.
- **SC-005**: The realtime server and client run on Hocuspocus v4 (latest stable) and the latest compatible document-library version.
- **SC-006**: The build and 100% of quality gates pass, with no dependency vulnerabilities at or above the enforced severity.

## Assumptions

- "Hocuspocus 4" refers to the latest stable major release of the self-hosted Hocuspocus collaboration server/provider used by this project; the upgrade moves from the current v2 line through the intervening major(s) to v4, absorbing their breaking changes (e.g., packaging/module-format and hook/extension API changes).
- "Most recent and compatible" Yjs means the newest published version that the chosen Hocuspocus v4 release supports; the document library is assumed to remain on its current major line (no major-version data-format break), so persisted state stays compatible.
- The goal is strict behavior parity — no new collaboration features and no changes to user-facing behavior or the collaboration contract consumed by the web client beyond what the new versions strictly require internally.
- Deployment upgrades the collaboration server and the web client together (coordinated release), so prolonged old-client/new-server version skew is not a supported steady state.
- The existing collaboration test coverage (unit, integration, and end-to-end) and quality gates are the acceptance baseline; "no regression" is measured against them.
- The self-hosted collaboration server in this repository is the only collaboration backend; there is no third-party hosted Hocuspocus dependency to coordinate.
