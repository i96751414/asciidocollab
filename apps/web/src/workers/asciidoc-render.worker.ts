import Asciidoctor from 'asciidoctor';
import hljs from 'highlight.js/lib/common';
import { assembleIncludes } from './assemble-includes';
import { resolveAttributeScope } from '../lib/asciidoc/extraction';
import { RENDER_INTRINSIC_ATTRIBUTES } from '../lib/asciidoc/render-intrinsics';
import { resolveSandboxedPath } from '../lib/asciidoc/sandbox-path';

interface RenderRequest {
  requestId: number;
  content: string;
  /** Base path Asciidoctor prepends to relative image targets (the project's image endpoint). */
  imagesDir?: string;
  /**
   * When set together with {@link RenderRequest.files}, the worker assembles the include tree rooted
   * at this project-relative main-file path (sandbox-confined via `resolveSandboxedPath`) and
   * renders the assembled document instead of `content`. Absent ⇒ render `content` as-is.
   */
  mainPath?: string;
  /** Project-relative path → content map supplying the include assembly. */
  files?: Record<string, string>;
  /**
   * Project main-file path (root) for cross-document attribute resolution. The open
   * file's `{name}` references resolve to the value in effect at its first include-point under this
   * root. `null`/absent ⇒ standalone resolution (the file's own attributes only).
   */
  rootFileId?: string | null;
  /** The previewed open file's path — the scope whose inherited attributes are seeded. */
  openFileId?: string;
  /** When false (default), the assembler hides included bodies and emits placeholders. */
  showIncludes?: boolean;
}

// Asciidoctor convention: a value ending in `@` is an overridable "soft" default — an in-document
// attribute entry of the same name may still override it. We mark every seeded inherited-scope value
// this way so a file's own definitions win, matching the resolution model's precedence.
const SOFT_DEFAULT_SUFFIX = '@';

/**
 * Build the attribute state in effect at the START of the assembled document — the intrinsics
 * Asciidoctor injects ({@link RENDER_INTRINSIC_ATTRIBUTES}) plus the API attributes the worker passes
 * to `load()` — so the include assembler's conditional gating and include-target `{attr}` substitution
 * match what Asciidoctor will resolve (Finding#1). The API attributes carry the overridable soft-default
 * `@` suffix; the assembler gives in-document entries document-order precedence over seeds on its own,
 * so the marker is stripped to recover the raw value (appending then stripping one `@` is an exact
 * round-trip).
 *
 * @param apiAttributes - The attribute object handed to `proc.load` (`showtitle`/`imagesdir`/scope).
 * @returns The seed map for {@link assembleIncludes}.
 */
function buildAssemblerSeed(apiAttributes: Record<string, string>): Map<string, string> {
  const seed = new Map(RENDER_INTRINSIC_ATTRIBUTES);
  for (const [name, value] of Object.entries(apiAttributes)) {
    seed.set(name, value.endsWith(SOFT_DEFAULT_SUFFIX) ? value.slice(0, -SOFT_DEFAULT_SUFFIX.length) : value);
  }
  return seed;
}

/**
 * Build the resolved inherited attribute scope for the open file, anchored to the project main file,
 * as Asciidoctor seed attributes. Each value is marked as an overridable soft-default (trailing `@`)
 * so an in-document entry can still override it. Returns an empty object when there is no root
 * (standalone) or the inputs are missing — in which case rendering falls back to current behavior.
 *
 * File ids here are project-relative paths: `readContent` reads from the `files` map and
 * `resolveInclude` confines every (user-controlled) target through {@link resolveSandboxedPath}
 * (Constitution IX) and only resolves to a path actually present in the snapshot.
 */
function seedAttributesFromScope(
  rootFileId: string | null | undefined,
  openFileId: string | undefined,
  files: Record<string, string> | undefined,
): Record<string, string> {
  if (rootFileId === undefined || rootFileId === null || openFileId === undefined || files === undefined) {
    return {};
  }
  const readContent = (path: string): string | null => files[path] ?? null;
  const resolveInclude = (from: string, target: string): string | null => {
    const resolved = resolveSandboxedPath(from, target);
    return resolved.ok && files[resolved.path] !== undefined ? resolved.path : null;
  };
  // Seed the render intrinsics into the GATING scope so a conditional include resolves the same way
  // the assembler gates it (e.g. `ifdef::backend-html5[]` active) — the inherited values themselves
  // are unaffected by the seed (#4).
  const scope = resolveAttributeScope({ rootFileId, fileId: openFileId, readContent, resolveInclude, seedAttributes: RENDER_INTRINSIC_ATTRIBUTES });
  // The root file's own header attributes are parsed by Asciidoctor from the rendered source, so only
  // a genuinely inherited scope needs seeding. Seed nothing for the root (origin 'root') / standalone.
  if (scope.origin !== 'inherited') return {};
  const seeded: Record<string, string> = {};
  // Seed the WHOLE resolved scope with no allow-list filtering, so the full inherited family flows
  // through as native document attributes: `idprefix`/`idseparator` (auto-ID generation),
  // `xrefstyle` (cross-reference text), and the caption/label/signifier family — `table-caption`,
  // `figure-caption`, `example-caption`, admonition `*-caption`, `appendix-caption`, `toc-title`,
  // `chapter-signifier`, `part-signifier`, `section-refsig`, `version-label`, `last-update-label`
  // — plus `sectnums`/`toc`/`leveloffset` etc. The resolution model already enforces AsciiDoc
  // unset/empty semantics: an unset attribute (`:name!:`) is deleted from `scope.values` and so is
  // simply never seeded (label removed), while an EMPTY value (`:name:`) is a real entry kept as ''.
  // The `@` soft-default suffix on an empty value yields the literal '@', which Asciidoctor treats
  // exactly like an empty in-document caption (blank prefix, auto-number retained) — i.e. the suffix
  // does NOT corrupt empty-value semantics.
  for (const [name, value] of scope.values) {
    seeded[name] = value + SOFT_DEFAULT_SUFFIX;
  }
  return seeded;
}

/** Reverses the minimal HTML escaping Asciidoctor applies inside code blocks. */
function unescapeHtml(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');
}

// Matches the <pre class="highlight"><code class="language-X" ...>...</code></pre>
// markup Asciidoctor emits for a source block that declares a language. The code
// body is HTML-escaped, so the only literal "</code>" is the real closing tag,
// which makes the lazy capture safe.
const SOURCE_BLOCK_RE =
  /<pre class="highlight"><code class="language-([\w+#-]+)"([^>]*)>([\s\S]*?)<\/code><\/pre>/g;

// Asciidoctor renders checklist items as a leading unicode glyph in the paragraph text
// (&#10003; "✓" when checked, &#10063; "❏" otherwise) — emitted only as these numeric
// entities, so matching them is precise and never touches ordinary prose. We swap each for
// a stateful <span>, letting the preview stylesheets render a real checkbox (brand style) or
// reproduce the original glyph (faithful Asciidoctor style) instead of the bare character.
function styleChecklistMarkers(html: string): string {
  return html
    .replaceAll(
      '<p>&#10003; ',
      '<p class="checklist-item"><span class="checklist-box checklist-box--checked" aria-hidden="true"></span>',
    )
    .replaceAll(
      '<p>&#10063; ',
      '<p class="checklist-item"><span class="checklist-box" aria-hidden="true"></span>',
    );
}

/**
 * Applies highlight.js syntax highlighting to every source block in the rendered
 * HTML. Runs in the worker (string-only, no DOM) so the main thread stays free,
 * and emits hljs token spans (.hljs-*) that the preview stylesheet themes.
 */
function highlightCodeBlocks(html: string): string {
  return html.replaceAll(SOURCE_BLOCK_RE, (match, lang: string, attributes: string, body: string) => {
    const code = unescapeHtml(body);
    try {
      const result = hljs.getLanguage(lang)
        ? hljs.highlight(code, { language: lang })
        : hljs.highlightAuto(code);
      return `<pre class="highlight hljs"><code class="language-${lang}"${attributes}>${result.value}</code></pre>`;
    } catch {
      // Unknown/unsupported language — keep the original escaped markup.
      return match;
    }
  });
}

interface RenderResult {
  requestId: number;
  ok: boolean;
  html: string | null;
  error: string | null;
  /**
   * True when the rendered document contains STEM (math) output that is in effect, meaning the
   * resolved `:stem:` attribute is set AND Asciidoctor emitted stem markup carrying its delimiters.
   * The worker never renders math itself (client-side); this flag lets the
   * preview lazy-load MathJax only when there is math to typeset. Absent/`false` means no MathJax
   * load, so stem delimiters written where `:stem:` is not in effect stay as literal text.
   */
  mathPresent?: boolean;
}

// A STEM BLOCK renders as `<div class="stemblock">` — a precise, stem-only signal in the output.
const STEM_BLOCK_OUTPUT_RE = /class="stemblock"/;
// An INLINE stem is authored with one of these macros. Inline stem leaves NO distinctive wrapper in
// the output (only the ambiguous `\$…\$` / `\(…\)` / `\[…\]` delimiters, which Asciidoctor also emits
// for escaped text and backslash/regex content in code), so we detect it from the SOURCE macro.
const STEM_INLINE_MACRO_RE = /(?:stem|latexmath|asciimath):\[/;

/**
 * Whether the document carries STEM math the client must typeset. STEM must be in effect AND real
 * stem markup must be present. STEM is in effect when the resolved `:stem:` value is set (the empty
 * string for the bare AsciiMath default, or a notation such as `latexmath`); an `undefined`/`null`
 * value means the author opted out with `:stem!:`, so even real markup is left as literal text.
 * Real markup is a `stemblock` wrapper in the output OR an inline `stem:`/`latexmath:`/
 * `asciimath:` macro in the source. This deliberately does NOT key on the bare `\(`/`\[`/`\$`
 * output delimiters, because Asciidoctor also emits those for escaped text and for backslash or
 * regex content inside code (such as a `/\[0-9\]+/` regex in a listing block); keying on them would
 * make the client typeset, and so corrupt, ordinary code or prose that contains no math at all.
 *
 * @param stemAttribute - The resolved `:stem:` document attribute (`''`/`'latexmath'`/`undefined`).
 * @param source - The rendered AsciiDoc source (assembled), scanned for inline stem macros.
 * @param html - The converted HTML, scanned for the stem-block wrapper.
 * @returns True only when STEM is in effect AND real stem markup is present.
 */
function detectMathPresent(stemAttribute: unknown, source: string, html: string): boolean {
  if (stemAttribute === undefined || stemAttribute === null) return false;
  return STEM_BLOCK_OUTPUT_RE.test(html) || STEM_INLINE_MACRO_RE.test(source);
}

let processor: ReturnType<typeof Asciidoctor> | null = null;

function getProcessor(): ReturnType<typeof Asciidoctor> {
  if (processor) return processor;
  processor = Asciidoctor();
  return processor;
}

onmessage = function (event: MessageEvent<RenderRequest>) {
  const { requestId, content, imagesDir, mainPath, files, rootFileId, openFileId, showIncludes } = event.data;
  try {
    const proc = getProcessor();
    // `showtitle` renders the document title in embedded output. `imagesdir` is the base path
    // prepended to relative image targets so `image::diagram.png[]` resolves to the project's
    // asset endpoint; absolute-URL targets are left untouched by Asciidoctor.
    //
    // Section numbering & TOC across includes: `sectnums`/`sectnumlevels`
    // and `toc`/`toclevels` are NOT special-cased here — they ride through the full inherited-scope
    // seeding below (`seedAttributesFromScope`, no allow-list filtering). Combined with the assembler's
    // absolute `:leveloffset:` set/restore entries, Asciidoctor natively numbers sections and builds the
    // TOC over the ASSEMBLED, offset-adjusted structure: two `leveloffset=+1` chapters number
    // continuously (1, 2) and the TOC lists them at their effective (offset) levels. Embedded output
    // (`showtitle`, no header/footer) still emits the `<div id="toc">` block when `toc` is set as a
    // document attribute, so no placement fix is needed.
    // The open file's cross-document attribute scope — the values it inherits at its
    // first include-point under the project main file (including a resolved `:leveloffset:`), so a
    // `{name}` defined only in a parent resolves here — is seeded FIRST as overridable soft-defaults.
    // Host render controls are applied AFTER it so they win: `showtitle` renders the title in embedded
    // output, and `imagesdir` is the asset base the preview host already resolved for the open file (an
    // ancestor's `:imagesdir:` in the inherited scope must not clobber it). Empty seed ⇒ current
    // standalone/root behavior preserved.
    const attributes: Record<string, string> = {
      // Enable STEM by default so an author who writes `stem:[…]`/`[stem]` sees rendered math in the
      // preview WITHOUT having to remember the `:stem:` header. The value `'@'` is an empty
      // value carrying the overridable soft-default marker, so it resolves to the AsciiMath default
      // ('') when the document says nothing, yet a document can still pick a notation (`:stem:
      // latexmath`), inherit one from its cross-document scope below, or opt out entirely (`:stem!:`
      // → resolved value undefined → `detectMathPresent` stays false). Seeded FIRST so the inherited
      // scope and the in-document header both win over it.
      stem: SOFT_DEFAULT_SUFFIX,
      ...seedAttributesFromScope(rootFileId, openFileId, files),
      showtitle: '',
      ...(imagesDir ? { imagesdir: imagesDir } : {}),
    };
    // When a main file + its tree's contents are supplied, assemble the include tree (sandbox-
    // confined) and render that; otherwise render the open file's content unchanged so the
    // default preview keeps exact source-line mapping for scroll-sync (Constitution VIII). The
    // assembler is seeded with the same document-start attribute state Asciidoctor will resolve (the
    // intrinsics + these API attributes) so its conditional include-gating and `{attr}` target
    // substitution agree with the render — an include guarded by `ifdef::backend-html5[]` is kept,
    // not silently dropped (Finding#1).
    // Assemble rooted at the open file for ANY file with includes.
    // `readFile` overlays the live editor buffer for the root path:
    // content is always the most current keystroke, while files[openPath] may lag.
    // Only overlay content when openFileId is explicitly provided (the live editor buffer IS that
    // file); when falling back to mainPath the content field may be for a different file.
    const openFilePath = openFileId ?? mainPath;
    const readFile =
      openFileId === undefined
        ? (p: string) => files![p] ?? null
        : (p: string) => (p === openFilePath ? content : (files![p] ?? null));
    const source =
      openFilePath && files && files[openFilePath] !== undefined
        ? assembleIncludes(openFilePath, readFile, {
            showIncludes,
            seedAttributes: buildAssemblerSeed(attributes),
          }).content
        : content;
    const asciidocDocument = proc.load(source, {
      safe: 'safe',
      sourcemap: true,
      attributes,
    });

    // Collect source locations BEFORE conversion. Blocks that have no ID get a
    // synthetic one so we can inject data-source-line via a post-processing pass
    // on the raw HTML string (setAttribute alone does not produce HTML attributes).
    const blockSourceLines: Array<{ id: string; lineNum: number }> = [];
    // Track the document title line number (from the level-0 section block).
    // The showtitle <h1> has no id attribute, so it needs special handling below.
    let documentTitleLineNumber: number | null = null;

    const blocks = asciidocDocument.findBy({});
    for (const block of blocks) {
      const loc = block.getSourceLocation();
      if (!loc) continue;
      const lineNumber = Number(loc.getLineNumber());
      const context = String(block.getContext());
      // The document-level block has no wrapping HTML element.
      if (context === 'document') continue;

      // Level-0 sections render as an <h1> via showtitle but have no id in the HTML.
      // Capture the line number for the post-processing step below.
      if (context === 'section' && typeof block.getLevel === 'function' && block.getLevel() === 0) {
        documentTitleLineNumber = lineNumber;
        continue;
      }

      const rawId: unknown = block.getId();
      let id: string = typeof rawId === 'string' ? rawId : '';
      if (!id) {
        id = `__src_${context}_${lineNumber}`;
        block.setId(id);
      }
      blockSourceLines.push({ id, lineNum: lineNumber });
    }

    let html = String(asciidocDocument.convert());

    // Gate client-side math on the RESOLVED `:stem:` value (cross-document scope already seeded
    // above), not on the raw delimiters Asciidoctor always emits for stem macros.
    const stemAttribute =
      typeof asciidocDocument.getAttribute === 'function' ? asciidocDocument.getAttribute('stem') : undefined;
    const mathPresent = detectMathPresent(stemAttribute, source, html);

    // Syntax-highlight source blocks before the source-line pass below; this
    // only rewrites the <code> bodies and never touches id="..." attributes.
    html = highlightCodeBlocks(html);
    html = styleChecklistMarkers(html);

    // Inject data-source-line next to each id="..." attribute in a single pass
    // so the preview hook can use querySelector('[data-source-line="N"]').
    if (blockSourceLines.length > 0) {
      const lineMap = new Map(blockSourceLines.map(({ id, lineNum }) => [id, lineNum]));
      html = html.replaceAll(/id="([^"]+)"/g, (_, id: string) => {
        const lineNumber = lineMap.get(id);
        return lineNumber === undefined ? `id="${id}"` : `id="${id}" data-source-line="${lineNumber}"`;
      });
    }

    // The showtitle <h1> is the document title and has no id attribute.
    // Inject data-source-line directly so click-to-scroll works for line 1.
    // Use string replace (not /^<h1>/) to handle a leading newline Asciidoctor
    // sometimes emits in embedded mode.
    if (documentTitleLineNumber !== null) {
      html = html.replace('<h1>', `<h1 data-source-line="${documentTitleLineNumber}">`);
    }

    postMessage({ requestId, ok: true, html, error: null, mathPresent } satisfies RenderResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    postMessage({ requestId, ok: false, html: null, error: message } satisfies RenderResult);
  }
};
