/**
 * Port for the single sandbox path-resolution rule (Constitution IX) and its
 * inverse, both implemented once in `@asciidocollab/shared`. The move/rename
 * use cases need them to (1) confine user-authored reference targets to the
 * project sandbox before matching, and (2) recompute a relative target after a
 * referenced file moves. The domain depends only on this interface; the
 * composition root injects the shared implementation.
 */

/** Discriminated result of a sandboxed-path resolution. */
export type SandboxedPathResult =
  | {
      /** Resolution succeeded. */
      ok: true;
      /** Normalized, project-relative POSIX path. */
      path: string;
    }
  | {
      /** Resolution was rejected. */
      ok: false;
      /** Why the target was rejected. */
      reason: 'absolute' | 'remote' | 'traversal' | 'empty' | 'invalid';
    };

/** Sandbox-confined resolution of reference targets, plus its relative-path inverse. */
export interface PathResolver {
  /**
   * Resolve `target` (referenced from `fromPath`) to a sandboxed project-relative path.
   *
   * @param fromPath - The project-relative path of the referencing file.
   * @param target - The raw, user-authored reference target.
   * @returns The sandboxed resolution result.
   */
  resolveSandboxedPath(fromPath: string, target: string): SandboxedPathResult;
  /**
   * Build the relative target that, written in `fromFile`, points at `toFile`.
   *
   * @param fromFile - The project-relative path of the referencing file.
   * @param toFile - The project-relative path of the referenced file.
   * @returns A relative POSIX target.
   */
  relativeProjectPath(fromFile: string, toFile: string): string;
}
