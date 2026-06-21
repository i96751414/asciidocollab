# Contract: Outline Assembly (module API)

**Feature**: 032 | Internal TypeScript module contracts (no network API).

---

## `assembleIncludes` — refactor (additive source map)

`apps/web/src/workers/assemble-includes.ts`

```text
assembleIncludes(
  rootPath: string,
  readFile: (path: string) => string | null,
  options?: {
    maxDepth?: number;
    maxExpansions?: number;
    seedAttributes?: Record<string, string>;
    showIncludes?: boolean;
    withSourceMap?: boolean;     // NEW
  }
): {
  content: string;
  unresolved: UnresolvedInclude[];
  sourceMap?: IncludeSourceMap;  // NEW — present iff options.withSourceMap === true
}
```

**Guarantees**
- `withSourceMap` omitted/false ⇒ `content` and `unresolved` are **byte-for-byte identical** to today, and `sourceMap` is undefined. (Regression test MUST assert this against existing fixtures.)
- When present, `sourceMap.lineToSource.length === content.split('\n').length`, and `lineToSource[i]` gives the origin `{ fileId, path, sourceLine }` of assembled line `i+1`.
- Sandbox confinement, conditional gating, partial includes, leveloffset, and cycle/limit guards are unchanged.

---

## `assembleOutline` — new

`apps/web/src/lib/outline/assemble-outline.ts`

```text
assembleOutline(input: {
  rootPath: string | null;            // main document; null ⇒ current-file fallback
  openFilePath: string;
  openFileId: string;
  readFile: (path: string) => string | null;   // from useProjectSymbolIndex
  fileIdForPath: (path: string) => string;
  resolvedScope?: ResolvedScope;      // attribute scope for {attr} in titles
  scopePreference: 'full' | 'current';
}): AssembledOutline
```

**Behavior**
- Resolves **effective scope** per data-model §2 state table (fallbacks for no-main-doc / unreachable open file).
- `full`: `assembleIncludes(rootPath, readFile, { withSourceMap: true, seedAttributes })` → `extractHeadings(assembledText, resolvedScope)` → attach `{ sourceFileId, sourcePath, sourceLine, isOpenFile }` from the source map.
- `current`: run existing single-file extraction on `openFilePath` content; provenance = open file; identical to today's behavior.
- Excludes inactive-conditional / discrete / float headings (existing rule). Carries `unresolved` for graceful degradation (FR-014).
- MUST terminate on cyclic includes (delegated to `assembleIncludes` guards).

---

## `mapOutlinePresence` — new

`apps/web/src/lib/outline/outline-presence.ts`

```text
mapOutlinePresence(
  entries: OutlineEntry[],
  peers: Array<{ presence: ParticipantPresence; openFileNodeId: string; cursorLine: number | null }>,
  lineCountOf: (fileId: string) => number,
): Map<string /* `${sourceFileId}:${sourceLine}` */, ParticipantPresence[]>
```

**Behavior**
- For each peer: clamp `cursorLine` to `[1, lineCountOf(openFileNodeId)]`; `null`/out-of-range ⇒ skip (FR-024, Principle IX).
- Attribute to the entry with `sourceFileId === openFileNodeId` and greatest `sourceLine ≤ cursorLine`.
- Dedup per `userId`; **never** include the local user (caller passes others-only, reusing `collectByFile`).
- Entries with no peers absent from the map.

**Test vectors**: peer in mid-section → nearest preceding heading; peer above first heading → skipped; peer line > lineCount → clamped then mapped; two peers same entry → both listed; same user twice → once.
