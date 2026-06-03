# Research: Project Page Editor

**Phase 0 output for `012-project-page-editor`**

---

## Decision 1 — Asciidoctor.js Integration in Next.js 16

**Decision**: Dynamically import `asciidoctor` inside a `useEffect` hook using the native ESM dynamic `import()` syntax. The component is wrapped in `'use client'`; the import is deferred until after mount to skip the SSR phase entirely.

```typescript
// apps/web/src/components/asciidoc-preview.tsx
'use client';
import { useEffect, useState } from 'react';

export function AsciiDocPreview({ content }: { content: string }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('asciidoctor').then(({ default: Asciidoctor }) => {
      if (!cancelled) {
        const processor = Asciidoctor();
        setHtml(processor.convert(content) as string);
      }
    });
    return () => { cancelled = true; };
  }, [content]);

  if (!html) return <div>Rendering preview…</div>;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
```

**Rationale**: The `asciidoctor` npm package ships a browser-compatible build. Dynamic `import()` with `ssr: false` via `next/dynamic` would also work, but the `useEffect` pattern is simpler here since `AsciiDocPreview` is already a client component that never appears in the server-rendered shell. Deferring the import prevents webpack from bundling Asciidoctor.js into the initial JS payload for users who never open the preview panel.

**Alternatives considered**:
- `next/dynamic(() => import('./asciidoc-preview'), { ssr: false })` — equivalent but adds an extra wrapping component level; the `useEffect` approach is cleaner for a component that is always client-side.
- CDN `<script>` tag — violates project's pnpm dependency management; not tree-shakeable.
- Server-side AsciiDoc rendering — out of scope per spec assumption; the Ruby sidecar is reserved for PDF generation only.

**New dependency**: `asciidoctor` must be added to `apps/web/package.json` (`pnpm add asciidoctor`). It is not currently listed. Install **v3.0.4 or later** — v3.0.3 had a Next.js webpack bug (`exports` field ordering) that was fixed in v3.0.4. The correct convert call is `processor.convert(source, { safe: 'safe' })` — the `safe` option prevents execution of potentially dangerous AsciiDoc macros while still rendering all standard document content.

---

## Decision 2 — Split-Pane Layout Strategy

**Decision**: CSS Flexbox with a fixed-width left sidebar (file tree) and a flex-1 right area (content + preview). No third-party resizable-panel library.

```
┌────────────────────────────────────────────────────┐
│  [← Back]  Project Name   [Members] [Settings]    │  ← header row (server-rendered)
├──────────────┬─────────────────────────────────────┤
│              │                                     │
│  File Tree   │  Content Panel  │  Preview Panel   │
│  (fixed 256px│  (flex-1)       │  (collapsible,  │
│   or 20vw)   │                 │   ~40% width)    │
│              │                 │                  │
└──────────────┴─────────────────────────────────────┘
```

**Rationale**: The spec does not require user-resizable panels. Tailwind utility classes (`flex`, `w-64`, `flex-1`) are sufficient and introduce no new dependency. The preview panel collapses by setting `hidden` / toggling a width class.

**Alternatives considered**:
- `react-resizable-panels` (npm) — enables resizable panes but adds ~8 KB gzipped and complexity not required by the spec.
- CSS Grid — equivalent capability to Flexbox for this layout; Flexbox was chosen for consistency with existing component patterns in the codebase.

---

## Decision 3 — Preview Panel State Persistence

**Decision**: `sessionStorage` key `asciidoc-preview-open` (boolean serialized as `'true'`/`'false'`).

**Rationale**: FR-006 specifies "persist its open/closed state for the duration of the browser session." `sessionStorage` is per-tab, clears on tab close, and is synchronous — a direct mapping to the requirement. Read on mount in `useEffect` to avoid SSR hydration mismatch.

**Alternatives considered**:
- `localStorage` — persists beyond the browser session, violating FR-006.
- React context / Zustand — ephemeral; resets on full page navigation.
- URL query param (`?preview=1`) — visible in the address bar; not appropriate for UI-only state.

---

## Decision 4 — File Management UX (replacing `window.prompt()`)

**Decision**: Inline rename input (on double-click or clicking the rename menu item, the node name becomes a controlled `<input>` that commits on Enter/blur or cancels on Escape). Delete uses the existing `ConfirmationDialog` component. Create file/folder uses a small inline input at the insertion point.

**Rationale**: `window.prompt()` is not inspectable by Playwright selectors. Inline editing is the standard file-tree UX pattern and is directly testable. The existing `ConfirmationDialog` component covers the delete confirmation requirement.

**Alternatives considered**:
- Full modal dialog for rename — more UI than needed for a short name change.
- Keeping `window.prompt()` — fails E2E testability requirement (FR-014, FR-015).

---

## Decision 5 — AsciiDoc File Detection

**Decision**: Extension-based detection. Files with extensions `.adoc`, `.asciidoc`, `.asc` are treated as AsciiDoc; all others show "Preview not available for this file type."

**Rationale**: The file name is always available in the tree node DTO. MIME type (`text/asciidoc`) is stored in the database but the current file-tree DTO does not expose it; adding it would require a schema/DTO change that is out of scope for this feature.

**Alternatives considered**:
- Expose MIME type in the file-tree DTO — requires `packages/shared` DTO change + API route change; deferred to future feature.
- Content sniffing — unreliable for AsciiDoc, which has no magic bytes.

---

## Decision 6 — Binary File Handling in Content Panel

**Decision**: Detect binary files by inspecting the `Content-Type` response header from the file-content API. If the content type is not `text/*`, display a "Preview not available" placeholder rather than attempting to render the bytes.

**Rationale**: The API already sets the correct Content-Type on the file-content endpoint. This avoids maintaining an extension allowlist.

**Alternatives considered**:
- Extension allowlist (`.adoc`, `.txt`, `.json`, …) — fragile; misses edge cases like `.xml`.
- Try-render-catch-garbled — bad UX if binary content is partially displayed before the error.

---

## Decision 6b — `useFileSelection` Hook Ownership

**Decision**: `useFileSelection` is called in `ProjectEditorLayout` (not inside `FileContentPanel`). The layout owns all selection and content-fetch state and passes it down as props to both `FileContentPanel` (`contentState`) and `AsciiDocPreview` (`content`).

**Rationale**: Both `FileContentPanel` and `AsciiDocPreview` need access to the fetched content. Placing the hook in the layout gives both panels access to a single shared fetch result without duplicating the fetch or prop-drilling through an intermediary. `FileContentPanel` becomes a pure display component — easier to test (no fetch mocking needed, just pass contentState props) and easier to reason about.

**Alternatives considered**:
- Hook inside `FileContentPanel` — `AsciiDocPreview` would need content independently or via `FileContentPanel` forwarding it, creating awkward prop chains or duplicate fetches.

---

## Decision 6c — Sidebar Panel Collapse Toggle

**Decision**: The file tree sidebar panel includes a toggle button that shows/hides the panel using React state (`sidebarOpen`, default `true`). When collapsed, the panel renders with zero width (`w-0 overflow-hidden`), allowing the content area to expand. State is NOT persisted — resets on page load.

**Rationale**: FR-001 requires the file tree panel to be collapsible. The spec does not require persistence for this state (only the preview panel toggle is required to persist, per FR-006). React state is the simplest mechanism; no sessionStorage overhead.

**Alternatives considered**:
- `sessionStorage` for sidebar state — adds persistence not required by spec.
- CSS-only toggle (`:has()` selector or checkbox hack) — not compatible with React controlled state patterns.

---

## Decision 7 — Role-Based Access Control for File Management Controls

**Decision**: The server component (`page.tsx`) fetches `currentUserRole` via the existing `getProjectAccess` helper and passes `isOwner: boolean` as a prop to the client layout component. File management controls (create, rename, delete) are only rendered when `isOwner === true`.

**Rationale**: Role is already fetched server-side for the existing page. Propagating it as a prop avoids a redundant client-side API call for role information. Hiding controls at render time satisfies SC-006 (zero owner-only affordances visible to non-owners).

**Alternatives considered**:
- Client-side role check via `/api/me` — redundant; role is already known server-side.
- Relying on API 403 responses — correct for security but does not satisfy the SC-006 UX requirement.

---

## Decision 8 — Empty State for File Tree

**Decision**: When the file tree root has zero children, render an inline empty-state message ("No files yet. Create your first file.") with a "New File" button (owner only). Use the existing `EmptyState` component if applicable.

**Rationale**: FR-001 / Acceptance Scenario 4 of User Story 1 requires an explicit empty-state prompt. The existing `EmptyState` component (`apps/web/src/components/empty-state.tsx`) is the appropriate reuse point.
