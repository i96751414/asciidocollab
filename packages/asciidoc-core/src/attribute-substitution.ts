/**
 * A `{name}` attribute reference in a macro target / value. Names are case-insensitive.
 * The negative lookbehind excludes `\{name}` — backslash escapes the reference so
 * Asciidoctor emits a literal `{name}` instead of the value (AsciiDoc escape semantics).
 */
const ATTR_REF_RE = /(?<!\\)\{([A-Za-z0-9][\w-]*)\}/g;

/**
 * Replace `{name}` attribute references with their values, resolving nested references up to
 * `maxDepth` passes (a self-referential value therefore cannot loop forever). Names are
 * case-insensitive (Asciidoctor downcases them); unknown references are left verbatim so the
 * target simply fails to resolve rather than silently changing.
 *
 * This is the single authority for `{ref}` expansion, shared by the include/image path resolvers
 * (web + domain) and `ifeval` operand resolution so the rule cannot drift between sites.
 *
 * @param target - The raw macro target / value.
 * @param attributes - Attribute name (lowercase) → value map.
 * @param maxDepth - Maximum expansion passes (default 10).
 * @returns The target with all known attribute references expanded.
 */
export function substitutePathAttributes(
  target: string,
  attributes: ReadonlyMap<string, string>,
  maxDepth = 10,
): string {
  let result = target;
  for (let depth = 0; depth < maxDepth; depth += 1) {
    let changed = false;
    result = result.replaceAll(ATTR_REF_RE, (whole, name: string) => {
      const value = attributes.get(name.toLowerCase());
      if (value === undefined) return whole;
      changed = true;
      return value;
    });
    if (!changed) break;
  }
  return result;
}
