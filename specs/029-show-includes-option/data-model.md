# Phase 1 Data Model: Optional Display of Included AsciiDoc Files

This feature adds a single **client-only, browser-local** preference and introduces no new persisted entities and **no server-side schema change**. The AsciiDoc include graph itself is transient (assembled per render) and is not modeled as persistent data.

## Client-only preference: `showIncludedFiles`

Stored in browser localStorage as part of the web editor-preferences object (key `asciidocollab:editor-preferences`), in the **client-only** group alongside `leftPanelTab`. Never sent to or read from the account/server.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| **showIncludedFiles** | **Boolean** | **false** | When true, the previewed file's includes inline their bodies; when false (default), bodies are suppressed (placeholder shown) while attribute loading is preserved. |

**Validation / resolution rules**:
- Absent or malformed in localStorage ⇒ resolves to **false** (FR-002), via the web `DEFAULT_PREFS` and `loadFromStorage` fallback.
- Added to `CLIENT_ONLY_KEYS` so it is stripped from the account PUT payload and its local value is preserved in the server GET fetch-merge (never overwritten).

**Lifecycle / state transitions**: none beyond write-on-toggle to localStorage. No server persistence, no migration.

**Ownership & immutability** (Constitution VII): inherently per-user/per-browser; never stored on a project/document; changing it MUST NOT mutate document source or affect another user's render (FR-013).

**Out of scope**: cross-device / cross-browser synchronization (FR-009 revised); the `EditorPreferences` server entity/table is **unchanged**.

## Transient model: assembled-source attribute fidelity

Not persisted, but the invariant the assembler must uphold (drives tests):

- The set of **document attributes in effect at any line of visible content** MUST be identical whether `showIncludedFiles` is true or false (SC-002, SC-006). This includes: plain `{name}` values (FR-004), `leveloffset`, caption/label/numbering family, `sectnums`/`sectnumlevels`, `idprefix`/`idseparator`, `xrefstyle` (FR-004a), resolved across the full transitive include graph subject to conditional gating (FR-004b).
- The only intended difference between the two modes is the **rendered body** of included files (present vs. replaced by a placeholder) and image/anchor content that originates inside included files.
