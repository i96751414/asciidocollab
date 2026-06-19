# Contract: Cross-Document Resolution Model

Pure, filesystem-free functions in `apps/web/src/lib/asciidoc/extraction.ts` (and mirrored in `packages/domain/src/services/asciidoc-extraction.ts`). All are deterministic and unit-tested with in-memory `readContent`/`resolveInclude` fakes (Constitution III).

## Existing (reused)

```ts
buildIncludeGraphWithInheritance(
  rootFileId: string,
  readContent: (fileId: string) => string | null,
  resolveInclude: (fromFileId: string, target: string) => string | null,
): { tree: DocumentTree; inheritedAttributes: Map<string, ReadonlyMap<string,string>> }

inheritedLevelOffset(tree: DocumentTree, fileId: string): number
extractAttributeDefinitions(content: string): Array<{ name: string; value: string }>
```

## New / extended (this feature)

```ts
// Resolved attribute scope for a file, given the project main file (root). When rootFileId is
// null/unset → standalone scope (own attributes only). Honors first-include-point inheritance,
// :!name: unset, inline {set:...}, wrapping (\-continued) values, and locked precedence.
resolveAttributeScope(args: {
  rootFileId: string | null;
  fileId: string;
  readContent: (fileId: string) => string | null;
  resolveInclude: (from: string, target: string) => string | null;
}): ResolvedAttributeScope;

// Document-order events now include inline {set:} and unset, with wrapped values joined.
// (extends the private documentOrderEvents)
type DocumentOrderEvent =
  | { kind: 'attribute'; pos: number; name: string; value: string | null /* null = unset */; locked?: boolean }
  | { kind: 'inline-set'; pos: number; name: string; value: string | null }
  | { kind: 'include'; pos: number; match: RegExpMatchArray };

// Parse partial-include selectors from an include directive's attribute list.
parseIncludeTags(attributes: string): string[] | null;     // null = no tag filter
parseIncludeLines(attributes: string): Array<[number, number | null]> | null;

// Parse a conditional directive line into a structured, non-eval expression (or null).
parseConditional(line: string): ConditionalExpr | null;
// Evaluate a parsed conditional against a resolved scope. NO eval / Function.
evaluateConditional(expr: ConditionalExpr, scope: ReadonlyMap<string,string>): boolean;
```

### Behavioral guarantees (tested)

- **First-include inheritance**: a file reached by multiple paths keeps the scope from its first visit (FR-002a). Verified by a fixture where the same child is included twice with differing surrounding attributes.
- **Unset across boundary**: `:!name:` in a parent before an include removes `name` for the child (FR-005).
- **Inline `{set:}`**: affects references after its position, including across includes (FR-040); `{set:name!}` unsets (FR-040).
- **Wrapping values**: `:k: a \` + newline + `b` resolves to the joined value (FR-041).
- **Precedence / locked**: a locked attribute is not overridden by a later in-document definition or inline set (FR-004, FR-043).
- **Cycle/depth**: recursive/duplicate includes terminate (existing guard; FR-007).
- **Standalone**: `rootFileId = null` ⇒ only the file's own attributes resolve (FR-002b).
- **Parity**: web and domain copies produce identical results on the shared fixture corpus (FR-006, R9).
