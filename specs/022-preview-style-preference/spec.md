# Feature Specification: Per-User Preview Style Preference

**Feature Branch**: `022-preview-style-preference`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "Let each user choose how the AsciiDoc preview renders, without changing the document or what teammates see. Per-user 'preview style' preference with two options: Asciidocollab (default brand look, adapts to light/dark) and Asciidoctor (standard look from official AsciiDoc docs)."

## Clarifications

### Session 2026-06-10

- Q: How should the preview style preference behave for unauthenticated/guest viewers? → A: No anonymous preview exists — the preview (and this feature) is only accessible to authenticated users, so no guest handling is required.
- Q: On the first preview render after a page load/reload, should the saved style be applied before content is first painted? → A: Yes — apply the saved style before first paint; no flash of the default style.
- Q: Which spelling is the canonical user-facing label? → A: Display labels are "Asciidocollab" and "Asciidoctor".
- Q: How are the two styles represented in storage vs. on screen? → A: Stored/transported values are lowercase tokens (`asciidocollab` default, `asciidoctor`) — used for the DB column, DTO enum, and the `data-preview-style` attribute; the UI renders the display labels "Asciidocollab" and "Asciidoctor". Value and label are intentionally separate.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Switch preview style from the preview header (Priority: P1)

A writer working in the editor wants to proof their content in the familiar appearance of the official AsciiDoc documentation. From a control in the preview pane header, they switch the style from "Asciidocollab" to "Asciidoctor" and the rendered content immediately restyles in place, without reloading or altering the document text.

**Why this priority**: This is the core capability — the ability to change how the preview looks on demand. Without it, none of the other value (persistence, dark-mode handling) matters. It is independently demonstrable and delivers the primary benefit on its own.

**Independent Test**: Open a document with mixed content in the editor, locate the Style control in the preview header, switch between the two options, and confirm the rendered preview visibly changes appearance each time while the editor source remains untouched.

**Acceptance Scenarios**:

1. **Given** a document open in the editor with the preview showing the default Asciidocollab style, **When** the writer selects "Asciidoctor" from the Style control in the preview header, **Then** the rendered preview restyles to the Asciidoctor appearance immediately without a page reload and without changing the document source.
2. **Given** the preview is showing the Asciidoctor style, **When** the writer selects "Asciidocollab" from the Style control, **Then** the preview restyles back to the brand look immediately.
3. **Given** any selected style, **When** the writer edits the document text, **Then** the preview updates content as before and retains the selected style.

---

### User Story 2 - Preference persists per user across sessions and devices (Priority: P2)

A writer sets their preferred preview style once and expects it to be remembered. When they reload the page, return later, or open the application on a different device, the preview opens in their previously chosen style. The preference belongs to the user, not to a document or a single browser.

**Why this priority**: Persistence turns a one-off toggle into a durable personal preference, which is the explicitly stated user expectation. It builds on P1 but is not required to demonstrate the core styling capability.

**Independent Test**: Choose "Asciidoctor" as the style, reload the application, and confirm the preview opens in Asciidoctor style; sign in on a different device/browser as the same user and confirm the same style is applied.

**Acceptance Scenarios**:

1. **Given** a writer has selected "Asciidoctor" as their preview style, **When** they reload the application, **Then** the preview opens in Asciidoctor style.
2. **Given** a writer has selected a preview style on one device, **When** they sign in as the same user on a different device or browser, **Then** the preview applies the same selected style.
3. **Given** a writer changes the preference from the Style control in the preview header, **When** they open their settings, **Then** the settings reflect the same current value; and vice versa — changing it in settings updates what the preview header control shows.
4. **Given** a brand-new user who has never set a preference, **When** they first open a preview, **Then** the style defaults to "Asciidocollab".

---

### User Story 3 - Each style is legible and correct in the user's color mode (Priority: P2)

A reader who works in dark mode opens a preview. The Asciidocollab style honors dark mode (dark-themed rendering). When they switch to the Asciidoctor style, it renders in its own light appearance matching the official docs and remains legible regardless of the application's color mode. The Asciidoctor appearance stays confined to the preview content and does not bleed into the surrounding application UI.

**Why this priority**: Correct, legible rendering in both color modes is essential for the feature to be usable, but it depends on the styling capability (P1) and shares importance with persistence (P2).

**Independent Test**: With the application in dark mode, view a document in Asciidocollab style (confirm dark-themed content), then switch to Asciidoctor style (confirm light docs-like content that is still legible), and confirm the application chrome around the preview is unchanged in both cases.

**Acceptance Scenarios**:

1. **Given** the application is in dark mode and the Asciidocollab style is selected, **When** the preview renders, **Then** the content is dark-themed and legible.
2. **Given** the application is in dark mode and the Asciidoctor style is selected, **When** the preview renders, **Then** the content uses the Asciidoctor light appearance and remains legible.
3. **Given** the Asciidoctor style is selected, **When** the preview renders, **Then** the Asciidoctor styling applies only to the preview content area and the surrounding application UI (toolbars, panels, menus) is visually unchanged.

---

### Edge Cases

- **No stored preference / first use**: When a user has never chosen a style, the preview defaults to "Asciidocollab".
- **Unrecognized or corrupt stored value**: If the persisted preference is missing or holds a value that is not one of the two supported styles, the preview falls back to the "Asciidocollab" default rather than failing to render.
- **Preference set on two surfaces at once**: When the user changes the style in the preview header and in settings within the same session, both surfaces reflect the latest choice consistently.
- **Switching styles mid-edit / mid-scroll**: Changing style while the document is being edited or scrolled does not alter the document source, the cursor, or break scroll position synchronization.
- **Content type coverage**: Each style must correctly render admonitions, code blocks, tables, and all list types (ordered, unordered, checklist, description lists) without broken layout.
- **Concurrent collaborators**: When two users view the same document with different selected styles, each sees their own style and neither affects the other's view or the shared document.
- **Offline persistence**: If the preference cannot be saved to the user's account at the moment of change (e.g., transient connectivity issue), the chosen style still applies for the current session and is reconciled when the account preference can next be saved.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a "preview style" preference per user with exactly two options, each having a stored token value and a display label: Asciidocollab (token `asciidocollab`, default) and Asciidoctor (token `asciidoctor`).
- **FR-002**: System MUST default the preview style to Asciidocollab (token `asciidocollab`) for any user who has not explicitly chosen a style.
- **FR-003**: System MUST present a visible Style control in the preview pane header offering the two style options and indicating the currently active style.
- **FR-004**: System MUST restyle the rendered preview immediately when the user changes the style, without reloading the page and without re-fetching or altering the document source.
- **FR-005**: System MUST allow the user to set the same preview style preference from their user settings.
- **FR-006**: System MUST keep the Style control in the preview header and the setting in user settings in sync so both reflect the same current value at all times.
- **FR-007**: System MUST persist the preview style preference scoped to the user, such that it survives reloads and is applied across the user's sessions and devices.
- **FR-008**: System MUST render the Asciidocollab style as the product brand look, adapting to the application's light and dark color modes, including the refined unordered-list, checklist, and description-list styling.
- **FR-009**: System MUST render the Asciidoctor style in its own light appearance matching the official AsciiDoc documentation, remaining legible regardless of the application's color mode.
- **FR-010**: System MUST confine the Asciidoctor style's appearance to the preview content area, leaving all application chrome (toolbars, panels, menus, and other UI) visually unaffected.
- **FR-011**: Both styles MUST correctly render admonitions, code blocks, tables, and all list types (ordered, unordered, checklist, and description lists).
- **FR-012**: Changing the preview style MUST NOT alter the document source or change what any other user sees in their own preview.
- **FR-013**: System MUST preserve existing preview content sanitization behavior unchanged for both styles.
- **FR-014**: System MUST preserve existing preview scroll-synchronization behavior unchanged for both styles.
- **FR-015**: System MUST fall back to the Asciidocollab default (token `asciidocollab`) when the stored preference is absent or not one of the two supported token values (`asciidocollab`, `asciidoctor`).
- **FR-016**: System MUST apply the user's saved preview style before the preview content is first painted on initial load or reload, so the user never sees a flash of the default style before their saved style is applied.

### Key Entities *(include if data involved)*

- **Preview Style Preference**: A per-user setting recording the user's chosen preview rendering style. Allowed stored token values: `asciidocollab` (default) and `asciidoctor`, surfaced in the UI as the display labels "Asciidocollab" and "Asciidoctor". Owned by and scoped to a single user; independent of any document, project, or device.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A writer can change the preview style from the preview header and see the rendered content restyle in under 1 second, with no page reload.
- **SC-002**: 100% of new users see the Asciidocollab style by default on their first preview.
- **SC-003**: A user's chosen style is reapplied after a reload and on a different device 100% of the time the preference was successfully saved.
- **SC-004**: Both styles render admonitions, code blocks, tables, and all four list types (ordered, unordered, checklist, description) with no broken or missing styling, verified across a representative content sample.
- **SC-005**: Selecting the Asciidoctor style produces zero visible changes to the application chrome outside the preview content area.
- **SC-006**: In dark mode, both styles remain legible (text and background meet readability expectations) as judged by review against a representative document.
- **SC-007**: Switching styles causes zero changes to the document source and zero observable regressions in scroll synchronization across a representative editing session.
- **SC-008**: On initial load/reload for a user whose saved style is Asciidoctor, the preview renders directly in Asciidoctor style with no observable flash of the Asciidocollab default before first paint.

## Assumptions

- The application already has an authenticated per-user context and a mechanism for storing user-scoped preferences, which this feature reuses for persistence across sessions and devices. Preview access is limited to authenticated users; there is no anonymous/guest preview, so no guest-scoped preference handling is required.
- The application already has a light/dark color-mode concept that the Asciidocollab style adapts to; the Asciidoctor style intentionally ignores it and always renders light.
- The existing preview rendering pipeline (content generation, sanitization, and scroll-sync) remains the single source for preview content; this feature changes only presentation/styling, not how content is produced or sanitized.
- "Immediately" for restyling means a client-side restyle perceptible as instant (well under 1 second) without a full page reload.
- The Asciidoctor style targets the standard appearance of the official AsciiDoc documentation as the reference; pixel-exact parity is not required, but the four listed content categories must render correctly and legibly.
- Per-document and per-project style overrides, export/output styling, additional styles beyond the two named, and theming of the application chrome are explicitly out of scope.
