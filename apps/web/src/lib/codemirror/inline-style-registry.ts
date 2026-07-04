/**
 * Extensible registry of known inline styles / roles for editor emphasis.
 *
 * AsciiDoc role spans `[.role]#text#` carry an arbitrary CSS role name. The grammar tokenises EVERY
 * role span the same way, so the editor always highlights one generically. On top of that,
 * a small set of well-known roles (the built-in AsciiDoc inline styles plus the colour/semantic roles
 * we ship) earn a DISTINCT emphasis so they read differently from an arbitrary custom role. That
 * known-vs-unknown decision lives here, decoupled from the grammar, because it is presentation policy
 * rather than syntax.
 *
 * The set is extensible WITHOUT a logic change: call {@link registerInlineStyle} to mark a custom role
 * as known (it then earns the distinct emphasis), or {@link isKnownInlineStyle} to query. Unknown roles
 * remain valid role spans — they are still highlighted generically, just without the distinct emphasis.
 */
import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder, type Extension } from '@codemirror/state';

/**
 * Built-in inline styles / roles shipped with the editor. These are the roles AsciiDoc's default
 * stylesheet (and our preview stylesheet) gives a visual treatment, so the editor mirrors them with a
 * distinct emphasis. Frozen so the built-in set can never be mutated in place (extend via `custom`).
 */
export const BUILT_IN_INLINE_STYLES: ReadonlySet<string> = new Set([
  // AsciiDoc built-in text-decoration / sizing roles.
  'lead',
  'underline',
  'line-through',
  'big',
  'small',
  'nowrap',
  'pre-wrap',
  'nobreak',
  // AsciiDoc built-in foreground colour roles.
  'aqua',
  'black',
  'blue',
  'fuchsia',
  'gray',
  'green',
  'lime',
  'maroon',
  'navy',
  'olive',
  'purple',
  'red',
  'silver',
  'teal',
  'white',
  'yellow',
]);

/** Custom roles registered at runtime; queried alongside {@link BUILT_IN_INLINE_STYLES} by {@link isKnownInlineStyle}. */
const customInlineStyles = new Set<string>();

/**
 * Register a custom inline-style / role name as KNOWN so it earns the distinct editor emphasis. Adding
 * a name requires no change to highlighting logic — the role-span decoration consults the registry, so
 * a freshly registered role is treated exactly like a built-in one. Names are matched case-insensitively
 * (AsciiDoc role names are case-sensitive in CSS, but we normalise for lookup robustness).
 *
 * @param name - The role name to register (e.g. `'callout'`). Blank/whitespace names are ignored.
 */
export function registerInlineStyle(name: string): void {
  const normalized = name.trim().toLowerCase();
  if (normalized.length > 0) customInlineStyles.add(normalized);
}

/**
 * Report whether `role` is a known inline style — either a built-in or a custom-registered one. Known
 * roles earn a distinct emphasis in the editor; any OTHER (unknown) role is still a valid role span and
 * is highlighted generically. Matched case-insensitively.
 *
 * @param role - The role name from a `[.role]#…#` span.
 * @returns `true` when the role is built-in or has been registered.
 */
export function isKnownInlineStyle(role: string): boolean {
  const normalized = role.trim().toLowerCase();
  return BUILT_IN_INLINE_STYLES.has(normalized) || customInlineStyles.has(normalized);
}

/**
 * Remove all custom-registered roles, restoring the registry to only its built-in set. Intended for
 * tests that register a role and need isolation; not part of the production highlighting path.
 */
export function resetCustomInlineStyles(): void {
  customInlineStyles.clear();
}

/**
 * CSS class flagging a role span `[.role]#…#` whose role is KNOWN to the registry. Layered on top of
 * the grammar's generic role-span highlight so a known role reads with a distinct emphasis.
 */
export const KNOWN_INLINE_STYLE_CLASS = 'cm-ad-inline-style-known';

// `[` `.role(.role)*` `]` `##body##` | `#body#`. Captures the role list and the body so the decoration
// can mark the whole construct when ANY of its roles is known. Mirrors the grammar's `roleSpanMark`.
const ROLE_SPAN_RE = /\[((?:\.[A-Za-z0-9][\w-]*)+)\](##[^#\n]+##|#[^#\n]+#)/g;

/** A role-span range whose role is known to the registry (earns the distinct emphasis). */
export interface KnownRoleSpanMark {
  /** Document offset of the opening `[`. */
  from: number;
  /** Document offset just past the closing `#`. */
  to: number;
}

/**
 * Compute the ranges of every role span `[.role]#…#` that carries at least one KNOWN role (built-in or
 * registered). Unknown-only role spans are intentionally excluded — they remain highlighted generically
 * by the grammar; only known roles earn this additional distinct emphasis.
 *
 * @param documentText - The open file's full text.
 * @returns The known-role-span ranges in document order.
 */
export function computeKnownRoleSpanMarks(documentText: string): KnownRoleSpanMark[] {
  const marks: KnownRoleSpanMark[] = [];
  for (const match of documentText.matchAll(ROLE_SPAN_RE)) {
    const roles = match[1].slice(1).split('.'); // drop the leading '.' then split the segments
    if (!roles.some((role) => isKnownInlineStyle(role))) continue;
    const from = match.index ?? 0;
    marks.push({ from, to: from + match[0].length });
  }
  return marks;
}

const knownRoleSpanMark = Decoration.mark({ class: KNOWN_INLINE_STYLE_CLASS });

function buildRoleSpanDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const mark of computeKnownRoleSpanMarks(view.state.doc.toString())) {
    builder.add(mark.from, mark.to, knownRoleSpanMark);
  }
  return builder.finish();
}

/**
 * CM6 extension giving role spans `[.role]#…#` with a KNOWN role a distinct emphasis. The
 * grammar already highlights every role span generically; this decoration layers {@link
 * KNOWN_INLINE_STYLE_CLASS} only on those whose role the registry knows, so registered/built-in roles
 * read distinctly. Registering a new role (see {@link registerInlineStyle}) needs no change here —
 * the decoration recomputes from the registry on every relevant update.
 *
 * @returns The known-role-span highlight view plugin.
 */
export function asciidocInlineStyleEmphasis(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildRoleSpanDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildRoleSpanDecorations(update.view);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}
