import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { StateField, type EditorState, type Extension } from '@codemirror/state';
import { isValidNewName } from '@asciidocollab/asciidoc-core';
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
  contentChangedRefreshEffect,
} from './rename-suggestion-effects';

/**
 * The rename-suggestion state machine (033): detection → 1s settle → project-wide usage lookup →
 * inline suggestion → one-click apply/undo, with the leave/return timing.
 *
 * A `StateField` holds the shown suggestion and provides the block widget below the definition; its
 * pure `update` also handles the synchronous transitions: it clears on a revert to the original or a
 * move to a different definition, and — once an offer is open — updates it in place as the author
 * keeps typing (rather than flashing it closed and re-opening after the next settle). The
 * `ViewPlugin` owns the mutable orchestration — baseline capture, the 1s settle and 5s leave timers,
 * the async project-wide lookup, and apply/undo — and only ever dispatches from timer/microtask
 * callbacks (never during an editor update). The apply reuses the existing project-wide
 * `renameSymbol` (no parallel path).
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
  /** Delay before a settled rename shows its suggestion. Default 1000ms. */
  settleMs?: number;
  /** Delay before a suggestion hides after the cursor leaves the definition. Default 5000ms. */
  leaveMs?: number;
  /** Debounce before a content-changed signal re-queries a visible suggestion's counts. Default 300ms. */
  refreshMs?: number;
}

/** The reused endpoints only distinguish anchor vs attribute; a heading rewrites its derived id. */
function toApiKind(kind: SymbolKind): RenameSymbolKind {
  return kind === 'attribute' ? 'attribute' : 'anchor';
}

/**
 * Name validity per kind (Principle IX), delegated to the server's authoritative validator in
 * `@asciidocollab/asciidoc-core` so the widget can never offer or block a rename the backend would
 * decide oppositely. A heading's derived id maps to the anchor kind, matching the rewrite path.
 */
function isValidName(kind: SymbolKind, name: string): boolean {
  return isValidNewName(toApiKind(kind), name);
}

/** Build the block-widget decoration for the shown suggestion (below its definition line). */
function buildDecoration(value: RenameSuggestion | null, state: EditorState): DecorationSet {
  if (!value) return Decoration.none;
  // Clamp: an async settle can produce an offer whose captured definitionRange predates a deletion
  // that shrank the document (a collaborator or a fast local delete during the usage lookup), so
  // `from` may exceed the current length. lineAt() would throw a RangeError inside this compute and
  // break the editor update; clamping renders the widget at the document end until the next edit
  // re-maps or clears it.
  const from = Math.min(value.candidate.definitionRange.from, state.doc.length);
  const line = state.doc.lineAt(from);
  const widget = new RenameSuggestionWidget({
    oldName: value.candidate.oldName,
    newName: value.candidate.newName,
    kind: value.candidate.kind,
    usageCount: value.usageCount,
    fileCount: value.fileCount,
    collision: value.collision,
    revalidating: value.revalidating,
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
      // Synchronous transitions for a LIVE offer as the author keeps editing the definition. Merely
      // leaving (cursor off any definition) keeps it — the plugin's 5s leave timer clears that case
      // via an effect. An applied suggestion keeps its Undo affordance and is exempt from these
      // checks.
      const definition = definitionAtCursor(tr.state);
      if (definition) {
        const shownLine = tr.state.doc.lineAt(next.candidate.definitionRange.from).number;
        const line = tr.state.doc.lineAt(definition.range.from).number;
        // Moving to a different definition drops the current offer (live or applied) at once.
        if (line !== shownLine) return null;
        if (next.status !== 'applied') {
          // Reverting to the original name leaves nothing to rename → drop the offer.
          if (definition.name === next.candidate.oldName) return null;
          // The author typed on to a *different* new name. Keep the dialog open and update it in
          // place — showing the current name and its range immediately, so Apply can never rewrite
          // references to a name the definition no longer carries — rather than flashing it closed
          // and re-opening after the next settle. Mark it `revalidating` (Apply blocked) and clear
          // `collision`: the previous name's collision flag is not authoritative for the new name, and
          // leaving it true would render a false "already exists" for a name never checked. The
          // plugin's re-run (armed by this same keystroke) refreshes both. `usageCount`/`fileCount`
          // track the invariant old name, so they stay valid.
          if (definition.name !== next.candidate.newName) {
            next = {
              ...next,
              candidate: { ...next.candidate, newName: definition.name, definitionRange: definition.range },
              collision: false,
              revalidating: true,
            };
          }
        }
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

const DEFAULT_SETTLE_MS = 1000;
const DEFAULT_LEAVE_MS = 5000;
const DEFAULT_REFRESH_MS = 300;

function makePlugin(config: RenameSuggestionConfig) {
  const settleMs = config.settleMs ?? DEFAULT_SETTLE_MS;
  const leaveMs = config.leaveMs ?? DEFAULT_LEAVE_MS;
  const refreshMs = config.refreshMs ?? DEFAULT_REFRESH_MS;

  return ViewPlugin.fromClass(
    class {
      private session: Session | null = null;
      private settleTimer: ReturnType<typeof setTimeout> | null = null;
      private leaveTimer: ReturnType<typeof setTimeout> | null = null;
      private refreshTimer: ReturnType<typeof setTimeout> | null = null;
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
            else if (effect.is(contentChangedRefreshEffect)) this.scheduleRefresh();
          }
        }
        if (update.docChanged || update.selectionSet) this.track(update.state);
      }

      destroy() {
        this.destroyed = true;
        this.clearSettle();
        this.clearLeave();
        this.clearRefresh();
      }

      /**
       * A collaborator changed some project file. Debounce, then re-query the project-wide usage and
       * collision for a VISIBLE (non-applied) offer so its counts, collision, and suppression reflect
       * peers' live edits before Apply. An applied offer keeps its Undo affordance untouched.
       */
      private scheduleRefresh() {
        const shown = this.view.state.field(suggestionField);
        if (!shown || shown.status === 'applied') return;
        this.clearRefresh();
        this.refreshTimer = setTimeout(() => {
          this.refreshTimer = null;
          const current = this.view.state.field(suggestionField);
          if (!current || current.status === 'applied') return;
          const clampedFrom = Math.min(current.candidate.definitionRange.from, this.view.state.doc.length);
          const line = this.view.state.doc.lineAt(clampedFrom).number;
          const session: Session = {
            kind: current.candidate.kind,
            oldName: current.candidate.oldName,
            lastName: current.candidate.newName,
            line,
          };
          void this.evaluate(session, current.candidate.newName, current.candidate.definitionRange);
        }, refreshMs);
      }

      /** Manage the baseline session, the 1s settle timer, and the 5s leave timer. No dispatch here. */
      private track(state: EditorState) {
        // Read-only / observer editors never rename; a remote edit must not surface an offer to them.
        // If edit rights were lost while a LIVE offer was open, hide it too — not just cancel a pending
        // one — so a downgraded author cannot click Apply on a stale widget. An applied suggestion
        // keeps its Undo affordance (like every other clear path here); the undo write is separately
        // guarded in runUndo(). The clear is deferred to a microtask because `track` runs inside the
        // editor update, which may not dispatch.
        if (config.getCanEdit && !config.getCanEdit()) {
          this.clearSettle();
          this.clearLeave();
          if (this.view.state.field(suggestionField)) void Promise.resolve().then(() => this.clearLiveOffer());
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
        if (newName === this.dismissedName) {
          // The author typed back to a name they already dismissed → no settle is armed to re-evaluate.
          // The field kept the offer open in-place (revalidating), so clear it here, otherwise it would
          // hang in "checking…" with Apply disabled forever. clearLiveOffer preserves an applied Undo.
          this.clearSettle();
          if (this.view.state.field(suggestionField)) void Promise.resolve().then(() => this.clearLiveOffer());
          return;
        }

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
        // A momentarily-invalid name (mid-typing, or paused on an invalid intermediate) is not an
        // applyable rename; drop a live offer rather than leave it stuck showing an unapplyable name.
        if (!isValidName(session.kind, newName)) {
          this.clearLiveOffer();
          return;
        }
        const projectId = config.getProjectId();
        const fileNodeId = config.getFileNodeId();
        if (!projectId || !fileNodeId) return;

        const apiKind = toApiKind(session.kind);
        const seq = ++this.seq;
        let usages: SymbolUsage[];
        try {
          usages = await config.findSymbolUsages(projectId, session.oldName, apiKind);
        } catch {
          // A failed lookup (rate limit / network) can't confirm the offer; clear a live one so it
          // does not hang in 'checking…'. The next edit re-arms detection. Only clear if THIS evaluate
          // still owns the offer — a newer settle may have superseded it and shown a valid one.
          if (!this.destroyed && seq === this.seq) this.clearLiveOffer();
          return;
        }
        if (this.destroyed || seq !== this.seq) return; // torn down, or a newer settle superseded this one

        const impact = evaluateUsages(usages, { definitionFileNodeId: fileNodeId, definitionRange });
        if (impact.suppressed) {
          // Nothing references the old name → nothing to refactor. Skip the collision lookup: it only
          // gates a suggestion that will not be shown, so firing it every settle just burns the
          // detection rate-limit budget. Never clear an applied offer's Undo affordance here.
          if (this.view.state.field(suggestionField)?.status !== 'applied') this.setSuggestion(null);
          return;
        }

        let collisionUsages: SymbolUsage[];
        try {
          collisionUsages = await config.findSymbolUsages(projectId, newName, apiKind);
        } catch {
          // Couldn't confirm collision → don't leave the offer stuck in 'checking…', but only if this
          // evaluate still owns it (a newer settle may already have shown a valid offer).
          if (!this.destroyed && seq === this.seq) this.clearLiveOffer();
          return;
        }
        if (this.destroyed || seq !== this.seq) return;

        // Re-validate: the definition must STILL read newName — the author may have reverted or kept
        // editing it during the async lookups. If it changed, the field has already updated the open
        // offer in place to the current name (and armed a fresh settle), so just bail WITHOUT clearing
        // it — clearing here would flash-close the very offer the field is keeping alive.
        const current = definitionAtCursor(this.view.state);
        if (current && current.name !== newName) return;

        // The captured range may be stale if the definition was deleted during the lookups; never
        // surface an offer anchored past the document end (buildDecoration would have to clamp it).
        if (definitionRange.from > this.view.state.doc.length) {
          this.clearLiveOffer();
          return;
        }

        // Never overwrite an applied offer's Undo affordance with a fresh 'visible' offer (the author
        // may have kept editing the just-renamed definition, starting a new session mid-flight).
        if (this.view.state.field(suggestionField)?.status === 'applied') return;

        const collision = collisionUsages.some(
          (u) => u.kind === 'definition' && !isEditedDefinition(u, fileNodeId, definitionRange),
        );
        this.setSuggestion({
          candidate: { kind: session.kind, oldName: session.oldName, newName, definitionRange },
          usageCount: impact.usageCount,
          fileCount: impact.fileCount,
          status: 'visible',
          collision,
          revalidating: false, // this lookup confirms usage + collision for the current name
        });
      }

      /** Apply via the reused endpoint, then switch the widget to its undo affordance. */
      private async apply() {
        const suggestion = this.view.state.field(suggestionField);
        // Block while revalidating: the author typed on to a new name whose usage/collision the
        // pending lookup has not yet re-confirmed, so `collision` is not authoritative for it yet.
        if (this.applying || !suggestion || suggestion.collision || suggestion.revalidating || suggestion.status === 'applied') return;
        // Edit rights may have been lost after the offer appeared — never write on the author's behalf.
        if (config.getCanEdit && !config.getCanEdit()) return;
        const projectId = config.getProjectId();
        if (!projectId) return;
        const { kind, oldName, newName } = suggestion.candidate;
        // Re-validate before writing: if the cursor is on a definition that no longer reads newName,
        // the author edited or reverted it after the offer appeared, so applying would rewrite
        // references to a name the definition no longer carries. Drop the stale offer instead.
        const current = definitionAtCursor(this.view.state);
        if (current && current.name !== newName) {
          this.setSuggestion(null);
          return;
        }
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
          // A leave timer armed before Apply (cursor left the definition, then the button was clicked)
          // must not fire and hide the applied Undo affordance.
          this.clearLeave();
          this.setSuggestion({ ...suggestion, status: 'applied', revalidating: false });
        } catch {
          // The rewrite failed (e.g. rate limit / network / conflict): leave the offer visible so the
          // author can retry, rather than stranding the widget in a half-applied state.
        } finally {
          this.applying = false;
        }
      }

      private async runUndo() {
        // Undo is a project-wide write; a downgrade after Apply must not let an observer reverse it.
        if (config.getCanEdit && !config.getCanEdit()) return;
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

      /** Clear a shown LIVE (non-applied) offer; an applied Undo affordance is preserved. */
      private clearLiveOffer() {
        const shown = this.view.state.field(suggestionField);
        if (shown && shown.status !== 'applied') this.setSuggestion(null);
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

      private clearRefresh() {
        if (this.refreshTimer) {
          clearTimeout(this.refreshTimer);
          this.refreshTimer = null;
        }
      }
    },
  );
}

/** The complete rename-suggestion extension (state field + orchestration plugin). */
export function renameSuggestion(config: RenameSuggestionConfig): Extension {
  return [suggestionField, makePlugin(config)];
}
