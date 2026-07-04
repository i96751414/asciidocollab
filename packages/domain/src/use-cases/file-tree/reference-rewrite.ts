import { ProjectId } from '../../value-objects/ids/project-id';
import { FileNodeId } from '../../value-objects/ids/file-node-id';
import { FilePath } from '../../value-objects/files/file-path';
import { FileNode } from '../../entities/file-node';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { DocumentRepository } from '../../ports/file-tree/document.repository';
import { ProjectRepository } from '../../ports/project/project.repository';
import { ProjectFileStore } from '../../ports/storage/project-file-store';
import { CollaborativeContentEditor, ContentReplacement } from '../../ports/storage/collaborative-content-editor';
import { CollaborativeContentReader } from '../../ports/storage/collaborative-content-reader';
import { Logger } from '../../ports/observability/logger';
import { Reference } from '../../types/asciidoc';
import { extractReferences } from '@asciidocollab/asciidoc-core';
import { resolveFileContent, liveContentDeps } from '../content/live-content';
import { isAsciiDocumentFileName } from '../../value-objects/files/asciidoc-file-name';
import { resolveSandboxedPath } from '../../value-objects/files/sandboxed-path';
import { relativeProjectPath } from '../../value-objects/files/relative-project-path';
import { dedupeReplacements } from '../content/content-replacements';

/** Strip leading slashes so a `/docs/a.adoc` FilePath becomes the sandbox-relative `docs/a.adoc`. */
export function stripLeadingSlash(path: string): string {
  return path.replace(/^\/+/, '');
}

/**
 * Build the old → new project-relative path map for a node that moved/renamed
 * from `fileNode.path` to `newPath` — a single entry for a file, or every
 * descendant file for a folder. Must be called BEFORE the path cascade so the
 * descendants still carry their old paths. Shared by move and rename.
 *
 * @param fileNodeRepo - Repository used to enumerate folder descendants.
 * @param fileNode - The node being moved/renamed (with its current path).
 * @param newPath - The node's destination path.
 * @returns Map of old → new project-relative (no leading slash) file paths.
 */
export async function capturePathChanges(
  fileNodeRepo: FileNodeRepository,
  fileNode: FileNode,
  newPath: FilePath,
): Promise<Map<string, string>> {
  if (fileNode.type.value === 'folder') {
    return collectFolderFilePathChanges(fileNodeRepo, fileNode.id, fileNode.path.value + '/', newPath.value + '/');
  }
  return new Map([[stripLeadingSlash(fileNode.path.value), stripLeadingSlash(newPath.value)]]);
}

/** Dependencies the cross-file reference rewrite needs, all injected at the composition root. */
export interface ReferenceRewriteDeps {
  /** Lists the project's file nodes to scan for references. */
  fileNodeRepo: FileNodeRepository;
  /** Reads/writes the persisted file content being rewritten. */
  fileStore: ProjectFileStore;
  /**
   * Optional: resolves a file node's collaborative {@link Document}. When provided together with
   * {@link collaborativeContentEditor}, a referencing file that has a Document is rewritten through
   * the Yjs source of truth instead of the file store (avoiding the live-clobber bug).
   */
  documentRepo?: Pick<DocumentRepository, 'findByFileNodeId'>;
  /** Optional: applies the rewrite to a document's live Yjs content (source of truth). */
  collaborativeContentEditor?: CollaborativeContentEditor;
  /**
   * Optional: reads the live Yjs content of an open referencing file. When supplied (with
   * {@link documentRepo}), the SCAN reads that live content — exactly what the editor shows —
   * instead of the possibly-stale file store, so a reference the user just typed but has not saved
   * is still found and rewritten. Mirrors the symbol-rename scan (see {@link resolveFileContent}).
   */
  collaborativeContentReader?: CollaborativeContentReader;
  /** Optional logger for live-read fallbacks. */
  logger?: Logger;
}

/** A reference edit located by offset within its file, with the literal text it replaces. */
interface ReferenceEdit {
  from: number;
  to: number;
  find: string;
  replacement: string;
}

/** Collapse edits to a unique find→replace map (a reference macro may appear more than once). */
function toReplacements(edits: ReferenceEdit[]): ContentReplacement[] {
  return dedupeReplacements(edits.map((edit) => ({ find: edit.find, replace: edit.replacement })));
}

/** Split a reference target into its path part and optional `#fragment` (xref only). */
function splitTarget(reference: Reference): { pathPart: string; fragment?: string } {
  if (reference.kind === 'include' || reference.kind === 'image') {
    return { pathPart: reference.target };
  }
  // xref: `path.adoc#frag`, `#frag` (same file), or a bare `id` (same file).
  const hashIndex = reference.target.indexOf('#');
  const left = hashIndex === -1 ? reference.target : reference.target.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? undefined : reference.target.slice(hashIndex + 1);
  // Only a target that looks like a path (has an extension or a directory separator) is a
  // cross-file reference; a bare `<<intro>>` is a same-file anchor and must be left alone.
  if (left === '' || (!left.includes('/') && !left.includes('.'))) return { pathPart: '' };
  return { pathPart: left, fragment };
}

/**
 * Rewrite `include::`/`image::`/`xref:` targets across the project after one or
 * more files change path, so the references keep resolving. Only
 * targets that resolve (sandbox-confined) to a changed path are touched; each
 * is replaced by the relative path from the referencing file to the new
 * location. A reference that cannot be safely rewritten is reported as a
 * warning rather than silently broken.
 *
 * @param deps - Injected repositories and file store.
 * @param projectId - The project whose files are scanned.
 * @param pathChanges - Map of old → new project-relative (no leading slash) paths.
 * @returns The number of files rewritten and any unresolved-reference warnings.
 */
export async function rewriteReferencesForPathChanges(
  deps: ReferenceRewriteDeps,
  projectId: ProjectId,
  pathChanges: Map<string, string>,
): Promise<{ rewrittenFiles: number; warnings: string[] }> {
  if (pathChanges.size === 0) return { rewrittenFiles: 0, warnings: [] };

  const nodes = await deps.fileNodeRepo.findByProjectId(projectId);
  const documents = nodes.filter((node) => node.type.value === 'file' && isAsciiDocumentFileName(node.name));
  let rewrittenFiles = 0;
  const warnings: string[] = [];

  // Read each file's CURRENT content for the scan: live Yjs content for a file open in a collab
  // room (so an unsaved reference is still found), else the file store. Built once, reused per file.
  const contentDeps = liveContentDeps({
    fileStore: deps.fileStore,
    ...(deps.documentRepo && { documentRepo: deps.documentRepo }),
    ...(deps.collaborativeContentReader && { collaborativeContentReader: deps.collaborativeContentReader }),
    ...(deps.logger && { logger: deps.logger }),
  });

  for (const node of documents) {
    const resolved = await resolveFileContent(contentDeps, projectId, node);
    if (!resolved) continue;
    const { content, document } = resolved;
    const fromPath = stripLeadingSlash(node.path.value);

    const references = extractReferences(node.id.value, content)
      .filter((reference) => reference.kind !== 'attributeRef');

    const edits: ReferenceEdit[] = [];
    for (const reference of references) {
      const { pathPart, fragment } = splitTarget(reference);
      if (pathPart === '') continue;
      // A target with `{attr}` references is templated; we can't rewrite it to a literal
      // relative path without losing the variable, so leave it untouched on move/rename.
      if (pathPart.includes('{')) continue;

      const resolved = resolveSandboxedPath(fromPath, pathPart);
      if (!resolved.ok) continue; // out-of-sandbox / unresolvable: not ours to touch
      const newRelative = pathChanges.get(resolved.path);
      if (newRelative === undefined) continue; // does not point at a changed file

      const newTarget = relativeProjectPath(fromPath, newRelative);
      // Refuse to write a target that would not resolve back to the new location.
      const verification = resolveSandboxedPath(fromPath, newTarget);
      if (!verification.ok || verification.path !== newRelative) {
        warnings.push(`Could not rewrite reference to "${pathPart}" in ${fromPath}`);
        continue;
      }

      const oldRaw = fragment === undefined ? pathPart : `${pathPart}#${fragment}`;
      const newRaw = fragment === undefined ? newTarget : `${newTarget}#${fragment}`;
      const slice = content.slice(reference.range.from, reference.range.to);
      const replacedSlice = slice.replace(oldRaw, newRaw);
      if (replacedSlice !== slice) {
        edits.push({ from: reference.range.from, to: reference.range.to, find: slice, replacement: replacedSlice });
      }
    }

    if (edits.length === 0) continue;

    // Source-of-truth routing: if the referencing file is a collaborative Document it may be open
    // for live editing, where the Yjs document — not the file store — is authoritative. Writing the
    // file store directly would be invisible to editors AND overwritten by the next Yjs writeback,
    // silently reverting the rewrite. Apply the edit through the collab editor instead; the file
    // store is then persisted by the collab server's normal writeback. Files without a Document
    // (never opened collaboratively) keep the direct file-store path. The Document was already
    // resolved by the content scan above (resolveFileContent), so no second lookup is needed.
    if (document && deps.collaborativeContentEditor) {
      const applied = await deps.collaborativeContentEditor.applyReplacements(
        projectId,
        document.yjsStateId,
        toReplacements(edits),
      );
      if (!applied.success) {
        // Do NOT fall back to a file-store write: if the room is live, the stale Y.Text would
        // overwrite it on the next writeback. Leave the reference untouched and warn instead.
        warnings.push(`Could not apply collaborative reference rewrite in ${fromPath}: ${applied.error.message}`);
        continue;
      }
      if (applied.value === 0) {
        // Transport succeeded but no occurrence matched the live Y.Text: it diverged from the
        // content we scanned. Report it rather than counting a rewrite that did not take effect.
        warnings.push(`No references rewritten in ${fromPath}: the live document diverged from the scan`);
        continue;
      }
      rewrittenFiles += 1;
      continue;
    }

    // Apply right-to-left so earlier offsets stay valid as later slices are spliced in.
    edits.sort((a, b) => b.from - a.from);
    let next = content;
    for (const edit of edits) next = next.slice(0, edit.from) + edit.replacement + next.slice(edit.to);
    await deps.fileStore.write(projectId, node.path, Buffer.from(next, 'utf8'));
    rewrittenFiles += 1;
  }

  return { rewrittenFiles, warnings };
}

/**
 * Walk the descendants of a moved/renamed folder and build the old → new
 * project-relative path map for every FILE beneath it, so references to any of
 * them can be rewritten. Reads current (pre-cascade) paths from the repository.
 *
 * @param fileNodeRepo - Repository to enumerate descendants.
 * @param folderId - The folder being moved/renamed.
 * @param oldPrefix - The folder's current path with a trailing slash (e.g. `/a/`).
 * @param newPrefix - The folder's destination path with a trailing slash (e.g. `/b/`).
 * @returns Map of old → new project-relative (no leading slash) file paths.
 */
export async function collectFolderFilePathChanges(
  fileNodeRepo: FileNodeRepository,
  folderId: FileNodeId,
  oldPrefix: string,
  newPrefix: string,
): Promise<Map<string, string>> {
  const changes = new Map<string, string>();
  const walk = async (parentId: FileNodeId): Promise<void> => {
    for (const child of await fileNodeRepo.findByParentId(parentId)) {
      if (child.type.value === 'file') {
        const oldPath = child.path.value;
        const newPath = newPrefix + oldPath.slice(oldPrefix.length);
        changes.set(stripLeadingSlash(oldPath), stripLeadingSlash(newPath));
      } else {
        await walk(child.id);
      }
    }
  };
  await walk(folderId);
  return changes;
}

/**
 * Clear the project's configured main file when `predicate` matches the current
 * main file (a deleted / renamed-to-non-adoc main file must not be left
 * dangling). Resolution then falls back to current-file-only.
 *
 * @param projectRepo - Repository to load/persist the project.
 * @param projectId - The project to inspect.
 * @param predicate - True when the current main file should be cleared.
 * @returns True when the configuration was cleared, false otherwise.
 */
export async function clearMainFileIfMatches(
  projectRepo: ProjectRepository,
  projectId: ProjectId,
  predicate: (mainFileNodeId: FileNodeId) => boolean,
): Promise<boolean> {
  const project = await projectRepo.findById(projectId);
  if (!project || project.mainFileNodeId === null) return false;
  if (!predicate(project.mainFileNodeId)) return false;
  project.setMainFile(null);
  await projectRepo.save(project);
  return true;
}
