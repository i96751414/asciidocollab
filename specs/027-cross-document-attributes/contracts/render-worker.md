# Contract: Render Worker & Include Assembler

`apps/web/src/workers/asciidoc-render.worker.ts` and `apps/web/src/workers/assemble-includes.ts`. The DOMPurify sanitization boundary is unchanged and re-applied to all assembled/resolved content (Constitution VIII/IX).

## Render request (extended input)

```ts
interface RenderRequest {
  content: string;            // open file source (existing)
  mainPath?: string;          // existing: assembly entry for include expansion
  files?: Record<string, string>; // existing: in-memory project file map
  imagesDir?: string;         // existing
  // NEW:
  rootFileId?: string | null; // project main file (root); null ⇒ standalone resolution
  openFileId?: string;        // the file being previewed (for inherited-scope lookup)
}
```

## Worker responsibilities

1. **Resolve inherited scope** for `openFileId` via the resolution model (resolution-model.md). When there is no `rootFileId`, render standalone.
2. **Seed Asciidoctor** `attributes` with the resolved inherited scope (non-locked, so in-document defs may still override per AsciiDoc) **plus** the resolved `:leveloffset:` and existing `showtitle`/`imagesdir`. → native correct IDs (`idprefix`/`idseparator`), `xrefstyle`, caption/label/signifier family, `sectnums`/`sectnumlevels`, `toc`/`toclevels` (FR-008..FR-019a, FR-037..FR-039).
3. **Assemble includes** (`assemble-includes.ts`), now:
   - **Attribute-aware**: track attribute state in document order (mirrors resolution model) so include targets and gating decisions see the right values.
   - **Conditional include-gating**: skip/assemble an `include::` wrapped by a conditional per `evaluateConditional` (FR-030). Content-level conditionals are left in the source for Asciidoctor to evaluate.
   - **Partial includes**: apply `tags=`/`lines=` slicing before insertion; apply `leveloffset` to the slice (FR-033..FR-036).
   - **Sandbox**: targets resolved only within the project sandbox via existing `resolveSandboxedPath`; traversal/remote rejected (Constitution IX). Cycle/depth guard retained.
   - **Source-line fidelity**: retained lines keep correct `data-source-line` mapping for scroll-sync (Constitution VIII) — regression-tested.
4. **Sanitize**: assembled, converted HTML passes through the existing DOMPurify call unchanged. Bibliography/index/counter/page-break output (FR-047..FR-050) is native Asciidoctor HTML, sanitized identically.
5. **Emit** STEM in a form the client math renderer consumes (Asciidoctor stem delimiters preserved through sanitize); the worker does **not** render math (client-side per R5).

## Output (unchanged contract)

Sanitized HTML string + source-line metadata for scroll-sync. No new output fields required beyond what already exists, except optionally a flag/marker indicating math is present (perf: lets the component lazy-load MathJax only when needed).

## Guarantees (tested)

- Seeding an inherited `:sectnums:`/`:idprefix:`/`:xrefstyle:`/`:table-caption:` produces the corresponding native output (unit).
- A conditional gating an include includes/excludes the target by attribute state (unit + e2e).
- `tags=`/`lines=` yield only the selected content; offset applied (unit + e2e).
- Missing include / empty tag / invalid range render gracefully; rest of doc intact (unit; SC-008).
- Sanitizer output for assembled content is identical to pre-feature for equivalent input (regression).
- Scroll-sync line mapping unchanged for non-filtered content (regression, Constitution VIII).
