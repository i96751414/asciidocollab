/**
 * @file The asset-mount pre-processing stage. The project's theme YAML, images, and TTF/OTF fonts are
 * already written to the in-memory `/project` VFS by {@link populateProject} (they mount byte-for-byte),
 * and the convert points `pdf-themesdir`/`pdf-fontsdir`/`imagesdir` at their original directories. So
 * this stage's ONLY job is the one thing populate cannot do: make a CUSTOM WOFF2 font embeddable.
 *
 * Asciidoctor-PDF/prawn embeds TTF and OTF only — WOFF2 is unsupported (it is not even mentioned in the
 * font-support manual). WOFF2 is a compressed wrapper around exactly such an sfnt, so a custom WOFF2
 * font is DECOMPRESSED in place (via the injected {@link FontConverter}) back to the original TTF/OTF
 * bytes the font author prepared — losslessly, preserving its glyphs and `kern` table. The decoded
 * bytes overwrite the same `/project/<font>` path (prawn/ttfunk identifies a font by its sfnt signature,
 * not its filename, so the theme's reference to the `.woff2` name still resolves).
 *
 * The converter is supplied at the worker composition root (kept out of this package so the stage stays
 * unit-testable with a fake). An unavailable font, or one that cannot be decoded, becomes a non-fatal
 * `font-unavailable` warning with a predictable fallback to the default font — the stage never aborts.
 */

import type { PipelineStage, StageContext, StageResult } from '../orchestrator';
import type { DiagnosticCode, PipelineStageKind, ProjectSnapshot, RenderDiagnostic } from '../../protocol';
import { PROJECT_ROOT } from '../../vfs/populate';

/**
 * Losslessly decompresses a WOFF2 font back to the embeddable TTF/OTF sfnt it wraps. The concrete
 * converter is supplied at the worker composition root; the stage depends only on this narrow port so
 * it stays testable with a fake.
 */
export interface FontConverter {
  /**
   * Decompress WOFF2 bytes to the original TTF/OTF sfnt prawn/ttfunk can embed.
   *
   * @param bytes - The source WOFF2 font bytes to decode.
   * @returns The embeddable TTF/OTF (sfnt) bytes the WOFF2 wraps.
   */
  woff2ToTtf(bytes: Uint8Array): Promise<Uint8Array>;
}

/** Dependencies injected into the asset-mount stage at construction time. */
export interface MountAssetsDeps {
  /** The WOFF2→TTF/OTF decoder used for custom WOFF2 project fonts. */
  readonly fontConverter: FontConverter;
}

/** This stage's fixed position in the pipeline order. */
const STAGE_KIND: PipelineStageKind = 'mount-assets';

const PATH_SEPARATOR = '/';
const EXTENSION_SEPARATOR = '.';

const TTF_EXTENSION = 'ttf';
const OTF_EXTENSION = 'otf';
const WOFF2_EXTENSION = 'woff2';

/** Font formats prawn/ttfunk embeds directly; populate already mounted these byte-for-byte. */
const EMBEDDABLE_FONT_EXTENSIONS: ReadonlySet<string> = new Set([TTF_EXTENSION, OTF_EXTENSION]);

const FONT_UNAVAILABLE: DiagnosticCode = 'font-unavailable';

/** The lowercased file extension of a path's last segment, or `''` when it has none. */
function extensionOf(path: string): string {
  const lastSegment = path.slice(path.lastIndexOf(PATH_SEPARATOR) + 1);
  const dot = lastSegment.lastIndexOf(EXTENSION_SEPARATOR);
  return dot === -1 ? '' : lastSegment.slice(dot + 1).toLowerCase();
}

/** The absolute `/project` path a font was mounted at by {@link populateProject}. */
function fontMountPath(fontPath: string): string {
  return `${PROJECT_ROOT}${PATH_SEPARATOR}${fontPath}`;
}

/** Build a non-fatal font warning that falls back to the default font. */
function fontWarn(resource: string, message: string): RenderDiagnostic {
  return { severity: 'warning', code: FONT_UNAVAILABLE, resource, message };
}

/**
 * Make one custom font embeddable. TTF/OTF are already embeddable (populate mounted them) so this is a
 * no-op; a WOFF2 font is decoded in place to its TTF/OTF sfnt. Returns a diagnostic when the font is
 * unavailable, cannot be decoded, or is an unsupported format — never throws.
 */
async function mountFont(
  context: StageContext,
  deps: MountAssetsDeps,
  snapshot: ProjectSnapshot,
  fontPath: string,
): Promise<RenderDiagnostic | null> {
  const extension = extensionOf(fontPath);
  if (EMBEDDABLE_FONT_EXTENSIONS.has(extension)) {
    return null;
  }
  if (extension !== WOFF2_EXTENSION) {
    return fontWarn(
      fontPath,
      `Custom font "${fontPath}" has an unsupported format and was skipped; the default font is used instead.`,
    );
  }
  const bytes = snapshot.binaryAssets[fontPath];
  if (bytes === undefined) {
    return fontWarn(
      fontPath,
      `Custom font "${fontPath}" was unavailable and skipped; the default font is used instead.`,
    );
  }
  try {
    const ttf = await deps.fontConverter.woff2ToTtf(bytes);
    context.vfs.writeFile(fontMountPath(fontPath), ttf);
    return null;
  } catch {
    return fontWarn(
      fontPath,
      `Custom WOFF2 font "${fontPath}" could not be decoded to an embeddable format and was skipped; the default font is used instead.`,
    );
  }
}

/**
 * Build the asset-mount stage. Theme, images, and TTF/OTF fonts are already mounted by populate; this
 * stage decodes each custom WOFF2 font in place to its embeddable sfnt and warns — without aborting —
 * on any font that is unavailable or cannot be decoded.
 */
export function createMountAssetsStage(deps: MountAssetsDeps): PipelineStage {
  return {
    kind: STAGE_KIND,
    run: async (context: StageContext): Promise<StageResult> => {
      const { snapshot } = context.request;
      const diagnostics: RenderDiagnostic[] = [];
      for (const fontPath of snapshot.fontPaths) {
        const diagnostic = await mountFont(context, deps, snapshot, fontPath);
        if (diagnostic !== null) {
          diagnostics.push(diagnostic);
        }
      }
      return { diagnostics };
    },
  };
}
