import { ProjectId } from '../../value-objects/project-id';
import { FileNodeId } from '../../value-objects/file-node-id';
import { FilePath } from '../../value-objects/file-path';
import { FileNode } from '../../entities/file-node';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { ProjectRepository } from '../../ports/project/project.repository';
import { ProjectFileStore } from '../../ports/storage/project-file-store';
import { ReferenceExtractor, Reference } from '../../ports/asciidoc/reference-extractor';
import { PathResolver } from '../../ports/asciidoc/path-resolver';

/** File extensions treated as AsciiDoc documents (a valid main-file target). */
const ASCIIDOC_EXTENSIONS = ['.adoc', '.asciidoc', '.asc', '.ad'];

/** Whether `name` is an AsciiDoc document by extension (used for FR-070 main-file validity). */
export function isAsciiDocumentFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return ASCIIDOC_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/** Strip leading slashes so a `/docs/a.adoc` FilePath becomes the sandbox-relative `docs/a.adoc`. */
export function stripLeadingSlash(path: string): string {
  return path.replace(/^\/+/, '');
}

/**
 * Build the old → new project-relative path map for a node that moved/renamed
 * from `fileNode.path` to `newPath` — a single entry for a file, or every
 * descendant file for a folder. Must be called BEFORE the path cascade so the
 * descendants still carry their old paths (FR-066). Shared by move and rename.
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
  /** Pure AsciiDoc reference extraction (shared implementation injected). */
  extractor: ReferenceExtractor;
  /** Sandbox path resolution + its relative inverse (shared implementation injected). */
  pathResolver: PathResolver;
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
 * more files change path (US12/FR-066), so the references keep resolving. Only
 * targets that resolve (sandbox-confined) to a changed path are touched; each
 * is replaced by the relative path from the referencing file to the new
 * location. A reference that cannot be safely rewritten is reported as a
 * warning rather than silently broken (FR-067).
 *
 * @param deps - Injected repositories, file store, extractor and path resolver.
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

  for (const node of documents) {
    const buffer = await deps.fileStore.read(projectId, node.path);
    if (!buffer) continue;
    const content = buffer.toString('utf8');
    const fromPath = stripLeadingSlash(node.path.value);

    const references = deps.extractor
      .extractReferences(node.id.value, content)
      .filter((reference) => reference.kind !== 'attributeRef');

    const edits: Array<{ from: number; to: number; replacement: string }> = [];
    for (const reference of references) {
      const { pathPart, fragment } = splitTarget(reference);
      if (pathPart === '') continue;

      const resolved = deps.pathResolver.resolveSandboxedPath(fromPath, pathPart);
      if (!resolved.ok) continue; // out-of-sandbox / unresolvable: not ours to touch
      const newRelative = pathChanges.get(resolved.path);
      if (newRelative === undefined) continue; // does not point at a changed file

      const newTarget = deps.pathResolver.relativeProjectPath(fromPath, newRelative);
      // FR-067: refuse to write a target that would not resolve back to the new location.
      const verification = deps.pathResolver.resolveSandboxedPath(fromPath, newTarget);
      if (!verification.ok || verification.path !== newRelative) {
        warnings.push(`Could not rewrite reference to "${pathPart}" in ${fromPath}`);
        continue;
      }

      const oldRaw = fragment === undefined ? pathPart : `${pathPart}#${fragment}`;
      const newRaw = fragment === undefined ? newTarget : `${newTarget}#${fragment}`;
      const slice = content.slice(reference.range.from, reference.range.to);
      const replacedSlice = slice.replace(oldRaw, newRaw);
      if (replacedSlice !== slice) {
        edits.push({ from: reference.range.from, to: reference.range.to, replacement: replacedSlice });
      }
    }

    if (edits.length === 0) continue;
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
 * main file (FR-070: a deleted / renamed-to-non-adoc main file must not be left
 * dangling). Resolution then falls back to current-file-only (FR-047).
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
