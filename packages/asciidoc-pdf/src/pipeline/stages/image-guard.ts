/**
 * @file The image-guard pre-processing stage. It scans the project's AsciiDoc sources for block
 * (`image::`) and inline (`image:`) macros and validates every referenced image WITHOUT touching the
 * network: a project-local image is checked by format and by size, while any target that resolves to
 * a remote URL or escapes the project sandbox is refused entry (never fetched) and reported instead.
 *
 * The stage never aborts the render — each problem becomes a non-fatal warning so the rest of the
 * document still exports. It is pure with respect to the injected {@link StageContext}: it reads the
 * request snapshot and returns diagnostics, performing no I/O of any kind.
 */

import type { PipelineStage, StageContext, StageResult } from '../orchestrator';
import type { DiagnosticCode, PipelineStageKind, ProjectSnapshot, RenderDiagnostic } from '../../protocol';

/** This stage's fixed position in the pipeline order. */
const STAGE_KIND: PipelineStageKind = 'image-guard';

/**
 * Matches an AsciiDoc block (`image::`) or inline (`image:`) macro, capturing the raw target.
 *
 * Both variable spans are bounded so the match cost stays linear instead of rescanning the whole line
 * from every `image:` occurrence: the target run excludes `[` and line breaks and is tempered with
 * `(?!image:)` so it halts at the next macro, and the attribute run excludes both brackets so it halts
 * at the next `[`. Neither bound alters what a real macro captures — an image path never embeds a
 * literal `image:`, and an attribute list never contains an unescaped `[`.
 */
const IMAGE_MACRO_PATTERN = /image:(:)?((?:(?!image:)[^[\n\r])+)\[[^\][]*\]/g;

/** A leading `scheme://` marks a remote target that must never be fetched. */
const REMOTE_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
/** A word character preceding `image:` means it is part of a larger token, not a macro. */
const WORD_CHARACTER = /\w/;

const PATH_SEPARATOR = '/';
const EXTENSION_SEPARATOR = '.';
const TRAVERSAL_SEGMENT = '..';
const LINE_BREAK = '\n';

/** Raster/vector formats prawn (and prawn-svg) can place directly; anything else is unsupported. */
const SUPPORTED_IMAGE_EXTENSIONS: ReadonlySet<string> = new Set(['png', 'jpg', 'jpeg', 'svg']);

/** Upper bound on a single embedded image; larger files are refused as unsupported. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const REMOTE_SKIPPED: DiagnosticCode = 'remote-skipped';
const UNSUPPORTED_IMAGE: DiagnosticCode = 'unsupported-image';

/** One image macro occurrence, with the source location that referenced it. */
interface ImageReference {
  /** The raw macro target, verbatim. */
  readonly target: string;
  /** The project-relative file the macro appeared in. */
  readonly path: string;
  /** The 1-based line number of the macro. */
  readonly line: number;
}

/** The lowercased file extension of a path's last segment, or `''` when it has none. */
function extensionOf(target: string): string {
  const lastSegment = target.slice(target.lastIndexOf(PATH_SEPARATOR) + 1);
  const dot = lastSegment.lastIndexOf(EXTENSION_SEPARATOR);
  return dot === -1 ? '' : lastSegment.slice(dot + 1).toLowerCase();
}

/** Whether a target points at a remote resource (a `scheme://` URL). */
function isRemote(target: string): boolean {
  return REMOTE_SCHEME_PATTERN.test(target);
}

/** Whether a target would escape the project sandbox (absolute path or `..` traversal). */
function escapesSandbox(target: string): boolean {
  if (target.startsWith(PATH_SEPARATOR)) {
    return true;
  }
  return target.split(PATH_SEPARATOR).includes(TRAVERSAL_SEGMENT);
}

/** The 1-based line number of a character offset within a file's content. */
function lineNumberAt(content: string, index: number): number {
  let line = 1;
  for (let index_ = 0; index_ < index; index_ += 1) {
    if (content[index_] === LINE_BREAK) {
      line += 1;
    }
  }
  return line;
}

/** Collect every image macro occurrence across the snapshot's text files, in file/order encounter. */
function collectImageReferences(files: Readonly<Record<string, string>>): ImageReference[] {
  const references: ImageReference[] = [];
  for (const [path, content] of Object.entries(files)) {
    IMAGE_MACRO_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null = IMAGE_MACRO_PATTERN.exec(content);
    while (match !== null) {
      const start = match.index;
      const precededByWord = start > 0 && WORD_CHARACTER.test(content.charAt(start - 1));
      const target = match[2].trim();
      if (!precededByWord && target.length > 0) {
        references.push({ target, path, line: lineNumberAt(content, start) });
      }
      match = IMAGE_MACRO_PATTERN.exec(content);
    }
  }
  return references;
}

/** Locate a local image's bytes via the project `imagesdir`, falling back to the bare target key. */
function locateBytes(snapshot: ProjectSnapshot, target: string): Uint8Array | undefined {
  const candidates =
    snapshot.imagesDir === undefined
      ? [target]
      : [`${snapshot.imagesDir}${PATH_SEPARATOR}${target}`, target];
  for (const key of candidates) {
    const bytes = snapshot.binaryAssets[key];
    if (bytes !== undefined) {
      return bytes;
    }
  }
  return undefined;
}

/** Build a non-fatal warning for an image reference at its source location. */
function warn(code: DiagnosticCode, reference: ImageReference, message: string): RenderDiagnostic {
  return {
    severity: 'warning',
    code,
    resource: reference.target,
    location: { path: reference.path, line: reference.line },
    message,
  };
}

/** Validate a single reference, returning a diagnostic when it is skipped/unsupported, else `null`. */
function validate(reference: ImageReference, snapshot: ProjectSnapshot): RenderDiagnostic | null {
  if (isRemote(reference.target) || escapesSandbox(reference.target)) {
    return warn(
      REMOTE_SKIPPED,
      reference,
      `Remote or out-of-sandbox image "${reference.target}" was skipped and never fetched.`,
    );
  }
  if (!SUPPORTED_IMAGE_EXTENSIONS.has(extensionOf(reference.target))) {
    return warn(
      UNSUPPORTED_IMAGE,
      reference,
      `Image "${reference.target}" has an unsupported format and was skipped.`,
    );
  }
  const bytes = locateBytes(snapshot, reference.target);
  if (bytes !== undefined && bytes.byteLength > MAX_IMAGE_BYTES) {
    return warn(
      UNSUPPORTED_IMAGE,
      reference,
      `Image "${reference.target}" exceeds the ${MAX_IMAGE_BYTES}-byte size limit and was skipped.`,
    );
  }
  return null;
}

/**
 * Build the image-guard stage. It validates project-local images and fail-closed skips any remote or
 * sandbox-escaping reference, emitting one warning per offending reference without ever aborting.
 */
export function createImageGuardStage(): PipelineStage {
  return {
    kind: STAGE_KIND,
    run: async (context: StageContext): Promise<StageResult> => {
      const { snapshot } = context.request;
      const diagnostics: RenderDiagnostic[] = [];
      for (const reference of collectImageReferences(snapshot.files)) {
        const diagnostic = validate(reference, snapshot);
        if (diagnostic !== null) {
          diagnostics.push(diagnostic);
        }
      }
      return { diagnostics };
    },
  };
}
