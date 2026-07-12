# Contract: VFS Population (ProjectSnapshot → WASI preopens)

Defines how a `ProjectSnapshot` is mapped into the WASI filesystem the Ruby VM sees. Implemented in
`packages/asciidoc-pdf/src/vfs/populate.ts` using `@bjorn3/browser_wasi_shim` preopens.

## Layer layout

| Mount | Writable | Lifetime | Contents |
|-------|----------|----------|----------|
| `/usr` | no | baked into `.wasm` (wasi-vfs) | Ruby stdlib + pinned gems; immutable; cached hard (R2) |
| `/project` | yes (in-mem) | per session; repopulated per render | AsciiDoc files, theme YAML, fonts, images, `.gen/` assets |
| `/out` | yes (in-mem) | per render | the produced `*.pdf` |
| `/tmp` | yes (in-mem) | per render | scratch for gems that need it |

## Population rules

1. **Path fidelity**: each `snapshot.files` / `binaryAssets` key maps to `/project/<sandboxed path>`.
   Every key MUST have already passed `resolveSandboxedPath`; population MUST reject (not silently
   normalize) any residual `..`/absolute/remote path — defense in depth for Principle IX.
2. **Root**: `snapshot.rootPath` → the file passed to `convert_file`; MUST exist under `/project`.
3. **Warm re-render**: on a warm VM, only `request.changedPaths` are rewritten under `/project`
   (plus any invalidated `.gen/` assets); unchanged files and cached assets stay in place (Principle
   XII/XIII).
4. **Generated assets**: pre-processing writes diagrams/math/formatted-bib to `/project/.gen/
   <sourceHash>.<ext>` and rewrites source refs to those paths (content-addressed, R6).
5. **Fonts/theme**: custom fonts → `/project/<fontsdir>`; theme YAML → its declared path; convert
   invocation points `pdf-fontsdir`/`pdf-themesdir` at these (see convert-invocation.md). Default
   theme fonts are already baked in `/usr` and need no mount (R8).
6. **Read-back**: after convert, read `/out/<name>.pdf` bytes → `Blob`. `/out` is cleared per render.

## Non-goals

- No host filesystem access; `/project` is purely in-memory (browser). Nothing is written back to
  the editor/project source or Yjs (Principle VII — shared content immutability).
- No mount of remote resources (Principle X); remote refs never reach the VFS.
