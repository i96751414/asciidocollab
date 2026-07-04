import type { RenameSymbolKind, RenameSymbolResult } from '@/lib/api/projects';
import type { AppliedRefactor, RefactorResult } from './types';

/**
 * Apply a rename refactor and expose its single-action undo (033, FR-018/FR-019/FR-020).
 *
 * The rewrite reuses the existing project-wide `renameSymbol` endpoint (already Hocuspocus-aware and
 * audited) — no parallel apply path (FR-018a). Only the USAGES are rewritten; the definition already
 * carries the new name because the author typed it (FR-021). Undo re-runs the same reused rename in
 * the opposite direction over the same file set, restoring the prior names in one action (FR-020).
 */

/** Dependencies for {@link applyRename} — the rename call is injected so it is testable. */
export interface ApplyRenameDeps {
  /** The project to refactor. */
  projectId: string;
  /** The reused endpoint's symbol kind (anchor or attribute). */
  symbolKind: RenameSymbolKind;
  /** The name to rewrite from. */
  oldName: string;
  /** The name to rewrite to. */
  newName: string;
  /**
   * Injected project-wide rename (the reused `renameSymbol`).
   *
   * @param projectId - The project to refactor.
   * @param input - The rename request.
   * @param input.symbolKind - The symbol kind (anchor or attribute).
   * @param input.oldName - The name to rewrite from.
   * @param input.newName - The name to rewrite to.
   * @param input.definitionAlreadyRenamed - Whether the definition already carries the new name.
   * @returns The rename outcome.
   */
  renameSymbol: (
    projectId: string,
    input: { symbolKind: RenameSymbolKind; oldName: string; newName: string; definitionAlreadyRenamed?: boolean },
  ) => Promise<RenameSymbolResult>;
}

/**
 * Maps the reused endpoint's result onto the editor-facing {@link RefactorResult}.
 *
 * @param raw - The rename endpoint's raw result.
 * @returns The editor-facing refactor result.
 */
function toRefactorResult(raw: RenameSymbolResult): RefactorResult {
  return {
    rewrittenReferences: raw.updatedReferences,
    rewrittenFiles: raw.rewrittenFiles,
    warnings: raw.warnings,
  };
}

/**
 * Rewrite every usage of `oldName` to `newName` across the project and return the outcome plus an
 * undo that reverses it as a single action.
 *
 * @param deps - The project/kind/names plus the injected rename function.
 * @returns The forward result and a single-action undo.
 */
export async function applyRename(deps: ApplyRenameDeps): Promise<AppliedRefactor> {
  const { projectId, symbolKind, oldName, newName, renameSymbol } = deps;
  // Forward: the author already retyped the definition, so only the old-name references remain to
  // rewrite (definitionAlreadyRenamed). Undo is a normal rename of the new name back to the old
  // (the definition then legitimately carries the old name again).
  const raw = await renameSymbol(projectId, { symbolKind, oldName, newName, definitionAlreadyRenamed: true });
  return {
    result: toRefactorResult(raw),
    undo: async () => toRefactorResult(await renameSymbol(projectId, { symbolKind, oldName: newName, newName: oldName })),
  };
}
