# Contract: Render Worker & Include Assembler (delta)

## `assembleIncludes` options (apps/web/src/workers/assemble-includes.ts)

```ts
export function assembleIncludes(
  rootPath: string,
  readFile: (path: string) => string | null,
  options?: {
    maxDepth?: number;
    maxExpansions?: number;
    seedAttributes?: ReadonlyMap<string, string>;
    showIncludes?: boolean;   // NEW — default true (current behavior). false ⇒ hide mode.
  },
): AssembleResult;
```

**Behavioral contract**:

| `showIncludes` | Included file body | Attribute entries (`:name:`, `:leveloffset:`, captions, sectnums, …) | Placeholder |
|----------------|--------------------|----------------------------------------------------------------------|-------------|
| `true` (default) | Inlined at include location (unchanged) | Inlined as part of body (unchanged) | none |
| `false` | **Suppressed** | **Emitted in document order**, transitively, subject to conditional gating | One per top-level include location (no nested placeholders) |

**Invariants in hide mode (`showIncludes: false`)**:
1. The accumulated document-attribute state at every line of *surviving* content is identical to show mode (drives SC-002/SC-006).
2. Sandbox/cycle/depth/fan-out guards and `unresolved[]` reporting behave exactly as in show mode (each rejected/cyclic/missing/limited include is still recorded; an unresolvable include still yields a placeholder referencing its raw target).
3. `:leveloffset:` set/restore wrapping around a hidden include is still emitted so later content's heading levels match show mode.
4. A nested include inside a hidden include contributes its attribute entries but produces **no** placeholder of its own.
5. Output contains exactly one placeholder element per include directive that appears in a *rendered* (non-suppressed) file.

**Placeholder emission** (see `include-placeholder-dom.md`): an Asciidoctor passthrough block whose target is sandbox-resolved (or the raw target if unresolvable) and HTML-escaped.

## `RenderRequest` (worker ↔ host)

Add to the interface in BOTH `asciidoc-render.worker.ts` and `use-asciidoc-preview.ts`:

```ts
interface RenderRequest {
  // …existing…
  /** When false (default), the assembler hides included bodies and emits placeholders (FR-002/FR-003). */
  showIncludes?: boolean;
}
```

**Worker behavior** (generalized for FR-014/FR-015):
- Assemble **every** previewed file rooted at the OPEN file whenever `files` is available — not only when open == main:
  ```ts
  const assembleRoot = openFilePath;                  // the open file, always
  const readFile = (p: string) =>
    p === openFilePath ? content : (files[p] ?? null); // root uses live editor buffer (R8/FR-015)
  const source = (files && assembleRoot)
    ? assembleIncludes(assembleRoot, readFile, { showIncludes, seedAttributes: buildAssemblerSeed(attributes) }).content
    : content;
  ```
- Inherited cross-document scope (feature 027) STILL applies independently: when the open file is a non-root child of the configured main file, `seedAttributesFromScope(rootFileId=mainFile, openFileId, files)` seeds inherited attributes (unchanged). Assembly (open-file root) and scope-seeding (main-file root) now COEXIST; they are no longer mutually exclusive.
- The assembler's own option default stays `true` (show) to preserve existing direct-caller/test behavior; the host always sends the resolved preference.

**Host behavior** (`use-asciidoc-preview.ts` + `project-editor-layout.tsx`):
- Pass the OPEN file path as the assembly root and the `files` snapshot whenever available (generalize the current `previewMainPath`-only gate so a non-main file with includes also assembles). Keep passing `rootFileId`(main)/`openFileId` for inherited scope.
- Read the current `showIncludes` at render time (ref), include it in the `RenderRequest`, and re-schedule a render when it changes (extend the existing `[mainPath, rootFileId]` re-render effect to also depend on `showIncludes`).
- Content currency (R8): the open file's content comes from the live editor buffer (`content`); the worker's `readFile` overlays it onto the `files` map for the root path. Other files' currency is whatever `getFiles()` already provides (live Hocuspocus when a session is active, else last saved).

## Test obligations (red-first)

- Assembler unit tests (pure, via `readFile` callback):
  - hide mode suppresses body but a `{name}` defined in the include resolves after it;
  - `:leveloffset:` + `:table-caption:` from a nested include still apply to later content (SC-006);
  - one placeholder per top-level include; none for nested includes;
  - conditional-gated include contributes no attributes in either mode;
  - unresolvable include ⇒ placeholder with raw target + recorded in `unresolved[]`;
  - show mode (`showIncludes: true` / default) is byte-identical to pre-feature output (regression guard).
- Worker request threading test (showIncludes reaches the assembler call).
- Generalized assembly (FR-014): assembling a NON-main file rooted at the open file applies the option to its own includes; an include-free file assembles to itself byte-for-byte (scroll-sync no-regression).
- Content currency (FR-015): the worker's `readFile` returns the live `content` for the open-file path (overlay), not the `files`-map copy; a `files` entry supplied by `getFiles()` is used for non-open files (live-vs-saved currency is the host/API's responsibility and is asserted at that layer, not re-implemented in the worker).
- Coexistence: when both an inherited scope (open is a non-root child) and the open file's own includes exist, attributes from BOTH inherited ancestors and the open file's own includes resolve.
