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
    const asciidocDocument = proc.load(content, { safe: 'safe', sourcemap: true });
    // Inject data-source-line on every block that has a source location so the
    // preview hook can map click positions back to rendered elements.
    const blocks = asciidocDocument.findBy({});
    for (const block of blocks) {
      const loc = block.getSourceLocation();
      if (loc) {
        // eslint-disable-next-line unicorn/prefer-dom-node-dataset
        block.setAttribute('data-source-line', String(loc.getLineNumber()));
      }
    }
    const html = String(asciidocDocument.convert());
    postMessage({ requestId, ok: true, html, error: null } satisfies RenderResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    postMessage({ requestId, ok: false, html: null, error: message } satisfies RenderResult);
  }
};
