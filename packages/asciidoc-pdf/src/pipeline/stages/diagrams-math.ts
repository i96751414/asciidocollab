/**
 * Pipeline stage: turn text-described diagram and math blocks into content-addressed image assets.
 *
 * It scans the assembled `/project` root document for diagram blocks (mermaid/graphviz/vega/vega-lite),
 * math blocks (`stem`/`latexmath`/`asciimath`), and inline math macros, renders each block of INERT
 * source through the appropriate injected {@link RenderShim} (SVG-first, PNG raster fallback), writes
 * the bytes to `/project/.gen/<sourceHash>.<ext>`, and rewrites the block to an `image::`/`image:` ref.
 * Rendering is content-addressed: an unchanged block resolves to the same `sourceHash`, the same
 * `.gen` filename, and a cache hit — so identical source never re-renders and placement stays stable.
 *
 * The stage is fail-soft per block: a malformed block or a shim failure records a diagnostic and
 * leaves that block untouched, so the rest of the document still exports. Diagram engines that have no
 * offline client-side renderer (PlantUML/ditaa) are skipped with a diagnostic — never fetched.
 *
 * Detection is a pragmatic line scan (no full AsciiDoc parse): an attribute line `[name]` immediately
 * followed by a matching block delimiter opens a block; a bare delimiter opens a verbatim region that
 * is copied through unchanged so inline math inside listings/literals/passthroughs is never rewritten.
 */

import type { PipelineStage, StageContext, StageResult } from '../orchestrator';
import type { RenderShim, ShimAssetFormat } from '../../ports/shim';
import { computeSourceHash } from '../../cache/content-address';
import type {
  DiagnosticCode,
  DiagnosticSeverity,
  GeneratedAsset,
} from '../../protocol';

// ---------------------------------------------------------------------------
// Stage identity, VFS layout, and diagnostic codes (named — never bare literals).
// ---------------------------------------------------------------------------

/** This stage's fixed slot in the pipeline order. */
const STAGE_KIND = 'diagrams-math' as const;

/** Root of the in-memory project tree the pipeline rewrites. */
const PROJECT_ROOT = '/project';

/** Directory (relative to the project root) that holds generated diagram/math image assets. */
const GEN_DIR_NAME = '.gen';

/** Absolute VFS directory the rendered asset bytes are written under. */
const GEN_DIR_PATH = `${PROJECT_ROOT}/${GEN_DIR_NAME}`;

/** The format the orchestrator asks a shim for first; PNG is the raster fallback. */
const PREFERRED_FORMAT: ShimAssetFormat = 'svg';

/**
 * A synthetic render param carrying the block's AsciiDoc notation/engine so it participates in the
 * cache key and tells a single math shim which notation to interpret.
 */
const BLOCK_NOTATION_PARAM = 'asciidoc-block-notation';

/** Prefix for positional block attributes captured from an attribute line. */
const POSITIONAL_PARAM_PREFIX = 'pos';

const DIAGNOSTIC_DIAGRAM_UNSUPPORTED: DiagnosticCode = 'diagram-unsupported';
const DIAGNOSTIC_RASTERIZED: DiagnosticCode = 'unsupported-image';

const SEVERITY_WARNING: DiagnosticSeverity = 'warning';
const SEVERITY_ERROR: DiagnosticSeverity = 'error';

// ---------------------------------------------------------------------------
// Block-name classification.
// ---------------------------------------------------------------------------

/** The shim family a detected block resolves to, or that it is an unsupported diagram. */
type BlockCategory = 'diagram' | 'math' | 'diagram-unsupported';

/** Diagram block names → the engine shim name that renders them. */
const DIAGRAM_SHIM_BY_BLOCK: Readonly<Record<string, string>> = Object.freeze({
  mermaid: 'mermaid',
  graphviz: 'graphviz',
  vega: 'vega',
  vegalite: 'vega',
  'vega-lite': 'vega',
});

/** Diagram engines with no offline client-side renderer — skipped with a diagnostic. */
const UNSUPPORTED_DIAGRAM_BLOCKS: ReadonlySet<string> = new Set(['plantuml', 'ditaa']);

/** Math block/inline notations rendered through the math shim family. */
const MATH_NOTATIONS: ReadonlySet<string> = new Set(['stem', 'latexmath', 'asciimath']);

function classifyBlock(name: string): BlockCategory | null {
  if (name in DIAGRAM_SHIM_BY_BLOCK) {
    return 'diagram';
  }
  if (UNSUPPORTED_DIAGRAM_BLOCKS.has(name)) {
    return 'diagram-unsupported';
  }
  if (MATH_NOTATIONS.has(name)) {
    return 'math';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Line-scan primitives.
// ---------------------------------------------------------------------------

/** Minimum run length for a block delimiter line (AsciiDoc requires four or more). */
const MIN_DELIMITER_LENGTH = 4;

/** Delimiter characters this scan recognises: listing (`-`), literal (`.`), passthrough (`+`). */
const DELIMITER_CHARS: ReadonlySet<string> = new Set(['-', '.', '+']);

const BLOCK_ATTR_RE = /^\[([^\]]+)\]\s*$/;
// The body captures every character up to the closing `]`, but the `(?!:\[)` guard also stops it at
// the start of a following inline-math macro. That tempering bounds each scan to a single macro so the
// match cost stays linear (an unguarded `[^\]]*` rescans the whole line from every macro start), while
// leaving the captured expression identical for any real macro whose content holds no `notation:[`.
const INLINE_MATH_RE = /(stem|latexmath|asciimath):\[((?:(?!:\[)[^\]])*)\]/g;

/** Whether a line is a block delimiter (a run of four or more identical delimiter characters). */
function isDelimiter(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < MIN_DELIMITER_LENGTH) {
    return false;
  }
  const first = trimmed[0];
  if (!DELIMITER_CHARS.has(first)) {
    return false;
  }
  for (const ch of trimmed) {
    if (ch !== first) {
      return false;
    }
  }
  return true;
}

/** A parsed block attribute line: its lowercased name and its (positional/named) render params. */
interface BlockAttributes {
  readonly name: string;
  readonly params: Record<string, string>;
}

function parseAttributeLine(line: string): BlockAttributes | null {
  const match = BLOCK_ATTR_RE.exec(line);
  if (match === null) {
    return null;
  }
  const parts = match[1]
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return null;
  }
  const parameters: Record<string, string> = {};
  for (let index = 1; index < parts.length; index += 1) {
    const part = parts[index];
    const eq = part.indexOf('=');
    if (eq > 0) {
      parameters[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    } else {
      parameters[`${POSITIONAL_PARAM_PREFIX}${index}`] = part;
    }
  }
  return { name: parts[0].toLowerCase(), params: parameters };
}

// ---------------------------------------------------------------------------
// VFS path helpers.
// ---------------------------------------------------------------------------

/** Join a project-relative path onto the project root. */
function toVfsPath(relativePath: string): string {
  const trimmed = relativePath.replace(/^\/+/, '');
  return `${PROJECT_ROOT}/${trimmed}`;
}

/** The `image::`/`image:` target that points from the root document at a `.gen` asset. */
function genReference(rootPath: string, filename: string): string {
  const segments = rootPath.split('/').filter((segment) => segment.length > 0);
  const depth = Math.max(0, segments.length - 1);
  return `${'../'.repeat(depth)}${GEN_DIR_NAME}/${filename}`;
}

// ---------------------------------------------------------------------------
// Rendering + caching.
// ---------------------------------------------------------------------------

const GENERATED_ASSET_KIND: Readonly<Record<'diagram' | 'math', GeneratedAsset['kind']>> =
  Object.freeze({ diagram: 'diagram', math: 'math' });

interface RenderRequestForBlock {
  readonly shim: RenderShim;
  readonly source: string;
  readonly params: Readonly<Record<string, string>>;
  readonly category: 'diagram' | 'math';
  readonly resource: string;
  readonly line: number;
}

/**
 * Resolve a block to a placed {@link GeneratedAsset} (rendering on a cache miss, reusing on a hit) or
 * `null` when the shim reports the source malformed. Ensures the asset bytes are present in the VFS
 * and records the raster-fallback diagnostic when a render fell back to PNG.
 */
async function renderOrReuse(
  context: StageContext,
  request: RenderRequestForBlock,
): Promise<GeneratedAsset | null> {
  const sourceHash = computeSourceHash({
    source: request.source,
    renderParams: request.params,
    shimVersion: request.shim.version,
  });

  let asset = context.cache.get(sourceHash);
  if (asset === undefined) {
    const output = await request.shim.render({
      source: request.source,
      params: request.params,
      preferredFormat: PREFERRED_FORMAT,
    });
    if (!output.ok) {
      context.diagnostics.report({
        severity: SEVERITY_ERROR,
        code: output.diagnostic.code,
        resource: request.resource,
        location: { path: request.resource, line: request.line },
        message: output.diagnostic.message,
      });
      return null;
    }
    asset = {
      sourceHash,
      kind: GENERATED_ASSET_KIND[request.category],
      format: output.asset.format,
      bytes: output.asset.bytes,
      rasterFallback: output.asset.rasterFallback,
    };
    context.cache.set(asset);
    if (asset.rasterFallback) {
      context.diagnostics.report({
        severity: SEVERITY_WARNING,
        code: DIAGNOSTIC_RASTERIZED,
        resource: request.resource,
        location: { path: request.resource, line: request.line },
        message: `Rendered ${request.category} rasterized to PNG because the SVG used a feature the PDF renderer cannot draw.`,
      });
    }
  }

  const genPath = `${GEN_DIR_PATH}/${asset.sourceHash}.${asset.format}`;
  if (!context.vfs.exists(genPath)) {
    context.vfs.writeFile(genPath, asset.bytes);
  }
  return asset;
}

/** Pick the shim that renders a diagram block, by engine name with a same-family fallback. */
function resolveDiagramShim(context: StageContext, blockName: string): RenderShim | undefined {
  const shimName = DIAGRAM_SHIM_BY_BLOCK[blockName];
  const byName = shimName === undefined ? undefined : context.shims.byName(shimName);
  if (byName !== undefined && byName.kind === 'diagram') {
    return byName;
  }
  return context.shims.byKind('diagram')[0];
}

// ---------------------------------------------------------------------------
// The stage.
// ---------------------------------------------------------------------------

/** Build the diagrams-math pre-processing stage. */
export function createDiagramsMathStage(): PipelineStage {
  return {
    kind: STAGE_KIND,
    run: (context) => runDiagramsMath(context),
  };
}

async function runDiagramsMath(context: StageContext): Promise<StageResult> {
  const rootPath = context.request.snapshot.rootPath;
  const rootVfsPath = toVfsPath(rootPath);
  const original = context.vfs.readText(rootVfsPath);
  if (original === null) {
    return {};
  }

  const lines = original.split('\n');
  const out: string[] = [];
  const resource = rootPath;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const attribute = parseAttributeLine(line);

    if (attribute !== null && index + 1 < lines.length && isDelimiter(lines[index + 1])) {
      const category = classifyBlock(attribute.name);
      if (category !== null) {
        const delimiter = lines[index + 1].trim();
        let close = index + 2;
        while (close < lines.length && lines[close].trim() !== delimiter) {
          close += 1;
        }
        if (close < lines.length) {
          const source = lines.slice(index + 2, close).join('\n');
          const originalBlock = lines.slice(index, close + 1);
          const replacement = await handleBlock(context, {
            category,
            name: attribute.name,
            params: attribute.params,
            source,
            resource,
            line: index + 1,
            originalBlock,
          });
          out.push(...replacement);
          index = close + 1;
          continue;
        }
      }
    }

    if (isDelimiter(line)) {
      // A bare delimited region (listing/literal/passthrough): copy through verbatim so inline math
      // inside it is treated as literal content, not rewritten.
      const delimiter = line.trim();
      out.push(line);
      index += 1;
      while (index < lines.length && lines[index].trim() !== delimiter) {
        out.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        out.push(lines[index]);
        index += 1;
      }
      continue;
    }

    out.push(await rewriteInlineMath(context, line, resource, index + 1));
    index += 1;
  }

  const rewritten = out.join('\n');
  if (rewritten !== original) {
    context.vfs.writeText(rootVfsPath, rewritten);
  }
  return {};
}

interface DetectedBlock {
  readonly category: BlockCategory;
  readonly name: string;
  readonly params: Record<string, string>;
  readonly source: string;
  readonly resource: string;
  readonly line: number;
  readonly originalBlock: readonly string[];
}

/** Render one detected block and return the lines that replace it (unchanged on skip/failure). */
async function handleBlock(context: StageContext, block: DetectedBlock): Promise<readonly string[]> {
  if (block.category === 'diagram-unsupported') {
    context.diagnostics.report({
      severity: SEVERITY_WARNING,
      code: DIAGNOSTIC_DIAGRAM_UNSUPPORTED,
      resource: block.resource,
      location: { path: block.resource, line: block.line },
      message: `Diagram engine "${block.name}" has no offline renderer; the block was skipped.`,
    });
    return block.originalBlock;
  }

  const shim =
    block.category === 'diagram'
      ? resolveDiagramShim(context, block.name)
      : context.shims.byKind('math')[0];
  if (shim === undefined) {
    context.diagnostics.report({
      severity: SEVERITY_WARNING,
      code: DIAGNOSTIC_DIAGRAM_UNSUPPORTED,
      resource: block.resource,
      location: { path: block.resource, line: block.line },
      message: `No renderer is available for "${block.name}"; the block was skipped.`,
    });
    return block.originalBlock;
  }

  const parameters: Record<string, string> = { ...block.params, [BLOCK_NOTATION_PARAM]: block.name };
  const asset = await renderOrReuse(context, {
    shim,
    source: block.source,
    params: parameters,
    category: block.category,
    resource: block.resource,
    line: block.line,
  });
  if (asset === null) {
    return block.originalBlock;
  }
  const target = genReference(block.resource, `${asset.sourceHash}.${asset.format}`);
  return [`image::${target}[]`];
}

/** Rewrite every inline math macro on a prose line to an inline `image:` reference. */
async function rewriteInlineMath(
  context: StageContext,
  line: string,
  resource: string,
  lineNumber: number,
): Promise<string> {
  if (!line.includes(':[')) {
    return line;
  }
  const matches = [...line.matchAll(INLINE_MATH_RE)];
  if (matches.length === 0) {
    return line;
  }
  const shim = context.shims.byKind('math')[0];

  let result = '';
  let cursor = 0;
  for (const match of matches) {
    const start = match.index;
    if (start === undefined) {
      continue;
    }
    const full = match[0];
    const notation = match[1];
    const expression = match[2];
    result += line.slice(cursor, start);
    cursor = start + full.length;

    if (shim === undefined) {
      result += full;
      continue;
    }
    const asset = await renderOrReuse(context, {
      shim,
      source: expression,
      params: { [BLOCK_NOTATION_PARAM]: notation },
      category: 'math',
      resource,
      line: lineNumber,
    });
    if (asset === null) {
      result += full;
      continue;
    }
    const target = genReference(resource, `${asset.sourceHash}.${asset.format}`);
    result += `image:${target}[]`;
  }
  result += line.slice(cursor);
  return result;
}
