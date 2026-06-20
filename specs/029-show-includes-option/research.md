# Phase 0 Research: Optional Display of Included AsciiDoc Files

All Technical Context items were resolvable from the existing codebase (features 022, 027, 028); no external/unknown technologies. The decisions below resolve the design choices the implementation depends on.

## R1 — Where the option takes effect: assemble EVERY previewed file, rooted at the open file (FR-014)

**Decision**: The option governs `assembleIncludes()` in `apps/web/src/workers/assemble-includes.ts`, and the worker invokes the assembler for **every** previewed AsciiDoc file whose snapshot is available — **rooted at the OPEN file** — not only when the open file is the configured main file. The current `previewMainPath`-gated "assemble only when open == main" condition is generalized so the assembly root is always the open file's path.

**Rationale**: The spec (FR-014, SC-007) requires the option, placeholders, and attribute loading to apply to any previewed file with includes. Today, only the main file's preview inlines includes; a non-main file's own includes are not expanded at all. Rooting the assembler at the open file makes the behavior uniform: a file with no includes assembles to itself (line-for-line identical → exact scroll-sync preserved), and a file with includes gets the option applied.

**Coexistence with feature-027 inherited scope** (no longer mutually exclusive): two concerns now both apply per render and are independent:
1. **Assembly of the open file's OWN include tree** (this feature) — `assembleIncludes(openFilePath, readFile, { showIncludes, seedAttributes })`.
2. **Inherited cross-document attribute scope** (feature 027) — when the open file is a non-root child of the configured main file, `seedAttributesFromScope(rootFileId=mainFile, openFileId, files)` still seeds the attributes the open file *inherits from its ancestors*. These seeds feed both Asciidoctor (as soft-defaults) and the assembler seed.
   - The worker's previous "at most one include-tree walk" optimization is relaxed: it may now perform the assembler walk (always, when files are present) plus the scope walk (only when open is a non-root child). Both are bounded by the same sandbox/cycle/depth/fan-out guards; acceptable cost, and only the scope walk is conditional.

**Consequence — scroll-sync** (Constitution VIII): assembling a file that HAS includes makes preview scroll-sync to lines after the first include approximate (the assembled document's line numbers diverge), exactly the tradeoff the main-file preview already accepts. A previewed file with NO includes assembles to itself, so its scroll-sync stays exact. This widens an existing, documented tradeoff to all include-bearing files; it does not regress include-free files. Covered by a scroll-sync no-regression test on an include-free document.

**Alternatives considered**:
- *Keep assembly main-file-only (original R1)* — rejected: violates FR-014/SC-007.
- *Post-process rendered HTML to strip include output* — rejected: includes inline into one assembled document with no reliable per-include HTML boundary; suppression must happen at assembly time.

## R2 — Hide mode: suppress body, keep attributes, emit placeholder

**Decision**: Add a `showIncludes?: boolean` option to `assembleIncludes` (default `true` = current behavior; the UI passes `false`). Internally thread an `emit` flag through the recursive `expand()`:
- **`emit === true`** (a visible/rendered file's own lines): unchanged behavior, EXCEPT that an active `include::` directive, when `showIncludes === false`, is replaced by **(a)** a placeholder passthrough block and **(b)** the child expanded with `emit === false` (attribute-only), wrapped in the existing absolute `:leveloffset:` set/restore entries.
- **`emit === false`** (inside a hidden subtree): keep ALL existing bookkeeping (`applyLineAttributes`, `applyLevelOffsetEntry`, conditional `ConditionalRegionStack`, include gating, fan-out/cycle/depth guards), but **emit only attribute-affecting lines** to the output — attribute set/unset entries (`:name: value`, `:name!:`, prefix/suffix unset, wrapped-value continuations) and `:leveloffset:` entries — and recurse into still-active nested includes with `emit === false` (no nested placeholder). All renderable lines (prose, blocks, images, headings, block macros) are dropped.

**Rationale**: Asciidoctor resolves `{name}`/captions/numbering/leveloffset from the **assembled source text**, not from the assembler's internal map. So the document-setting attribute entries from hidden includes MUST still be emitted, in document order, for FR-004/FR-004a/FR-004b and SC-006 to hold. Reusing the assembler's existing per-line attribute/offset/conditional machinery (already the feature-027 authority) keeps hide-mode resolution byte-identical to show-mode resolution — that is the cleanest way to guarantee SC-002/SC-006 ("identical whether enabled or disabled").

**Inline `{set:name:value}` inside suppressed prose**: A `{set:}` carried on a dropped content line would otherwise lose its effect on later visible content. Decision: in `emit === false` mode, when a dropped line changes the attribute map via an inline set, emit a **synthetic** `:name: <resolved-value>` entry so the effect survives. (Named `:name:` entries are emitted verbatim; this covers only the inline-set-on-prose case.) This preserves FR-040-style semantics from feature 027 without forking the attribute model.

**Alternatives considered**:
- *Seed accumulated attributes into Asciidoctor via the `attributes` API instead of emitting lines* — rejected: API attributes are document-global, breaking document-order scoping (an attribute defined in a late include would wrongly be in scope at the top).
- *Hide-mode emits NOTHING from the child* — rejected: breaks variable loading (the whole point of the spec).

## R3 — The placeholder: HTML passthrough, sanitizer-safe, clickable

**Decision**: The assembler emits the placeholder as an Asciidoctor **passthrough block** producing a single element:

```html
<div class="adoc-include-placeholder" data-include-target="<ESCAPED-PATH>" role="button" tabindex="0">included: <ESCAPED-PATH></div>
```

- `<ESCAPED-PATH>` is the **sandbox-resolved** project-relative target (or the raw target when unresolvable), HTML-escaped (`& < > " '`).
- Passthrough content is emitted with the AsciiDoc passthrough block (`++++`), which is permitted under Asciidoctor `safe` mode (only `secure` restricts file/include macros; passthrough is unaffected). **Verification task**: confirm rendering in a real browser preview (Opal cannot run under ts-jest — see project memory `stem_preview_and_jest_opal`), in addition to the worker/unit assertion that the assembled source contains the passthrough.
- The element survives the existing `DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })` call unchanged: DOMPurify keeps `<div>`, `class`, `data-*` (default `ALLOW_DATA_ATTR` true), `role`, and `tabindex`. **No sanitizer config change** (Constitution VIII).

**Click/keyboard**: `asciidoc-preview.tsx` attaches a single delegated listener on the output container for `click` and `keydown` (Enter/Space); when the target is (or is within) `.adoc-include-placeholder[data-include-target]`, it reads the path and calls `onOpenInclude(path)` → wired in the layout to the existing `handleNavigateToFile(path)` (project-relative path → file-tree node → `selectFile`). Unresolvable target → element still renders; navigation no-ops (FR-003b).

**Rationale**: Reuses the one existing sanitizer and the existing path-based navigation; adds no new security surface beyond the already-sandboxed target. Delegation (one listener) is robust against innerHTML re-application and matches the existing `data-source-line` query approach.

**Alternatives considered**:
- *Inject placeholder during the worker's HTML post-processing pass* — rejected: harder to position at the exact include location; the assembler already knows the location and target.
- *React-rendered overlay instead of in-HTML element* — rejected: the preview body is `dangerouslySetInnerHTML`; an in-flow element keeps layout/scroll-sync correct and styling scoped.

## R4 — Preference storage: client-only, browser-local (no server)

**Decision**: Store `showIncludedFiles` (default `false`) as a **client-only** preference in `apps/web/src/hooks/use-editor-preferences.ts`, mirroring `leftPanelTab` exactly:
- Add to the `EditorPrefs` shape, `DEFAULT_PREFS` (`false`), `loadFromStorage`, and a `setShowIncludedFiles` setter that writes localStorage.
- Add the key to `CLIENT_ONLY_KEYS` so `schedulePut` strips it from the account PUT payload, and keep its local value in the GET fetch-merge (never overwritten by the server).
- **No** DB column/migration, DTO, domain entity/use-case, infrastructure repo, or API route change.

**Rationale**: FR-009 (revised) requires only browser-local persistence; cross-device sync is explicitly out of scope. The `leftPanelTab` client-only pattern already exists for precisely this case (Constitution IV reuse), keeps the preference per-user/per-browser (Constitution VII), and avoids any server surface. Because the value is stripped from the PUT payload, there is no `additionalProperties:false` 400 risk and no API schema change is needed.

**Alternatives considered**:
- *Server-synced vertical slice (DB + domain + repo + API), mirroring `previewStyle`* — rejected per the user's decision that the preference is browser-local only; it would add a DB migration and a multi-layer slice for no required benefit.

## R5 — Toggle control placement: preview header only

**Decision**: New `show-includes-control.tsx` (a small toggle/segmented control following `preview-style-control.tsx` conventions: tokens, `aria-pressed`, `data-testid`), rendered in the preview header in `asciidoc-preview.tsx`. Not added to the settings page (FR-007).

**Rationale**: Clarification answered "preview header only." Reuses the established compact header-control pattern and design tokens (Constitution V).

## R6 — Live re-render on toggle

**Decision**: `showIncludes` is read at render time in `use-asciidoc-preview.ts` and added to the `RenderRequest`; the hook re-schedules a render when the value changes (extend the existing toggle effect that already re-renders on `mainPath`/`rootFileId`). No manual reload (FR-008/SC-003).

**Rationale**: Mirrors the existing live re-render on preview-affecting input changes; stays within the existing debounce.

## R8 — Content currency: read the most current copy of every file (FR-015)

**Decision**: Reuse the existing content-sourcing chain; make the freshness guarantee explicit and ensure the assembly root uses the live open-file buffer.
- The host already supplies the assembler's `files` snapshot via `useProjectSymbolIndex.getFiles()`, which: (a) overlays the **open file's live editor buffer** (`liveContent`), and (b) for every other reachable file returns content fetched through `getDocumentContent(projectId, fileId)` — an API endpoint that returns the **live Hocuspocus/Yjs text when that file has an active collaboration session**, and the latest saved file-store version otherwise (`apps/api/.../file-content.ts`, `get-file-node-content.ts`). So "most current, may be from Hocuspocus" is already the behavior for all reachable files.
- **Root freshness**: in the worker, the `readFile` callback passed to `assembleIncludes` MUST return the live open-file `content` (already posted separately in the `RenderRequest`) for the open file's path, overlaying the `files` map — so the assembly root reflects the latest keystroke even if the symbol-index overlay is mid-debounce. (`files[path] ?? null` becomes "open path → `content`, else `files[path] ?? null`".)
- No new bulk endpoint is introduced; the symbol index already fetches reachable files (with caching + live overlay) and refreshes on edits, main-file change, and file-tree SSE events.

**Rationale**: FR-015 is satisfied by existing plumbing; the only gap is guaranteeing the root uses the immediate live buffer rather than a possibly-debounced indexed copy. Keeping the live-read responsibility in the API endpoint (session-aware) avoids duplicating collaboration logic in the client (Constitution IV reuse).

**Consequence**: Freshness of NON-open included files is bounded by the symbol index's fetch/refresh cadence and the API's session-aware read — a file with an active session reads live; a file without one reads its last saved version (documented edge case). This is consistent with how the existing cross-document attribute resolution already sources content.

**Alternatives considered**:
- *Add a bulk "current content for all files" endpoint / direct client→Hocuspocus reads* — rejected for this feature: not required to meet FR-015, adds collaboration surface to the client, and duplicates the session-aware read already centralized in the API. Can be a future optimization if staleness of unopened, session-less files proves material.

## R7 — Images and non-included content (FR-011, edge case)

**Decision**: No special handling. Images (`image::`/inline `image:`) live in the rendered (non-included) content and are emitted by the `emit === true` path unchanged; images inside a hidden include are simply part of the dropped body. Confirmed by Option A in clarification.

**Rationale**: The option only suppresses included bodies; everything else flows through untouched, satisfying FR-011 with zero added logic.
