import type { ConditionalExpr } from './types';
import { substitutePathAttributes } from './attribute-substitution';

/**
 * The single authority for AsciiDoc conditional preprocessor regions
 * (`ifdef`/`ifndef`/`ifeval` … `endif`) shared by every consumer that must gate content the same
 * way: the preview include assembler, the editor's `effectiveLevelOffset`/attribute-inheritance
 * walks, the section outline, the conditional dimming, and the server-side domain extraction.
 * Keeping the region GRAMMAR (which lines open/close a region), the EVALUATION (no `eval`;
 * Constitution IX), and the region STACK in one place is what stops those consumers from drifting
 * apart — a heading shown in the preview but dropped from the outline, or an include the assembler
 * keeps but the offset walk gates off.
 */

// A conditional preprocessor directive line: `ifdef::names[…]`, `ifndef::names[…]`, or
// `ifeval::[expr]`. Group 1 = kind, group 2 = attribute-name list (ifdef/ifndef), group 3 = the raw
// bracket body. NOTE: this matches BOTH the empty-bracket region form (`ifdef::name[]`) and the
// single-line content form (`ifdef::name[text]`); only {@link CONDITIONAL_REGION_OPENER_RE} decides
// which lines actually open a region.
const CONDITIONAL_RE = /^(ifdef|ifndef|ifeval)::([^[\]]*)?\[(.*)\]$/;
// ifdef/ifndef attribute lists use `,` for OR and `+` for AND.
const COND_OR_SEPARATOR = ',';
const COND_AND_SEPARATOR = '+';
// The restricted, non-`eval` `ifeval` comparison grammar: `lhs op rhs` with a fixed operator set.
const IFEVAL_COMPARISON_RE = /^(.*?)(==|!=|<=|>=|<|>)(.*)$/;

// A whole-line `endif::[]` (optionally `endif::name[]`) region closer.
export const ENDIF_LINE_RE = /^[ \t]*endif::[^[\]]*\[\]\s*$/;
// A conditional REGION opener: `ifeval::[expr]` (always a region), or `ifdef`/`ifndef` with EMPTY
// brackets. The single-line content form `ifdef::name[text]` (non-empty brackets) is NOT a region —
// it carries its conditional content inline and has no matching `endif`, so it must never open a
// region that would silently gate off every later line/include.
export const CONDITIONAL_REGION_OPENER_RE =
  /^[ \t]*(?:ifeval::\[.*\]|(?:ifdef|ifndef)::[^[\]\n]+\[\])\s*$/;
// A whole-line include directive (anchored): optional leading whitespace, `include::target[attrs]`,
// then only trailing whitespace — an `include::` must be the entire line to be a directive. Group 1 =
// target, group 2 = attribute list.
export const INCLUDE_LINE_RE = /^[ \t]*include::([^[\n]+)\[([^\]\n]*)\]\s*$/;

/**
 * Parse a single conditional preprocessor directive line into a structured, non-`eval` expression
 * (Constitution IX). Recognizes `ifdef::names[]`, `ifndef::names[]`, and `ifeval::[lhs op rhs]`;
 * `endif::[]` and any non-directive line return `null` (`endif` is a region closer, not an opener).
 *
 * `ifdef`/`ifndef` attribute names are downcased. Asciidoctor selects the `,` (OR) delimiter BEFORE
 * `+` (AND) when both appear, then splits on the chosen delimiter only — so `a+b,c` is `[a+b] OR [c]`,
 * not AND over a, b, c.
 *
 * @param line - A single line of content (leading/trailing whitespace tolerated).
 * @returns The parsed {@link ConditionalExpr}, or `null` when the line is not a conditional directive.
 */
export function parseConditional(line: string): ConditionalExpr | null {
  const match = CONDITIONAL_RE.exec(line.trim());
  if (match === null) return null;
  if (match[1] === 'ifeval') {
    const comparison = IFEVAL_COMPARISON_RE.exec(match[3].trim());
    if (comparison === null) return null;
    return { kind: 'ifeval', attrs: [], expr: { lhs: comparison[1].trim(), op: comparison[2], rhs: comparison[3].trim() } };
  }
  const kind = match[1] === 'ifndef' ? 'ifndef' : 'ifdef';
  const list = match[2] ?? '';
  // Comma (OR) binds before plus (AND); split on the single chosen separator. A token that still
  // contains the other separator simply never matches a real attribute name (names cannot contain
  // `,`/`+`), which is the Asciidoctor outcome. Neither separator ⇒ a single attribute.
  const separator = list.includes(COND_OR_SEPARATOR)
    ? COND_OR_SEPARATOR
    : (list.includes(COND_AND_SEPARATOR) ? COND_AND_SEPARATOR : null);
  const op = separator === COND_OR_SEPARATOR ? 'or' : (separator === COND_AND_SEPARATOR ? 'and' : undefined);
  const names = (separator === null ? [list] : list.split(separator))
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0);
  return op === undefined ? { kind, attrs: names, expr: null } : { kind, attrs: names, op, expr: null };
}

/**
 * Evaluate a parsed conditional against a resolved attribute scope, WITHOUT `eval`/`Function`
 * (Constitution IX). `ifdef`/`ifndef` test attribute presence (an empty-string value still counts
 * as defined); a `,`-list is OR and a `+`-list is AND (negated for `ifndef`). `ifeval` resolves
 * `{attr}` references in both operands, then compares them numerically when both look numeric, else
 * as strings, over the fixed operator set (`==`, `!=`, `<`, `<=`, `>`, `>=`).
 *
 * @param expr - The parsed conditional expression.
 * @param scope - The resolved attribute values (lowercase name → value) in effect at the directive.
 * @returns Whether the guarded content/include is active.
 */
export function evaluateConditional(expr: ConditionalExpr, scope: ReadonlyMap<string, string>): boolean {
  if (expr.kind === 'ifeval') {
    if (expr.expr === null) return false;
    const lhs = substitutePathAttributes(expr.expr.lhs, scope);
    const rhs = substitutePathAttributes(expr.expr.rhs, scope);
    return compareIfeval(lhs, expr.expr.op, rhs);
  }
  const defined = (name: string) => scope.has(name);
  const present = expr.op === 'and' ? expr.attrs.every(defined) : expr.attrs.some(defined);
  return expr.kind === 'ifdef' ? present : !present;
}

/**
 * Compare two resolved `ifeval` operands over the fixed operator set, WITHOUT `eval` (Constitution
 * IX): equality keeps the typed values (a quoted "2" is not the numeric 2); ordering compares
 * NUMERICALLY only when BOTH operands are numbers, otherwise as STRINGS — so `{x} < beta` with `x=3`
 * compares "3" < "beta" rather than coercing the string to NaN. Returns false for an unknown operator.
 */
function compareIfeval(lhs: string, op: string, rhs: string): boolean {
  const a = ifevalOperand(lhs);
  const b = ifevalOperand(rhs);
  if (op === '==') return a === b;
  if (op === '!=') return a !== b;
  const bothNumeric = typeof a === 'number' && typeof b === 'number';
  const x: string | number = bothNumeric ? a : String(a);
  const y: string | number = bothNumeric ? b : String(b);
  switch (op) {
    case '<': {
      return x < y;
    }
    case '<=': {
      return x <= y;
    }
    case '>': {
      return x > y;
    }
    case '>=': {
      return x >= y;
    }
    default: {
      return false;
    }
  }
}

/**
 * An ifeval operand's typed value. A quoted operand is ALWAYS a string (Asciidoctor's quoted-is-a-
 * string rule), so `"2"` is the string "2"; an unquoted operand that parses as a finite number is a
 * number, so `2` is the integer 2 — and `"2" == 2` is therefore false. Everything else is its trimmed
 * text. Typing per operand (instead of unquoting both then deciding) preserves the string-vs-number
 * distinction the comparison depends on.
 */
function ifevalOperand(value: string): string | number {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && (trimmed[0] === '"' || trimmed[0] === "'") && trimmed.at(-1) === trimmed[0]) {
    return trimmed.slice(1, -1);
  }
  const numeric = Number(trimmed);
  return trimmed !== '' && !Number.isNaN(numeric) ? numeric : trimmed;
}

/**
 * Whether a line is a conditional region directive, and which kind:
 *  - `'endif'`  — a region closer (`endif::[]`).
 *  - `'opener'` — a region opener (`ifeval::[expr]`, or empty-bracket `ifdef`/`ifndef`). The
 *    single-line content form `ifdef::name[text]` is deliberately NOT an opener — it has no matching
 *    `endif`, so opening a region for it would silently gate off everything below it.
 *  - `null`     — any other line.
 *
 * This is the one place the region grammar is decided, so every consumer agrees on which lines move
 * the region stack.
 */
export function conditionalLineKind(line: string): 'endif' | 'opener' | null {
  if (ENDIF_LINE_RE.test(line)) return 'endif';
  if (CONDITIONAL_REGION_OPENER_RE.test(line)) return 'opener';
  return null;
}

/**
 * A stack of open conditional regions, each frame recording whether its branch is active. Shared by
 * every consumer so they gate content identically.
 *
 * The active state is queried as {@link ConditionalRegionStack.isActive} — true only when EVERY open
 * region is active, so a single inactive ancestor suffices to gate content off.
 */
export class ConditionalRegionStack {
  private readonly frames: boolean[] = [];

  /** Whether the current position is active (every enclosing region active; vacuously true at top level). */
  isActive(): boolean {
    return this.frames.every(Boolean);
  }

  /** Pop the innermost region. A stray closer on an empty stack is a no-op (unbalanced `endif` tolerated). */
  close(): void {
    this.frames.pop();
  }

  /**
   * Open exactly ONE region for an opener line, ALWAYS pushing a frame so it balances its matching
   * `endif` — even when the directive is empty/unparseable (e.g. `ifeval::[]`), which pushes an
   * INACTIVE frame rather than no frame. Pushing nothing on a parse failure is the desync bug: the
   * matching `endif` would then pop an enclosing region instead. The frame is active only when the
   * enclosing context is active AND the parsed condition evaluates true against `scope`.
   *
   * @param line - The opener line (must satisfy {@link conditionalLineKind} === 'opener').
   * @param scope - The resolved attribute values to evaluate the condition against.
   */
  open(line: string, scope: ReadonlyMap<string, string>): void {
    const expr = parseConditional(line);
    this.frames.push(this.isActive() && expr !== null && evaluateConditional(expr, scope));
  }

  /**
   * Drive one line through the stack: pop on an `endif`, push on an opener, ignore anything else.
   * Returns the line's {@link conditionalLineKind} so a caller that emits or annotates lines can
   * branch on whether the line was a (consumed) directive.
   *
   * @param line - One physical line of content.
   * @param scope - The attribute scope used to evaluate an opener.
   * @returns The line kind (`'endif'` / `'opener'` / `null`).
   */
  applyLine(line: string, scope: ReadonlyMap<string, string>): 'endif' | 'opener' | null {
    const kind = conditionalLineKind(line);
    if (kind === 'endif') this.close();
    else if (kind === 'opener') this.open(line, scope);
    return kind;
  }
}
