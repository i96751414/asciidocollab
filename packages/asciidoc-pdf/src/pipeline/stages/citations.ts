/**
 * Pipeline stage: turn BibTeX citations into formatted AsciiDoc before the Ruby convert.
 *
 * It runs on the assembled root document (after include-resolve, before diagrams-math). When the
 * project ships a BibTeX source and the document actually uses a citation macro, the stage hands the
 * whole document plus the parsed-once `.bib` to the citations shim in a SINGLE call, so the shim can
 * see every macro occurrence at once and emit an inline-macro rewrite plus a generated reference list
 * with stable anchors and back-links — preserving the CSL style and the appearance-vs-alphabetical
 * ordering the shim produces. The formatted result is written back over the root document in the VFS.
 *
 * The CSL formatting fidelity lives entirely in the shim; this stage owns only detection, one-shot
 * orchestration, and the document rewrite. Every citation problem (unreadable `.bib`, unknown key, a
 * shim `{ ok:false }`) is reported as a per-resource diagnostic and never aborts the export — the rest
 * of the document still renders.
 *
 * Adaptation note: the shim port is byte-oriented (`ShimAsset.bytes`, meant for SVG/PNG). For the
 * citations family those bytes carry UTF-8 AsciiDoc, so the stage encodes the `.bib` into the call and
 * decodes the returned bytes back into text before writing them to the VFS.
 */

import type { DiagnosticCode, DiagnosticSeverity, PipelineStageKind, RenderDiagnostic } from '../../protocol';
import type { PipelineStage, StageContext, StageResult } from '../orchestrator';
import type { ShimAssetFormat, ShimInput, ShimKind } from '../../ports/shim';
import { PROJECT_ROOT } from '../../vfs/populate';

/** This stage's fixed position in the pipeline order. */
const CITATIONS_STAGE_KIND: PipelineStageKind = 'citations';

/** The shim family this stage delegates the CSL formatting to. */
const CITATIONS_SHIM_KIND: ShimKind = 'citations';

/** The citation macros whose presence means the citations shim must run. */
const CITATION_MACRO_NAMES = Object.freeze(['cite', 'citenp', 'bibitem', 'bibliography'] as const);

/** The colon that follows a macro name in AsciiDoc macro syntax (`cite:`, `bibliography::`). */
const MACRO_NAME_TERMINATOR = ':';

/** Absolute VFS path separator (paths under {@link PROJECT_ROOT}). */
const PATH_SEPARATOR = '/';

/** Shim param carrying the whole `.bib` database content (parsed once by the shim). */
const BIBTEX_DATABASE_PARAM = 'bibtex';

/** Project attribute naming the CSL style the shim should format with. */
const BIBTEX_STYLE_ATTRIBUTE = 'bibtex-style';

/** Project attribute selecting the reference-list ordering (appearance vs alphabetical). */
const BIBTEX_ORDER_ATTRIBUTE = 'bibtex-order';

/**
 * The format asked of the shim. Citations emit text, not raster, but the port requires a value; the
 * shim ignores it for this family and the stage decodes the returned bytes as UTF-8 AsciiDoc.
 */
const CITATIONS_PREFERRED_FORMAT: ShimAssetFormat = 'svg';

/** The enumerated code for every citation-source problem this stage surfaces. */
const MALFORMED_CITATION_CODE: DiagnosticCode = 'malformed-citation';

/** Citation problems are non-fatal: the rest of the document still exports. */
const CITATION_DIAGNOSTIC_SEVERITY: DiagnosticSeverity = 'warning';

const textDecoder = new TextDecoder();

/** Join a project-relative path onto the writable `/project` VFS mount root. */
function projectVfsPath(relativePath: string): string {
  return `${PROJECT_ROOT}${PATH_SEPARATOR}${relativePath}`;
}

/** Whether the assembled document uses at least one citation macro. */
function documentUsesCitations(document: string): boolean {
  return CITATION_MACRO_NAMES.some((name) => document.includes(`${name}${MACRO_NAME_TERMINATOR}`));
}

/** Read the `.bib` database from the VFS, falling back to the injected project file reader. */
function readBibDatabase(context: StageContext, bibPath: string): string | null {
  const fromVfs = context.vfs.readText(projectVfsPath(bibPath));
  if (fromVfs !== null) {
    return fromVfs;
  }
  return context.readFile(bibPath);
}

/** Build the single shim call: the whole document as source, the `.bib` + CSL options as params. */
function buildShimInput(
  document: string,
  bibDatabase: string,
  attributes: Readonly<Record<string, string>>,
): ShimInput {
  const parameters: Record<string, string> = { [BIBTEX_DATABASE_PARAM]: bibDatabase };
  const style = attributes[BIBTEX_STYLE_ATTRIBUTE];
  if (style !== undefined) {
    parameters[BIBTEX_STYLE_ATTRIBUTE] = style;
  }
  const order = attributes[BIBTEX_ORDER_ATTRIBUTE];
  if (order !== undefined) {
    parameters[BIBTEX_ORDER_ATTRIBUTE] = order;
  }
  return { source: document, params: parameters, preferredFormat: CITATIONS_PREFERRED_FORMAT };
}

/** A located, non-fatal citation diagnostic. */
function citationDiagnostic(
  resource: string,
  message: string,
  location: RenderDiagnostic['location'],
): RenderDiagnostic {
  return {
    severity: CITATION_DIAGNOSTIC_SEVERITY,
    code: MALFORMED_CITATION_CODE,
    resource,
    location,
    message,
  };
}

/** An empty stage result — the no-op / success-with-no-diagnostics outcome. */
const NO_DIAGNOSTICS: StageResult = {};

/**
 * Build the citations pipeline stage. It reads and rewrites only the in-memory VFS; the concrete
 * citations shim is supplied through the {@link StageContext} at the composition root.
 */
export function createCitationsStage(): PipelineStage {
  return {
    kind: CITATIONS_STAGE_KIND,
    run: async (context: StageContext): Promise<StageResult> => {
      const { snapshot } = context.request;
      const bibPath = snapshot.bibPath;
      if (bibPath === undefined) {
        return NO_DIAGNOSTICS;
      }

      const rootVfsPath = projectVfsPath(snapshot.rootPath);
      const document = context.vfs.readText(rootVfsPath);
      if (document === null || !documentUsesCitations(document)) {
        return NO_DIAGNOSTICS;
      }

      const shim = context.shims.byKind(CITATIONS_SHIM_KIND)[0];
      if (shim === undefined) {
        return NO_DIAGNOSTICS;
      }

      const bibDatabase = readBibDatabase(context, bibPath);
      if (bibDatabase === null) {
        return {
          diagnostics: [
            citationDiagnostic(
              bibPath,
              `BibTeX source "${bibPath}" could not be read.`,
              { path: bibPath },
            ),
          ],
        };
      }

      const output = await shim.render(buildShimInput(document, bibDatabase, snapshot.attributes));
      if (!output.ok) {
        return {
          diagnostics: [
            citationDiagnostic(bibPath, output.diagnostic.message, { path: snapshot.rootPath }),
          ],
        };
      }

      context.vfs.writeText(rootVfsPath, textDecoder.decode(output.asset.bytes));
      return NO_DIAGNOSTICS;
    },
  };
}
