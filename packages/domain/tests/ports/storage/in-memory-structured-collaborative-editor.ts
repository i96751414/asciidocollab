import {
  StructuredCollaborativeEditor,
  StructuredReplacementSpec,
} from '../../../src/ports/storage/structured-collaborative-editor';
import { ProjectId } from '../../../src/value-objects/ids/project-id';
import { YjsStateId } from '../../../src/value-objects/ids/yjs-state-id';
import { Result } from '../../../src/types/result';
import { RegexEngine, MatchBudget } from '../../../src/ports/text/regex-engine';
import { computeMatches, selectSpans } from '../../../src/use-cases/content/text-match';

const UNBOUNDED: MatchBudget = { maxMatches: 1_000_000, deadline: Number.POSITIVE_INFINITY };

/**
 * In-memory {@link StructuredCollaborativeEditor} for domain tests. It models
 * the live document as a plain string keyed by `yjsStateId`, then re-matches and
 * rewrites exactly as the real collab apply does (compute spans on the CURRENT
 * content, keep only confirmed non-stale selections, apply right-to-left). This
 * mirrors the live stale-skip semantics without any Yjs/Hocuspocus dependency.
 */
export class InMemoryStructuredCollaborativeEditor implements StructuredCollaborativeEditor {
  private readonly documents = new Map<string, string>();

  constructor(private readonly engine: RegexEngine) {}

  /** Seed a document's live content for a `yjsStateId`. */
  seed(yjsStateId: YjsStateId, content: string): void {
    this.documents.set(yjsStateId.value, content);
  }

  /** Read a document's current content (post-apply), for assertions. */
  contentOf(yjsStateId: YjsStateId): string | undefined {
    return this.documents.get(yjsStateId.value);
  }

  async applyStructuredReplacement(
    _projectId: ProjectId,
    yjsStateId: YjsStateId,
    spec: StructuredReplacementSpec,
  ): Promise<Result<number, Error>> {
    const content = this.documents.get(yjsStateId.value) ?? '';
    const matched = computeMatches(content, spec.query, this.engine, UNBOUNDED);
    if (!matched.success) return { success: false, error: new Error(matched.error.message) };

    const edits = selectSpans(matched.value, spec.selections, spec.replacement, spec.query.mode);
    // Edits are right-to-left, so earlier offsets stay valid as we splice.
    let next = content;
    for (const edit of edits) {
      next = next.slice(0, edit.from) + edit.replacement + next.slice(edit.to);
    }
    this.documents.set(yjsStateId.value, next);
    return { success: true, value: edits.length };
  }
}
