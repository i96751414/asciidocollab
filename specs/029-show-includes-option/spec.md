# Feature Specification: Optional Display of Included AsciiDoc Files in Preview

**Feature Branch**: `029-show-includes-option`

**Created**: 2026-06-20

**Status**: Draft

**Input**: User description: "the HTML preview now shows the included asciidoc files, make showing the included asciidoc files an option which is disabled by default. all other features such as variable loading from sub documents which are usable after the include location must still work."

## Clarifications

### Session 2026-06-20

- Q: When an included file is hidden, should its placeholder be interactive or purely informational? → A: Click to open the included file in the editor (navigation).
- Q: Should the option also hide non-AsciiDoc includes (e.g. code/source snippet includes), or only AsciiDoc includes? → A: Hide all includes (AsciiDoc and non-AsciiDoc) behind a placeholder.
- Q: Where should the toggle control for this option be surfaced? → A: Preview header only.
- Q: What is the ownership/scope of the show/hide option? → A: A user-only option — a personal per-user preference; not per-project or per-document, and one user's choice does not affect other users.
- Q: When includes are hidden, must document-setting attributes (e.g. `leveloffset`, `table-caption`, and similar caption/label/numbering attributes) defined in included documents — including documents that themselves include further documents — still take effect in the preview? → A: Yes. All such definitions from the full transitive include graph must continue to affect rendering of subsequent content exactly as if the includes were shown.
- Q: Does the option affect any export/published-output path, or only the live HTML preview? → A: Live HTML preview only. The product has no AsciiDoc-rendering export/publish/print path; existing raw-source downloads (project ZIP, per-file download) return unrendered `.adoc` source and are unaffected by this option.
- Q: Regarding "images must always show" — does the option affect image rendering? → A: No. `image::` macros that appear in the rendered (non-included) content always render and are never hidden by the option. Images located *inside* a hidden included file remain hidden along with that include's body (only the placeholder is shown); the option only suppresses content that originates from included files.
- Q: Does the option (and its placeholder + attribute-loading behavior) apply only when previewing the configured project main file, or to every previewed file that has includes? → A: Every previewed AsciiDoc file that contains includes, regardless of whether it is the project main file. The previewed file's own includes are processed with the option applied.
- Q: Whose copy of each file is used for include expansion and attribute resolution? → A: The most current content available for each file — the live, in-progress collaborative version (including unsaved edits) when that file has an active collaboration session, otherwise its latest saved version. The previewed file uses its live editor content.
- Q: Should the preference sync across the user's devices, or only persist locally? → A: Local only — persisted in the user's browser (browser-local storage), like the editor's left-panel view preference. It is NOT synced to the account or across devices/browsers.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Edit a file without included content cluttering the preview (Priority: P1)

A writer is editing a master document (or a sub-document) that pulls in other AsciiDoc files through `include::` directives. By default, they want the preview to render only the file they are working on, without expanding the bodies of the included files into the output. At the same time, any variables/attributes that those included files define must still be loaded so that text appearing *after* the include location continues to resolve those variables correctly.

**Why this priority**: This is the core of the request — the default behavior must change so included file *content* is hidden, while the existing cross-document variable resolution keeps working. Without this, the feature delivers no value.

**Independent Test**: Open a document that includes a sub-document which defines an attribute (e.g., `:product-name: Acme`), and references `{product-name}` in a paragraph after the include. With the option at its default (disabled), confirm the preview does **not** show the included file's body but **does** render the paragraph with the resolved value "Acme".

**Acceptance Scenarios**:

1. **Given** a document with an `include::child.adoc[]` directive and the "show included files" option at its default state, **When** the preview renders, **Then** the included file's body content does not appear in the preview output and a subtle placeholder referencing `child.adoc` is shown at the include location.
2. **Given** the included sub-document defines an attribute that is referenced later in the parent document, **When** the preview renders with the option disabled, **Then** the later reference resolves to the value defined in the included file.
3. **Given** a conditional region (e.g., `ifdef::`) later in the document depends on an attribute set by an included file, **When** the preview renders with the option disabled, **Then** the conditional evaluates as if the include had been processed.
4. **Given** the option is disabled and a placeholder is shown for `include::child.adoc[]`, **When** the user activates the placeholder, **Then** `child.adoc` opens in the editor.
5. **Given** an included document (or a document nested deeper in the include chain) sets `:leveloffset:` and `:table-caption:`, **When** the preview renders with the option disabled, **Then** the heading levels and table captions of content following the include reflect those definitions exactly as if the include were shown.

---

### User Story 2 - Opt in to see the fully assembled document (Priority: P2)

A writer wants to review how the complete, assembled document looks with all included files expanded in place. They enable the "show included files" option and the preview now renders the included content inline at each include location, exactly as it does today.

**Why this priority**: Preserving the ability to see the assembled output is important for final review, but it is the opt-in path and not the default, so it is secondary to establishing the new default behavior.

**Independent Test**: With a document containing an include directive, enable the option and confirm the included file's body now appears inline at the include location.

**Acceptance Scenarios**:

1. **Given** the "show included files" option is enabled, **When** the preview renders a document with an `include::` directive, **Then** the included file's content appears inline at the include location.
2. **Given** the option is enabled, **When** the user disables it again, **Then** the preview updates to hide the included content without a manual page reload.

---

### User Story 3 - Preference is remembered (Priority: P3)

A writer sets their preferred state for the "show included files" option once, and that choice is remembered across editing sessions in the same browser, consistent with how the editor's client-only view preference (left-panel tab) behaves.

**Why this priority**: Persistence improves the experience but is not required to deliver the core value; the feature is usable within a session without it.

**Independent Test**: Toggle the option, reload the application in the same browser, and confirm the chosen state is retained.

**Acceptance Scenarios**:

1. **Given** the user enables the option, **When** they reload the application in the same browser, **Then** the option remains enabled.
2. **Given** the user has set the option in one browser, **When** they open the application in a different browser or on another device, **Then** the option starts at its default there (the preference is browser-local and intentionally not synced).

---

### Edge Cases

- **Missing / unresolvable include target**: With the option disabled, an unresolved include still shows the placeholder (referencing the unresolved target) and produces no rendering error; with the option enabled, the existing unresolved-include behavior is unchanged.
- **Include inside an inactive conditional region**: An include that is gated out by a false `ifdef`/`ifndef`/`ifeval` does not contribute its attributes, regardless of the option's state (matching current gating semantics).
- **Nested includes**: Attribute loading must continue to work through multiple levels of includes when the option is disabled; the visual suppression also applies at every nesting level when disabled.
- **Partial includes (`tags=` / `lines=`)**: When the option is disabled, attribute side effects are derived from the same selected portion of the included file that would have been rendered when enabled.
- **The open file is itself an included sub-document**: Viewing a sub-document directly still loads its inherited attributes (cross-document scope) and applies the option only to includes that the sub-document itself contains.
- **Document with no includes**: The option has no observable effect on the preview output.
- **Images**: `image::` (and inline `image:`) macros in the rendered (non-included) content always render and are never affected by the option. An image that appears *inside* a hidden included file is suppressed together with that include's body (only the placeholder shows).
- **Non-main file with includes**: Previewing any file that itself contains includes applies the option to that file's includes (placeholders + attribute loading), independent of the project main file. If the previewed file is also a child of the main file, attributes it *inherits* from its ancestors continue to resolve (cross-document scope) in addition to those defined by its own includes.
- **Stale vs. live included content**: When an included file has no active collaboration session, its latest saved version is used; when it has an active session, its live (possibly unsaved) version is used. A file currently unavailable from any source is treated as an unresolvable include (placeholder shown, no body).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a user-controllable preview option that determines whether the content of included AsciiDoc files is displayed in the HTML preview.
- **FR-002**: The option MUST default to disabled (included file content hidden) for new users and for existing users who have no stored preference.
- **FR-003**: When the option is disabled, the preview MUST NOT render the body content of any included file (AsciiDoc or non-AsciiDoc, including code/source snippet includes) at its include location.
- **FR-003a**: When the option is disabled, the preview MUST display a subtle, non-intrusive placeholder at each include location indicating that included content is collapsed there, including a reference to the included target so the writer can identify what is hidden.
- **FR-003b**: The placeholder MUST be interactive: activating it opens the referenced included file in the editor (navigation), consistent with existing in-app file navigation. For an unresolvable target, the placeholder remains visible but performs no navigation.
- **FR-004**: When the option is disabled, attributes/variables defined in included sub-documents MUST still be loaded and made available to content that appears after the corresponding include location (cross-document attribute resolution must continue to function).
- **FR-004a**: When the option is disabled, document-setting attributes defined in included documents — including `leveloffset`, the caption/label/numbering family (e.g., `table-caption`, `figure-caption`, `example-caption`, admonition `*-caption`, `appendix-caption`, `toc-title`, `chapter-signifier`), and section-numbering/auto-ID attributes (e.g., `sectnums`, `idprefix`, `idseparator`, `xrefstyle`) — MUST continue to take effect on the rendering of subsequent content exactly as if the includes were shown.
- **FR-004b**: The attribute loading required by FR-004 and FR-004a MUST be resolved across the full transitive include graph — definitions in documents that are themselves included by other included documents (nested to any depth) MUST be honored, subject to existing conditional gating.
- **FR-005**: When the option is disabled, include-driven effects that influence subsequent content — including conditional evaluation (`ifdef`/`ifndef`/`ifeval`) that depends on attributes set by included files — MUST behave as if the include had been processed.
- **FR-006**: When the option is enabled, the preview MUST render the content of included files inline at each include location (the current behavior).
- **FR-007**: The system MUST expose a toggle control for the option in the preview header (it is not required in the settings page).
- **FR-008**: Changing the option MUST update the preview to reflect the new state without requiring a manual page reload.
- **FR-009**: The system MUST persist the user's choice locally in the browser across sessions (browser-local storage). Cross-device / cross-browser synchronization is explicitly NOT required and NOT performed; the preference is local to the user's browser, like the editor's left-panel view preference. The choice MUST NOT be sent to or stored on the account/server.
- **FR-010**: The option's behavior MUST apply consistently regardless of include nesting depth.
- **FR-011**: The option MUST NOT alter the rendered output of content that does not originate from included files. In particular, `image::` and inline `image:` macros in the rendered (non-included) content MUST always render regardless of the option's state; images that originate inside a hidden included file are suppressed with that include's body.
- **FR-012**: The option MUST apply to every `include::` directive regardless of the included file's type; variable/attribute loading (FR-004) remains relevant only for AsciiDoc includes that define attributes, while content suppression (FR-003) applies to all include types.
- **FR-013**: The option MUST be scoped to the individual user as a personal preference; it MUST NOT be a per-project or per-document setting, and one user's choice MUST NOT change what any other user sees for the same document.
- **FR-014**: The option's behavior — body suppression, placeholders, click-to-open, and preserved attribute/variable loading — MUST apply to the preview of EVERY AsciiDoc file that contains includes, regardless of whether that file is the configured project main file. The previewed file's own include directives (and their transitive includes) are processed with the option applied; a previewed file with no includes is unaffected.
- **FR-015**: Include expansion and cross-document attribute/variable resolution MUST use the MOST CURRENT content available for each involved file: the live collaborative version (including unsaved in-progress edits) when that file has an active collaboration session, otherwise its latest saved version. The previewed (open) file MUST resolve from its live editor content. This applies identically whether the option is enabled or disabled.

### Key Entities *(include if feature involves data)*

- **Show-included-files preference**: A per-user boolean preference indicating whether included AsciiDoc file content is displayed in the preview. Defaults to disabled. Stored in browser-local storage as a client-only preference (not synced to the account, not sent to the server), alongside the other client-only editor preferences (e.g. the left-panel view).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With default settings, a document that references a variable defined in an included sub-document after the include point renders the resolved variable value while showing none of the included file's body, and displays a placeholder referencing the included target at the include location.
- **SC-002**: 100% of cross-document attribute/variable behaviors that work with includes today continue to work when the option is disabled (verified across the existing cross-document attribute scenarios).
- **SC-003**: Toggling the option updates the preview to the corresponding state (content shown vs. hidden) within the normal preview refresh time, with no manual reload required.
- **SC-004**: A user's chosen option state is retained after reloading the application in the same browser. (Cross-device/cross-browser sync is out of scope; a different browser starts at the default.)
- **SC-005**: For a document with no include directives, enabling or disabling the option produces identical preview output.
- **SC-006**: For document-setting attributes (`leveloffset`, caption/label/numbering, section-numbering, auto-ID) defined anywhere in the transitive include graph, the rendered heading levels, captions, numbering, and identifiers of content after the include are identical whether the option is enabled or disabled.
- **SC-007**: Previewing a non-main file that contains includes exhibits the same behavior as previewing the main file: bodies hidden by default with placeholders, variables/attributes from the includes resolved for subsequent content, and click-to-open working.
- **SC-008**: When an included file has unsaved collaborative edits in an active session, the preview reflects those edits (in both the included content when shown and the resolved variable values) rather than the last-saved version.

## Assumptions

- "Showing the included asciidoc files" refers to rendering the included file *content* inline in the preview; it does not refer to the include directive's side effects (attribute definitions, conditional state), which must continue to apply when the option is disabled.
- When the option is disabled, each hidden include is replaced by a subtle, non-intrusive placeholder that references the included target (e.g., a faint inline chip showing the include path) and can be activated to open that file in the editor, so the writer can see that content is collapsed there and jump to it. The placeholder must not visually compete with the document content.
- The option applies to all `include::` directives in the previewed document; the primary motivation is AsciiDoc sub-documents, and attribute loading is only relevant for those.
- The option is a user-only preference (confirmed: per-user, not per-document or per-project — see FR-013), following the established pattern of existing preview preferences (e.g., the preview style preference).
- The toggle control is surfaced in the preview header (see FR-007). The preference is stored in browser-local storage as a client-only value (not duplicated on the settings page, not synced to the account), following the established client-only preference pattern (e.g. the left-panel view).
- Attribute resolution continues to walk the full include graph (subject to existing conditional gating) so that variable availability is identical whether or not the included content is visually displayed.
- This feature builds on the existing include-assembly and cross-document attribute resolution introduced in prior features (notably cross-document attributes, feature 027); no changes to attribute semantics are intended — only the visibility of included content in the preview.
- The option affects only the live in-app HTML preview, which is the product's sole AsciiDoc-rendering path. There is no export, publish, print, or server-side render-to-file path to consider. Existing raw-source downloads (project ZIP and per-file download) return unrendered `.adoc` source and are out of scope / unaffected by this option.
