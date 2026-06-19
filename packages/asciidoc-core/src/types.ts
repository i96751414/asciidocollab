/**
 * A restricted, non-`eval` conditional expression parsed from an `ifdef`/`ifndef`/`ifeval`
 * preprocessor directive (Constitution IX — no `eval`/`Function`). Evaluated against a
 * resolved attribute scope to decide whether the guarded content (or include) is active.
 */
export interface ConditionalExpr {
  /** The directive kind. */
  kind: 'ifdef' | 'ifndef' | 'ifeval';
  /** Attribute names for `ifdef`/`ifndef` (supports `,`/`+` operators); empty for `ifeval`. */
  attrs: string[];
  /**
   * How a multi-attribute `ifdef`/`ifndef` list combines: `'or'` (the `,` separator — any) or
   * `'and'` (the `+` separator — all). Absent for a single attribute or for `ifeval`. AsciiDoc does
   * not allow mixing the two separators in one directive, so a single combinator applies.
   */
  op?: 'and' | 'or';
  /** Restricted `ifeval` comparison (`lhs op rhs`), or `null` for `ifdef`/`ifndef`. */
  expr: { lhs: string; op: string; rhs: string } | null;
}
