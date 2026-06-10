import Asciidoctor from 'asciidoctor';
import hljs from 'highlight.js/lib/common';

interface RenderRequest {
  requestId: number;
  content: string;
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
}

let processor: ReturnType<typeof Asciidoctor> | null = null;

function getProcessor(): ReturnType<typeof Asciidoctor> {
  if (processor) return processor;
  processor = Asciidoctor();
  return processor;
}

onmessage = function (event: MessageEvent<RenderRequest>) {
  const { requestId, content } = event.data;
  try {
    const proc = getProcessor();
    const asciidocDocument = proc.load(content, {
      safe: 'safe',
      sourcemap: true,
      // Render the document title (= Title) in embedded output.
      attributes: { showtitle: '' },
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

    postMessage({ requestId, ok: true, html, error: null } satisfies RenderResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    postMessage({ requestId, ok: false, html: null, error: message } satisfies RenderResult);
  }
};
