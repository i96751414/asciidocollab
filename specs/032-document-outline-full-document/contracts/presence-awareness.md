# Contract: Presence Awareness (project presence room)

**Feature**: 032 | Wire shape on the existing project presence room (`presenceRoomName(projectId)`), Yjs awareness.

---

## Published local state — `PresenceState` (extended)

```text
PresenceState {
  user?: AwarenessUser            // existing — { userId, name, color, colorLight, avatarUrl? }
  openFileNodeId?: string | null  // existing
  cursorLine?: number | null      // NEW — 1-based line of the heading the local cursor is under
}
```

**Producer rules** (`use-project-presence.ts`, local client)
- Publish `cursorLine` via `awareness.setLocalStateField('cursorLine', line)` when the local user's current section changes (derived from the open editor's cursor via existing `currentHeadingIndex`), **debounced** (~150–300 ms) to avoid awareness spam.
- `null` when no heading precedes the cursor or no file is open.
- On unmount/disconnect, existing `setLocalState(null)` clears everything (liveness, FR-023) — unchanged.

**Consumer rules** (aggregation)
- Extend `collectByFile` to also surface each remote peer's `cursorLine` alongside `openFileNodeId`.
- Continue to: exclude the local client, dedup per `userId` across tabs (existing).
- Treat `cursorLine` as **untrusted**: clamp/validate downstream in `mapOutlinePresence` (do not trust the peer's number).

**Backward compatibility**
- `cursorLine` is optional; peers on an older client simply omit it → they contribute **file-level** presence only (no section marker). No crash, no schema break.

---

## Reused presence rendering — no contract change

- `ParticipantPresence` (`use-collab-presence.ts`) — unchanged.
- `OpenByOthersMarker` (`components/file-tree/open-by-others-marker.tsx`) — receives `readonly ParticipantPresence[]`; reused as-is to render avatar cluster, `+N` overflow, and hover/focus names on an outline entry (FR-021).
- `ParticipantAvatar` — unchanged (token-driven; light/dark correct).

---

## Acceptance hooks (map to spec)

| Rule | Spec |
|------|------|
| Section-level marker on the peer's current heading | FR-019, US5-1 |
| Hover shows name/avatar + overflow | FR-021, US5-2 |
| Marker moves on cursor move, clears on leave/disconnect ≤ few s | FR-023, US5-3/4, SC-011 |
| Both scopes show presence | FR-022, US5-5 |
| Others only (self via current-section) | FR-020, US5-6 |
| Clamp/skip out-of-range cursorLine | FR-024, Principle IX |
