import { isImageFile } from './asciidoc-image-extensions';
import { relativeIncludePath, relativeImagePath, NO_ATTRIBUTES } from '@/lib/asciidoc/include-path';

/**
 * Builds the AsciiDoc macro for a file dropped from the tree into the editor:
 * `image::` for images (alt defaults to the filename stem), `include::` for everything else.
 *
 * The dropped `path` is project-relative, but AsciiDoc resolves macro targets relative to the
 * authoring file (and, for images, relative to `:imagesdir:`), so the target is rewritten relative
 * to `fromPath` — without it the directive would be wrong for any file not at the project root.
 *
 * @param path - The dropped file's project-relative path.
 * @param fromPath - The open (authoring) file's project-relative path, or null when unknown.
 * @param attributes - Project attribute map (supplies `imagesdir` for image targets).
 */
export function buildFileMacro(
  path: string,
  fromPath: string | null = null,
  attributes: ReadonlyMap<string, string> = NO_ATTRIBUTES,
): string {
  const name = path.split('/').pop() ?? path;
  const stem = name.replace(/\.[^.]+$/, '');
  // Images resolve relative to the project root (+ imagesdir), so the macro target ignores the
  // authoring file's folder; includes resolve relative to the authoring file.
  if (isImageFile(name)) return `image::${relativeImagePath(path, attributes)}[${stem}]`;
  return `include::${relativeIncludePath(fromPath, path)}[]`;
}

/**
 * Parses the editor drop payload (JSON `{ path }` set by the file tree) and returns the macro to
 * insert, or null when the payload carries no usable path.
 *
 * @param raw - The raw dataTransfer payload.
 * @param fromPath - The open file's project-relative path, used to relativize the target.
 * @param attributes - Project attribute map (supplies `imagesdir` for image targets).
 */
export function macroFromDropPayload(
  raw: string,
  fromPath: string | null = null,
  attributes: ReadonlyMap<string, string> = NO_ATTRIBUTES,
): string | null {
  let path = '';
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'path' in parsed && typeof parsed.path === 'string') {
      path = parsed.path;
    }
  } catch {
    return null;
  }
  if (!path) return null;
  return buildFileMacro(path, fromPath, attributes);
}

/**
 * Pads a block macro with newlines only where needed so it lands on its own line. `charBefore`/
 * `charAfter` are the characters adjacent to the insertion point, or null at the document edges.
 */
export function padBlockMacro(macro: string, charBefore: string | null, charAfter: string | null): string {
  const before = charBefore !== null && charBefore !== '\n' ? '\n' : '';
  const after = charAfter !== null && charAfter !== '\n' ? '\n' : '';
  return `${before}${macro}${after}`;
}

// Block (image::) and inline (image:) image macros, plus include::; the capture is the path target.
const MACRO_PATH = /(?:include|image)::?([^[\n]+)\[/;

/**
 * Locates the path span of an include::/image:: macro within a line (column offsets), for the
 * Ctrl+click hover tooltip. Returns null when the line has no such macro.
 */
export function macroPathRange(lineText: string): { start: number; end: number } | null {
  const match = MACRO_PATH.exec(lineText);
  if (!match) return null;
  const start = match.index + match[0].indexOf(match[1]);
  return { start, end: start + match[1].length };
}
