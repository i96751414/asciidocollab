/**
 * @file The asset-mount pre-processing stage. It places the project's own PDF theme YAML and its
 * CUSTOM fonts into the in-memory `/project` VFS so the Ruby convert renders with the project's
 * branding. Default theme fonts are already baked into the wasm `/usr` tree and are never re-mounted.
 *
 * Prawn/ttfunk can only consume TTF/OTF, so a custom WOFF2 font is routed through an INJECTED
 * {@link FontConverter} (supplied at the worker composition root, kept out of this package so the
 * stage stays unit-testable). Missing or unsupported-format fonts become a non-fatal `font-unavailable`
 * warning with a predictable fallback to the default font — the stage never aborts the render.
 */

import type { PipelineStage, StageContext, StageResult } from '../orchestrator';
import type { DiagnosticCode, PipelineStageKind, ProjectSnapshot, RenderDiagnostic } from '../../protocol';
import { PROJECT_ROOT } from '../../vfs/populate';

/**
 * Converts a WOFF2 font into a TTF prawn/ttfunk can embed. The concrete converter is supplied at the
 * worker composition root; the stage depends only on this narrow port so it stays testable with a fake.
 */
export interface FontConverter {
  /**
   * Convert WOFF2 bytes to an embeddable TTF.
   *
   * @param bytes - The source WOFF2 font bytes to convert.
   * @returns The equivalent TTF bytes prawn/ttfunk can embed.
   */
  woff2ToTtf(bytes: Uint8Array): Uint8Array;
}

/** Dependencies injected into the asset-mount stage at construction time. */
export interface MountAssetsDeps {
  /** The WOFF2→TTF converter used for custom WOFF2 project fonts. */
  readonly fontConverter: FontConverter;
}

/** This stage's fixed position in the pipeline order. */
const STAGE_KIND: PipelineStageKind = 'mount-assets';

const PATH_SEPARATOR = '/';
const EXTENSION_SEPARATOR = '.';

/** Subdirectory under `/project` that custom fonts are mounted into (the convert points fontsdir here). */
const CUSTOM_FONTS_DIR = '.fonts';

const TTF_EXTENSION = 'ttf';
const OTF_EXTENSION = 'otf';
const WOFF2_EXTENSION = 'woff2';

/** Font formats that prawn/ttfunk embeds directly, mounted byte-for-byte. */
const PASS_THROUGH_FONT_EXTENSIONS: ReadonlySet<string> = new Set([TTF_EXTENSION, OTF_EXTENSION]);

const FONT_UNAVAILABLE: DiagnosticCode = 'font-unavailable';

const textEncoder = new TextEncoder();

/** The lowercased file extension of a path's last segment, or `''` when it has none. */
function extensionOf(path: string): string {
  const lastSegment = path.slice(path.lastIndexOf(PATH_SEPARATOR) + 1);
  const dot = lastSegment.lastIndexOf(EXTENSION_SEPARATOR);
  return dot === -1 ? '' : lastSegment.slice(dot + 1).toLowerCase();
}

/** The last path segment of a project-relative path. */
function baseName(path: string): string {
  return path.slice(path.lastIndexOf(PATH_SEPARATOR) + 1);
}

/** The absolute `/project` mount path a custom font is written to, under the fonts subdirectory. */
function fontMountPath(sourcePath: string, extension: string): string {
  const base = baseName(sourcePath);
  const dot = base.lastIndexOf(EXTENSION_SEPARATOR);
  const stem = dot === -1 ? base : base.slice(0, dot);
  return `${PROJECT_ROOT}${PATH_SEPARATOR}${CUSTOM_FONTS_DIR}${PATH_SEPARATOR}${stem}${EXTENSION_SEPARATOR}${extension}`;
}

/** Read an asset's bytes from the snapshot (binary asset first, then a text file), or `undefined`. */
function readAsset(snapshot: ProjectSnapshot, path: string): Uint8Array | undefined {
  const binary = snapshot.binaryAssets[path];
  if (binary !== undefined) {
    return binary;
  }
  const text = snapshot.files[path];
  return text === undefined ? undefined : textEncoder.encode(text);
}

/** Build a non-fatal font warning that falls back to the default font. */
function fontWarn(resource: string, message: string): RenderDiagnostic {
  return { severity: 'warning', code: FONT_UNAVAILABLE, resource, message };
}

/** Mount the project theme YAML at its declared path, if the snapshot captured its bytes. */
function mountTheme(context: StageContext, snapshot: ProjectSnapshot): void {
  if (snapshot.themePath === undefined) {
    return;
  }
  const bytes = readAsset(snapshot, snapshot.themePath);
  if (bytes === undefined) {
    return;
  }
  context.vfs.writeFile(`${PROJECT_ROOT}${PATH_SEPARATOR}${snapshot.themePath}`, bytes);
}

/** Mount one custom font, converting WOFF2 to TTF, and return a diagnostic when it cannot be mounted. */
function mountFont(context: StageContext, deps: MountAssetsDeps, snapshot: ProjectSnapshot, fontPath: string): RenderDiagnostic | null {
  const bytes = readAsset(snapshot, fontPath);
  if (bytes === undefined) {
    return fontWarn(fontPath, `Custom font "${fontPath}" was unavailable and skipped; the default font is used instead.`);
  }
  const extension = extensionOf(fontPath);
  if (PASS_THROUGH_FONT_EXTENSIONS.has(extension)) {
    context.vfs.writeFile(fontMountPath(fontPath, extension), bytes);
    return null;
  }
  if (extension === WOFF2_EXTENSION) {
    context.vfs.writeFile(fontMountPath(fontPath, TTF_EXTENSION), deps.fontConverter.woff2ToTtf(bytes));
    return null;
  }
  return fontWarn(fontPath, `Custom font "${fontPath}" has an unsupported format and was skipped; the default font is used instead.`);
}

/**
 * Build the asset-mount stage. It mounts the project theme and custom fonts into `/project` (WOFF2 via
 * the injected converter), never re-mounts the baked default fonts, and warns — without aborting — on
 * any unavailable or unsupported-format custom font.
 */
export function createMountAssetsStage(deps: MountAssetsDeps): PipelineStage {
  return {
    kind: STAGE_KIND,
    run: async (context: StageContext): Promise<StageResult> => {
      const { snapshot } = context.request;
      mountTheme(context, snapshot);
      const diagnostics: RenderDiagnostic[] = [];
      for (const fontPath of snapshot.fontPaths) {
        const diagnostic = mountFont(context, deps, snapshot, fontPath);
        if (diagnostic !== null) {
          diagnostics.push(diagnostic);
        }
      }
      return { diagnostics };
    },
  };
}
