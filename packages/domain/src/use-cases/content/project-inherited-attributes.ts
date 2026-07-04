import { buildIncludeGraphWithInheritance } from '@asciidocollab/asciidoc-core';
import { resolveSandboxedPath } from '../../value-objects/files/sandboxed-path';

/** A project AsciiDoc document paired with the content the scan parses. */
export interface ScannedDocument {
  /** The file node id (the symbol/reference `fileId`). */
  fileId: string;
  /** The project-relative path, with no leading slash (the include-resolution base). */
  path: string;
  /** The document's full text (the same snapshot the scan reads). */
  content: string;
}

/**
 * The attributes each document inherits from the documents that include it, rooted at the project
 * main file. This is what lets a heading's auto-generated id reflect an `idprefix`/`idseparator`
 * (or `sectids`) a PARENT set above the include — matching what the preview renders and what the
 * editor's symbol index resolves, so find-usages and rename derive the same section ids the author
 * actually references. Passing these into `extractSymbols(fileId, content, seed)` is the single
 * reason the domain scan agrees with the editor on cross-file id generation.
 *
 * Returns an empty map when no main file is configured: with no root there is no include tree, so
 * every document is standalone and inherits nothing (the pre-existing per-file behaviour, which is
 * already correct for that case). Files unreachable from the root also inherit nothing.
 *
 * The include walk resolves each `{attr}`-substituted target through {@link resolveSandboxedPath}
 * (Constitution IX: include targets are user-controlled and must be confined to the project). No
 * render-intrinsic seed is supplied, so an include gated ONLY by a backend conditional
 * (`ifdef::backend-…[]`) is not walked here — an accepted, narrow imperfection versus the preview
 * that never affects unconditional includes.
 *
 * @param documents - Every AsciiDoc document in the project, with its resolved content.
 * @param mainFileId - The configured main file id, or null when none is set.
 * @returns File id → inherited attributes (lowercase name → value); empty for the root and
 *   unreachable files.
 */
export function projectInheritedAttributes(
  documents: readonly ScannedDocument[],
  mainFileId: string | null,
): Map<string, ReadonlyMap<string, string>> {
  if (mainFileId === null) return new Map();
  const byId = new Map(documents.map((document) => [document.fileId, document]));
  if (!byId.has(mainFileId)) return new Map();
  const byPath = new Map(documents.map((document) => [document.path, document.fileId]));

  const readContent = (fileId: string): string | null => byId.get(fileId)?.content ?? null;
  const resolveInclude = (fromFileId: string, target: string): string | null => {
    const from = byId.get(fromFileId);
    if (!from) return null;
    const sandboxed = resolveSandboxedPath(from.path, target);
    return sandboxed.ok ? (byPath.get(sandboxed.path) ?? null) : null;
  };

  return buildIncludeGraphWithInheritance(mainFileId, readContent, resolveInclude).inheritedAttributes;
}
