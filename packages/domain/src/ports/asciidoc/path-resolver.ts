/**
 * Port for the single sandbox path-resolution rule (Constitution IX). The
 * move/rename use cases need it to confine user-authored reference targets to
 * the project sandbox before matching. The domain depends only on this
 * interface; the composition root injects the implementation. The inverse
 * helper `relativeProjectPath` is pure domain path logic and lives in the
 * domain directly at `src/project-path/relative-project-path.ts`.
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

/** Sandbox-confined resolution of user-authored reference targets (Constitution IX). */
export interface PathResolver {
  /**
   * Resolve `target` (referenced from `fromPath`) to a sandboxed project-relative path.
   *
   * @param fromPath - The project-relative path of the referencing file.
   * @param target - The raw, user-authored reference target.
   * @returns The sandboxed resolution result.
   */
  resolveSandboxedPath(fromPath: string, target: string): SandboxedPathResult;
}
