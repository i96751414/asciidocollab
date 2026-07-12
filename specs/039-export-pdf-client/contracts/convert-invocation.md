# Contract: Ruby Convert Invocation

Defines how the worker invokes Asciidoctor-PDF inside the wasm VM after pre-processing. Implemented
in `packages/asciidoc-pdf/src/convert/invoke.ts`, executed against the warm VM. By the time this
runs, `/project` contains only **local AsciiDoc + local assets** (includes expanded, citations/
diagrams/math rewritten to `image::`/inline AsciiDoc).

## Invocation

Conceptually (executed as Ruby in-VM via the `js` bridge):

```ruby
Asciidoctor.convert_file(
  '/project/<rootPath>',
  backend: 'pdf',
  safe: :unsafe,               # sandbox boundary is the WASM VM, NOT Ruby safe mode (Principle X/XIV)
  to_file: '/out/<name>.pdf',
  mkdirs: true,
  attributes: {
    'pdf-theme'    => '<themeName-or-path>',
    'pdf-themesdir'=> '/project/<themesdir>',
    'pdf-fontsdir' => '/project/<fontsdir>:/usr/<baked-fontsdir>',   # custom + baked defaults
    'imagesdir'    => '<imagesdir>',
    'source-highlighter' => 'rouge',
    # + ProjectSnapshot.attributes (intrinsic + project) and stem settings
    'nofooter' => nil,          # only if project reference build sets it; otherwise honor project
  }
)
```

## Rules

1. **Safe mode**: `safe: :unsafe` is used deliberately — the **WASM VM is the security boundary**
   (Principle XIV), not Ruby's `SafeMode`. Local-only inputs are already guaranteed by VFS population
   + sandboxed-path resolution (Principle IX). This MUST be paired with: no sockets in the VM, no
   remote refs in `/project`, and the offline guards (research R9).
2. **Attribute source of truth**: attributes come from `ProjectSnapshot.attributes` (which already
   merges `RENDER_INTRINSIC_ATTRIBUTES` + project attributes), plus the theme/font/imagesdir wiring
   above. The invocation MUST NOT invent styling defaults — parity requires the *project's* theme,
   not a fixed one (spec FR-003, Principle XI).
3. **Highlighting**: `source-highlighter: rouge` (baked gem) for syntax-highlighted code (spec FR-006).
   Rouge is the asciidoctor-pdf default highlighter, matching the reference build.
4. **Optimize**: if `request.optimize`, run `hexapdf` optimize as a post-step; if hexapdf/zlib is
   unavailable in-wasm (research R1), skip optimization with a diagnostic — never fail the export.
5. **Determinism** (R6): set/normalize `SOURCE_DATE_EPOCH` and strip `/CreationDate`,`/ModDate`,`/ID`
   nondeterminism before returning bytes.
6. **Read-back**: read `/out/<name>.pdf` → `Uint8Array` → `Blob('application/pdf')`; clear `/out`.
7. **Failure**: a convert failure surfaces as a structured `RenderError{ phase:'convert' }` (data-
   model.md), while any per-block problem raised during convert is captured as a `RenderDiagnostic`.

## Parity obligation

The attribute map + theme/font wiring here is the primary lever for **element-level parity**
(Principle XI). Every fidelity-critical attribute the reference build relies on (theme, fonts,
imagesdir, highlighter, stem) MUST be reproduced, and covered by the parity harness (Principle XV,
research R5) before the convert path is considered done.
