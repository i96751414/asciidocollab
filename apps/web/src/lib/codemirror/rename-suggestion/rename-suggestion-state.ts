import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { StateField, type EditorState, type Extension } from '@codemirror/state';
import type { RenameSymbolKind, RenameSymbolResult, SymbolUsage } from '@/lib/api/projects';
import type { DocumentRange, RefactorResult, RenameSuggestion, SymbolKind } from './types';
import { definitionAtCursor } from './rename-detector';
import { evaluateUsages, isEditedDefinition } from './usage-lookup';
import { applyRename } from './apply-rename';
import { RenameSuggestionWidget } from './rename-suggestion-widget';
import {
  setSuggestionEffect,
  applyRequestEffect,
  dismissRequestEffect,
  undoRequestEffect,
} from './rename-suggestion-effects';

/**
 * The rename-suggestion state machine (033): detection → 2s settle → project-wide usage lookup →
 * inline suggestion → one-click apply/undo, with the leave/return timing.
 *
 * A `StateField` holds the shown suggestion and provides the block widget below the definition; its
 * pure `update` also handles the synchronous clears (revert to the original, or moving to a
 * different definition). The `ViewPlugin` owns the mutable orchestration — baseline capture, the 2s
 * settle and 5s leave timers, the async project-wide lookup, and apply/undo — and only ever
 * dispatches from timer/microtask callbacks (never during an editor update). The apply reuses the
 * existing project-wide `renameSymbol` (no parallel path).
 */

/** Injected configuration — API access + editing context. Timers are overridable for tests. */
export interface RenameSuggestionConfig {
  /** Returns the current project id (read lazily so the extension stays stable). */
  getProjectId: () => string | undefined;
  /** Returns the current open file's node id. */
  getFileNodeId: () => string | undefined;
  /** Returns whether the author may edit — detection is skipped for read-only/observer editors. Defaults to editable. */
  getCanEdit?: () => boolean;
  /**
   * Injected project-wide usage search (the reused `findSymbolUsages`).
   *
   * @param projectId - The project to search.
   * @param name - The symbol name to find.
   * @param kind - Optional kind filter (anchor or attribute).
   * @returns The matching usages across the project.
   */
  findSymbolUsages: (projectId: string, name: string, kind?: RenameSymbolKind) => Promise<SymbolUsage[]>;
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
  /** Delay before a settled rename shows its suggestion. Default 2000ms. */
  settleMs?: number;
  /** Delay before a suggestion hides after the cursor leaves the definition. Default 5000ms. */
  leaveMs?: number;
}

/** Name validity per kind (Principle IX): attribute name, explicit anchor id, or heading-derived id. */
function isValidName(kind: SymbolKind, name: string): boolean {
  if (name.length === 0) return false;
  if (kind === 'attribute') return /^[A-Za-z0-9][\w-]*$/.test(name);
  // Heading-derived ids (Asciidoctor slugs) begin with the `_` idprefix, unlike explicit anchors.
  if (kind === 'heading') return /^[A-Za-z0-9_][\w:.-]*$/.test(name);
  return /^[A-Za-z][\w:.-]*$/.test(name);
}

/** The reused endpoints only distinguish anchor vs attribute; a heading rewrites its derived id. */
function toApiKind(kind: SymbolKind): RenameSymbolKind {
  return kind === 'attribute' ? 'attribute' : 'anchor';
}

/** Build the block-widget decoration for the shown suggestion (below its definition line). */
function buildDecoration(value: RenameSuggestion | null, state: EditorState): DecorationSet {
  if (!value || value.status === 'dismissed') return Decoration.none;
  const line = state.doc.lineAt(value.candidate.definitionRange.from);
  const widget = new RenameSuggestionWidget({
    oldName: value.candidate.oldName,
    newName: value.candidate.newName,
    kind: value.candidate.kind,
    usageCount: value.usageCount,
    fileCount: value.fileCount,
    collision: value.collision,
    applied: value.status === 'applied',
  });
  return Decoration.set([Decoration.widget({ widget, block: true, side: 1 }).range(line.to)]);
}

/** Holds the suggestion currently rendered, provides its decoration, and clears it synchronously. */
export const suggestionField = StateField.define<RenameSuggestion | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setSuggestionEffect)) return effect.value;
    }
    if (!value) return value;

    let next = value;
    if (tr.docChanged) {
      const from = tr.changes.mapPos(value.candidate.definitionRange.from);
      const to = tr.changes.mapPos(value.candidate.definitionRange.to);
      next = { ...value, candidate: { ...value.candidate, definitionRange: { from, to } } };
    }

    if (tr.docChanged || tr.selection) {
      // Synchronous auto-clear: reverting the name, or moving to a different definition, drops the
      // suggestion at once. Merely leaving (cursor off any definition) keeps it — the plugin's 5s
      // timer clears that case via an effect.
      const definition = definitionAtCursor(tr.state);
      if (definition) {
        const shownLine = tr.state.doc.lineAt(next.candidate.definitionRange.from).number;
        const line = tr.state.doc.lineAt(definition.range.from).number;
        if (line !== shownLine) return null;
        if (definition.name === next.candidate.oldName) return null;
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.compute([field], (state) => buildDecoration(state.field(field), state)),
});

/** The baseline captured when the author begins editing a definition. */
interface Session {
  kind: SymbolKind;
  oldName: string;
  lastName: string;
  /** The definition's line number — the session identity; survives name edits, changes per definition. */
  line: number;
}

const DEFAULT_SETTLE_MS = 2000;
const DEFAULT_LEAVE_MS = 5000;

function makePlugin(config: RenameSuggestionConfig) {
  const settleMs = config.settleMs ?? DEFAULT_SETTLE_MS;
  const leaveMs = config.leaveMs ?? DEFAULT_LEAVE_MS;

  return ViewPlugin.fromClass(
    class {
      private session: Session | null = null;
      private settleTimer: ReturnType<typeof setTimeout> | null = null;
      private leaveTimer: ReturnType<typeof setTimeout> | null = null;
      private seq = 0;
      private dismissedName: string | null = null;
      private undo: (() => Promise<RefactorResult>) | null = null;
      /** Set on destroy so a late async callback never dispatches on a torn-down view. */
      private destroyed = false;
      /** In-flight apply guard so a double-click cannot fire two renames. */
      private applying = false;

      constructor(private readonly view: EditorView) {}

      update(update: ViewUpdate) {
        for (const tr of update.transactions) {
          for (const effect of tr.effects) {
            // Widget button requests arrive as effects; handle them in a microtask so the resulting
            // dispatch never runs while an update is in progress.
            if (effect.is(applyRequestEffect)) void Promise.resolve().then(() => this.apply());
            else if (effect.is(dismissRequestEffect)) void Promise.resolve().then(() => this.dismiss());
            else if (effect.is(undoRequestEffect)) void Promise.resolve().then(() => this.runUndo());
          }
        }
        if (update.docChanged || update.selectionSet) this.track(update.state);
      }

      destroy() {
        this.destroyed = true;
        this.clearSettle();
        this.clearLeave();
      }

      /** Manage the baseline session, the 2s settle timer, and the 5s leave timer. No dispatch here. */
      private track(state: EditorState) {
        // Read-only / observer editors never rename; a remote edit must not surface an offer to them.
        if (config.getCanEdit && !config.getCanEdit()) {
          this.clearSettle();
          return;
        }
        const definition = definitionAtCursor(state);

        if (!definition) {
          this.clearSettle();
          // An applied suggestion keeps its Undo affordance until dismissed — it must not be hidden
          // by the leave timer. Only a live offer disappears after leaving.
          const shown = this.view.state.field(suggestionField);
          if (shown && shown.status !== 'applied' && !this.leaveTimer) {
            this.leaveTimer = setTimeout(() => {
              this.leaveTimer = null;
              this.setSuggestion(null);
            }, leaveMs);
          }
          return;
        }

        this.clearLeave(); // back on a definition → cancel any pending disappearance

        const line = state.doc.lineAt(definition.range.from).number;
        if (!this.session || this.session.line !== line) {
          this.session = { kind: definition.kind, oldName: definition.name, lastName: definition.name, line };
          this.dismissedName = null;
          this.clearSettle();
          return;
        }

        const newName = definition.name;
        if (newName === this.session.lastName) return; // cursor moved, name unchanged → keep
        this.session.lastName = newName;

        if (newName === this.session.oldName) {
          this.clearSettle(); // reverted → the field clears the suggestion synchronously
          return;
        }
        if (newName === this.dismissedName) return; // dismissed this settled name

        this.clearSettle();
        const session = this.session;
        this.settleTimer = setTimeout(() => {
          this.settleTimer = null;
          // Re-read the definition from the CURRENT state so its range reflects any edits (e.g. a
          // collaborator inserting lines above) that happened while the settle was pending.
          const current = definitionAtCursor(this.view.state);
          const range = current && current.name === newName ? current.range : definition.range;
          void this.evaluate(session, newName, range);
        }, settleMs);
      }

      /** After the settle, look up project-wide usages + collision and show or suppress the suggestion. */
      private async evaluate(session: Session, newName: string, definitionRange: DocumentRange) {
        if (!isValidName(session.kind, newName)) return;
        const projectId = config.getProjectId();
        const fileNodeId = config.getFileNodeId();
        if (!projectId || !fileNodeId) return;

        const apiKind = toApiKind(session.kind);
        const seq = ++this.seq;
        let usages: SymbolUsage[];
        let collisionUsages: SymbolUsage[];
        try {
          [usages, collisionUsages] = await Promise.all([
            config.findSymbolUsages(projectId, session.oldName, apiKind),
            config.findSymbolUsages(projectId, newName, apiKind),
          ]);
        } catch {
          // A failed lookup (e.g. rate limit / network) simply produces no suggestion this settle;
          // the next edit re-arms detection. Never leave the promise rejection unhandled.
          return;
        }
        if (this.destroyed || seq !== this.seq) return; // torn down, or a newer settle superseded this one

        const impact = evaluateUsages(usages, { definitionFileNodeId: fileNodeId, definitionRange });
        const collision = collisionUsages.some(
          (u) => u.kind === 'definition' && !isEditedDefinition(u, fileNodeId, definitionRange),
        );

        if (impact.suppressed && !collision) {
          this.setSuggestion(null); // nothing to refactor
          return;
        }
        this.setSuggestion({
          candidate: { kind: session.kind, oldName: session.oldName, newName, definitionRange },
          usageCount: impact.usageCount,
          fileCount: impact.fileCount,
          status: collision ? 'blocked-collision' : 'visible',
          collision,
        });
      }

      /** Apply via the reused endpoint, then switch the widget to its undo affordance. */
      private async apply() {
        const suggestion = this.view.state.field(suggestionField);
        if (this.applying || !suggestion || suggestion.collision || suggestion.status === 'applied') return;
        const projectId = config.getProjectId();
        if (!projectId) return;
        const { kind, oldName, newName } = suggestion.candidate;
        this.applying = true; // in-flight lock: a second click must not fire a duplicate rename
        try {
          const { undo } = await applyRename({
            projectId,
            symbolKind: toApiKind(kind),
            oldName,
            newName,
            renameSymbol: config.renameSymbol,
          });
          if (this.destroyed) return;
          this.undo = undo;
          this.dismissedName = newName; // a re-detected mismatch must not re-suggest this settled rename
          this.session = null;
          this.clearSettle();
          this.setSuggestion({ ...suggestion, status: 'applied' });
        } catch {
          // The rewrite failed (e.g. rate limit / network / conflict): leave the offer visible so the
          // author can retry, rather than stranding the widget in a half-applied state.
        } finally {
          this.applying = false;
        }
      }

      private async runUndo() {
        const undo = this.undo;
        if (!undo) return;
        try {
          await undo();
        } catch {
          return; // keep this.undo so the author can retry the undo
        }
        this.undo = null;
        if (!this.destroyed) this.setSuggestion(null);
      }

      private dismiss() {
        const suggestion = this.view.state.field(suggestionField);
        if (suggestion) this.dismissedName = suggestion.candidate.newName;
        this.clearLeave();
        this.setSuggestion(null);
      }

      private setSuggestion(value: RenameSuggestion | null) {
        if (this.destroyed || this.view.state.field(suggestionField) === value) return;
        this.view.dispatch({ effects: setSuggestionEffect.of(value) });
      }

      private clearSettle() {
        if (this.settleTimer) {
          clearTimeout(this.settleTimer);
          this.settleTimer = null;
        }
      }

      private clearLeave() {
        if (this.leaveTimer) {
          clearTimeout(this.leaveTimer);
          this.leaveTimer = null;
        }
      }
    },
  );
}

/** The complete rename-suggestion extension (state field + orchestration plugin). */
export function renameSuggestion(config: RenameSuggestionConfig): Extension {
  return [suggestionField, makePlugin(config)];
}
