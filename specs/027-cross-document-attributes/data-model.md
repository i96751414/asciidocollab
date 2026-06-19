# Phase 1 Data Model: Cross-Document Attribute Resolution & Editor State Memory

These are in-memory / client-side models (no DB migration). They extend existing shapes in `apps/web/src/lib/asciidoc/extraction.ts`, `packages/shared`, and the editor. Persistence: project main-file config is the existing `Project.mainFileNodeId` (Prisma); per-user cursor memory is `localStorage`.

## Entity: AttributeDefinition

A named attribute set/unset at a point in document reading order.

| Field | Type | Notes |
|---|---|---|
| `name` | string | lowercased (Asciidoctor case-insensitive) |
| `value` | string \| null | `null` ⇒ unset (`:!name:` or `{set:name!}`) |
| `fileId` | string | originating file |
| `pos` | number | document offset within the assembled reading order |
| `source` | `'entry' \| 'inline-set' \| 'seed'` | `entry` = `:name:`, `inline-set` = `{set:…}`, `seed` = API/inherited |
| `locked` | boolean | fixed/override — not overridable by later in-document defs (FR-004, FR-043) |

**Rules**: later definition in reading order wins unless an earlier one is `locked`; an unset removes the name from scope for subsequent content (FR-005). Values may contain `{ref}` resolved at definition time against attributes-so-far (existing behavior).

## Entity: ResolvedAttributeScope

The effective attribute values at a position (or for a file's inherited context).

| Field | Type | Notes |
|---|---|---|
| `fileId` | string | the file this scope applies to |
| `values` | ReadonlyMap<string,string> | name → value in effect |
| `origin` | `'root' \| 'inherited' \| 'standalone'` | inherited = from first-include point (FR-002a); standalone = no main file (FR-002b) |

Derived by walking the include tree from the project main file (existing `inheritedAttributes` map, extended for unset/`{set:}`/wrapping/precedence).

## Entity: IncludeEdge (extended)

Existing shape extended with partial-include and (optionally) conditional gating.

| Field | Type | Notes |
|---|---|---|
| `from` | string | parent file id |
| `to` | string | included file id |
| `includeDirectiveRange` | {from,to} | offset of the `include::` directive (existing) |
| `leveloffset` | number | signed offset (existing) |
| `tags` | string[] \| null | NEW — tag filter expression tokens (FR-033) |
| `lines` | Array<[number, number\|null]> \| null | NEW — line ranges, open-ended end = null (FR-034) |
| `gatedBy` | ConditionalExpr \| null | NEW — include-gating conditional, if any (FR-030) |

## Entity: ConditionalRegion / ConditionalExpr

A guarded span and its controlling condition.

| Field | Type | Notes |
|---|---|---|
| `kind` | `'ifdef' \| 'ifndef' \| 'ifeval'` | |
| `attrs` | string[] | attribute names (ifdef/ifndef; supports `,`/`+` operators) |
| `expr` | {lhs,op,rhs} \| null | ifeval comparison (restricted, non-`eval`) |
| `range` | {from,to} | content span the condition guards |
| `active` | boolean (derived) | evaluated against ResolvedAttributeScope (FR-029, FR-031) |

## Entity: InlineStyleRegistry

Extensible set of known inline styles for editor emphasis (FR-021c).

| Field | Type | Notes |
|---|---|---|
| `builtIn` | ReadonlySet<string> | shipped role/style names |
| `custom` | Set<string> | configurable additions; registering a name needs no code change |
| `isKnown(role)` | (string) ⇒ boolean | known ⇒ distinct emphasis; unknown role spans still highlighted generically |

## Entity: PerFileCursorMemory

Per-user, per-file remembered cursor line (localStorage; extends `use-last-selection.ts`).

| Field | Type | Notes |
|---|---|---|
| storage key | string | `asciidocollab:file-cursors:{userId}:{projectId}` |
| value | Record<nodeId, { line: number }> | per-file map (FR-022) |
| `line` | number | 1-based; clamped to nearest valid line on restore (FR-025); absent ⇒ top (FR-026) |

**Rules**: isolated per user and per file (FR-024); persists across sessions on the same browser (FR-027, see research R8); a deleted file's entry is ignored/pruned (edge case).

## Entity: SectionOutlineEntry (extended)

Editor outline entry (`asciidoc-outline.ts`), derived from `computeHeadingLevels`. Extended so the outline tracks cross-document state (R11).

| Field | Type | Notes |
|---|---|---|
| `level` | number | effective level = raw + `:leveloffset:` + inherited offset (existing; now refreshed on include/main-file change) |
| `title` | string | NEW behavior: `{attr}` references resolved against the file's ResolvedAttributeScope (was raw) |
| `line` | number | heading line (existing) |
| `from` | number | document offset (existing) |
| `inactive` | boolean | NEW (derived) — heading sits in an inactive ConditionalRegion ⇒ excluded or marked (FR-032 consistency) |

**Rules**: single authority remains `computeHeadingLevels`; outline, heading highlight, and section folding all derive from it. Refresh is driven by `refreshHeadingLevelsEffect` on doc edit, include-structure change, or main-file change (FR-007a/FR-007b).

## Relationships

- A **project** has one optional **main file** (`mainFileNodeId`) → root of the include tree.
- The include tree (root + **IncludeEdges**) yields, per file, a **ResolvedAttributeScope** (origin = inherited/standalone).
- **AttributeDefinitions** (entries + inline-set + seeds) feed the scope in reading order.
- **ConditionalRegions** and caption/numbering/xref behavior are evaluated against the scope.
- **PerFileCursorMemory** is independent of the resolution model (separate concern, US7).
