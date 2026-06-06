import Asciidoctor from 'asciidoctor';

interface RenderRequest {
  requestId: number;
  content: string;
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
    let docTitleLineNum: number | null = null;

    const blocks = asciidocDocument.findBy({});
    for (const block of blocks) {
      const loc = block.getSourceLocation();
      if (!loc) continue;
      const lineNum = loc.getLineNumber() as number;
      const ctx = block.getContext() as string;
      // The document-level block has no wrapping HTML element.
      if (ctx === 'document') continue;

      // Level-0 sections render as an <h1> via showtitle but have no id in the HTML.
      // Capture the line number for the post-processing step below.
      if (ctx === 'section' && typeof block.getLevel === 'function' && block.getLevel() === 0) {
        docTitleLineNum = lineNum;
        continue;
      }

      let id: string = block.getId() as string;
      if (!id) {
        id = `__src_${ctx}_${lineNum}`;
        block.setId(id);
      }
      blockSourceLines.push({ id, lineNum });
    }

    let html = String(asciidocDocument.convert());

    // Inject data-source-line next to each id="..." attribute so the preview
    // hook can use querySelector('[data-source-line="N"]') for click-to-scroll.
    for (const { id, lineNum } of blockSourceLines) {
      const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      html = html.replace(
        new RegExp(`id="${escaped}"`),
        `id="${id}" data-source-line="${lineNum}"`,
      );
    }

    // The showtitle <h1> is the document title and has no id attribute.
    // Inject data-source-line directly so click-to-scroll works for line 1.
    if (docTitleLineNum !== null) {
      html = html.replace(/^<h1>/, `<h1 data-source-line="${docTitleLineNum}">`);
    }

    postMessage({ requestId, ok: true, html, error: null } satisfies RenderResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    postMessage({ requestId, ok: false, html: null, error: message } satisfies RenderResult);
  }
};
