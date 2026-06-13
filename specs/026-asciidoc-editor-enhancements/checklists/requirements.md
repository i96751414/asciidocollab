# Specification Quality Checklist: AsciiDoc Editor Enhancements

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-06-13
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`
- The line-wrap story (US2) and the soft-wrap internals already partially exist in the codebase; the spec frames this as exposure/wiring rather than net-new capability. This is captured as an assumption rather than an implementation detail.
- The exact maximum heading level is intentionally tied to the AsciiDoc standard / existing render pipeline rather than hard-coded in the spec, to avoid prematurely fixing a value that planning should confirm.
- Scope was expanded after the initial draft to include section folding with copy/cut-while-collapsed (US4, FR-016a/b) and a gap-analysis-driven set of additional stories (US7–US11: complete highlighting coverage, authoring assistance incl. cross-file reference resolution, authoring conveniences, whole-document folding/persistence, live metrics). These were derived from comparing the current Lezer grammar/toolbar against established AsciiDoc highlighters (the parity analysis itself, originally drafted as a story, was completed during specification and removed as a deliverable).
- A second, code-grounded gap analysis (2026-06-13) compared the editor against the Asciidoctor VS Code extension, the IntelliJ Asciidoctor plugin, the Eclipse AsciiDoc editor, and the Prism.js/highlight.js grammars (reading their actual source). It confirmed the custom Lezer grammar already exceeds the lightweight highlighters and that the real gaps are editor intelligence. Selected additions were folded into US4/US7/US8/US9 and a new US12 (cross-file refactoring): path/attribute completion, go-to-symbol, rename/find-usages/move-file, unresolved-attribute diagnostic, paste-HTML, spell-check, conditional/CSV-DSV/inline-macro highlighting + extra folding. Deselected (out of scope this iteration): obsolete-syntax inspections, table reformat, export.
- This is now a large multi-part feature (12 user stories, FR-001–FR-067 with intentional gaps at FR-023/024). Planning SHOULD split it into shippable increments aligned to priorities: P1 fixes (US1–US2) → P2 highlighting/folding (US3, US4, US7) → P3 intelligence & refactoring (US5, US6, US8, US9, US10, US11, US12).
- A source-code audit (2026-06-13) verified existing vs. missing implementation for every story and is recorded in the spec's "Current Implementation Status" section with file:line evidence. Key results: US1 root cause pinned (a remount in project-editor-layout.tsx:435-508); US2 is ~90% done (only the soft-wrap toggle is not wired into the settings panel); US8's completion engine already exists but is single-file (the work is cross-file extension + diagnostics + xref nav, not building completion from scratch); the image-upload primitive (FR-040) already exists; and move/rename currently leaves stale references (FR-066 fixes a latent bug). Planning must treat partially-implemented requirements as "extend/expose", not "build new".
