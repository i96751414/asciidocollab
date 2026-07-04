/*
 * @jest-environment jsdom
 */
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { RenameSymbolResult, SymbolUsage } from '@/lib/api/projects';
import {
  renameSuggestion,
  suggestionField,
  type RenameSuggestionConfig,
} from '@/lib/codemirror/rename-suggestion/rename-suggestion-state';
import {
  applyRequestEffect,
  undoRequestEffect,
} from '@/lib/codemirror/rename-suggestion/rename-suggestion-effects';

const u = (fileNodeId: string, kind: string, from: number): SymbolUsage => ({
  fileNodeId,
  path: `${fileNodeId}.adoc`,
  kind,
  range: { from, to: from + 5 },
});

/** find-usages: `edition` has a def in F + two xrefs in G; a name given via `collideFor` collides. */
function makeConfig(overrides: Partial<RenameSuggestionConfig> = {}): {
  config: RenameSuggestionConfig;
  findSymbolUsages: jest.Mock;
  renameSymbol: jest.Mock;
} {
  const findSymbolUsages = jest.fn(async (_p: string, name: string): Promise<SymbolUsage[]> => {
    if (name === 'edition') return [u('F', 'definition', 0), u('G', 'xref', 5), u('G', 'xref', 20)];
    return [];
  });
  const renameSymbol = jest.fn(
    async (): Promise<RenameSymbolResult> => ({ rewrittenFiles: 1, updatedReferences: 2, warnings: [] }),
  );
  const config: RenameSuggestionConfig = {
    getProjectId: () => 'p1',
    getFileNodeId: () => 'F',
    findSymbolUsages,
    renameSymbol,
    settleMs: 2000,
    leaveMs: 5000,
    ...overrides,
  };
  return { config, findSymbolUsages, renameSymbol };
}

function mount(document_: string, config: RenameSuggestionConfig): EditorView {
  return new EditorView({
    state: EditorState.create({ doc: document_, extensions: [renameSuggestion(config)] }),
    parent: document.body,
  });
}

const shown = (view: EditorView) => view.state.field(suggestionField);
const flush = async () => {
  for (let index = 0; index < 10; index++) await Promise.resolve();
};

/** Establish the baseline (cursor on `:edition:`), then rename it to `release`. */
function beginRename(view: EditorView, to = 'release'): void {
  view.dispatch({ selection: { anchor: 4 } }); // baseline captured: oldName = 'edition'
  view.dispatch({ changes: { from: 1, to: 8, insert: to }, selection: { anchor: 4 } });
}

describe('rename suggestion state machine', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  test('shows a suggestion 2s after a settled attribute rename', async () => {
    const { config, findSymbolUsages } = makeConfig();
    const view = mount(':edition:\n', config);
    beginRename(view);
    expect(shown(view)).toBeNull(); // nothing yet — still within the settle window
    await jest.advanceTimersByTimeAsync(2000);
    const s = shown(view);
    expect(s?.status).toBe('visible');
    expect(s?.usageCount).toBe(2);
    expect(s?.fileCount).toBe(1);
    expect(findSymbolUsages).toHaveBeenCalledWith('p1', 'edition', 'attribute');
    expect(findSymbolUsages).toHaveBeenCalledWith('p1', 'release', 'attribute');
    view.destroy();
  });

  test('the default settle shows the suggestion after 1s', async () => {
    const { config } = makeConfig({ settleMs: undefined }); // fall back to the built-in default
    const view = mount(':edition:\n', config);
    beginRename(view);
    await jest.advanceTimersByTimeAsync(999);
    expect(shown(view)).toBeNull(); // still within the 1s settle window
    await jest.advanceTimersByTimeAsync(1);
    expect(shown(view)?.status).toBe('visible');
    view.destroy();
  });

  test('re-editing the name resets the 2s timer', async () => {
    const { config } = makeConfig();
    const view = mount(':edition:\n', config);
    beginRename(view);
    await jest.advanceTimersByTimeAsync(1000);
    expect(shown(view)).toBeNull();
    view.dispatch({ changes: { from: 8, to: 8, insert: 'x' }, selection: { anchor: 9 } }); // keep typing
    await jest.advanceTimersByTimeAsync(1000);
    expect(shown(view)).toBeNull(); // only 1s since the last change
    await jest.advanceTimersByTimeAsync(1000);
    expect(shown(view)?.status).toBe('visible');
    view.destroy();
  });

  test('suppresses when the old name has no other occurrences', async () => {
    const findSymbolUsages = jest.fn(async () => [u('F', 'definition', 0)]);
    const { config } = makeConfig({ findSymbolUsages });
    const view = mount(':edition:\n', config);
    beginRename(view);
    await jest.advanceTimersByTimeAsync(2000);
    expect(shown(view)).toBeNull();
    view.destroy();
  });

  test('blocks apply when the new name collides with an existing same-kind symbol', async () => {
    const findSymbolUsages = jest.fn(async (_p: string, name: string) =>
      name === 'edition' ? [u('F', 'definition', 0), u('G', 'xref', 5)] : [u('H', 'definition', 0)],
    );
    const { config } = makeConfig({ findSymbolUsages });
    const view = mount(':edition:\n', config);
    beginRename(view);
    await jest.advanceTimersByTimeAsync(2000);
    const s = shown(view);
    expect(s?.status).toBe('visible');
    expect(s?.collision).toBe(true);
    view.destroy();
  });

  test('reverting the name to the original clears the suggestion', async () => {
    const { config } = makeConfig();
    const view = mount(':edition:\n', config);
    beginRename(view);
    await jest.advanceTimersByTimeAsync(2000);
    expect(shown(view)?.status).toBe('visible');
    view.dispatch({ changes: { from: 1, to: 8, insert: 'edition' }, selection: { anchor: 4 } });
    expect(shown(view)).toBeNull();
    view.destroy();
  });

  test('keeps the open offer and updates it in place when the author types on to a different name', async () => {
    // The offer reads `edition → release`; the author then types on to `releases`. Instead of
    // flashing the dialog closed, it stays open and its new name updates at once — so Apply can never
    // rewrite references to a name the definition no longer carries — and the project-wide lookup
    // re-runs to refresh the counts when the settle fires (feature 033).
    const { config } = makeConfig();
    const view = mount(':edition:\n', config);
    beginRename(view); // doc is now `:release:` with the offer pending
    await jest.advanceTimersByTimeAsync(2000);
    expect(shown(view)?.candidate.newName).toBe('release');
    expect(shown(view)?.revalidating).toBe(false);
    view.dispatch({ changes: { from: 8, to: 8, insert: 's' }, selection: { anchor: 9 } }); // `:releases:`
    expect(shown(view)?.candidate.newName).toBe('releases'); // dialog stays open, name updated in place
    expect(shown(view)?.revalidating).toBe(true); // collision not yet re-confirmed for the new name
    await jest.advanceTimersByTimeAsync(2000); // the re-run settle refreshes it
    expect(shown(view)?.status).toBe('visible');
    expect(shown(view)?.candidate.newName).toBe('releases');
    expect(shown(view)?.revalidating).toBe(false); // re-confirmed → Apply re-enabled
    view.destroy();
  });

  test('Apply is blocked while the offer is revalidating a freshly-typed name', async () => {
    const { config, renameSymbol } = makeConfig();
    const view = mount(':edition:\n', config);
    beginRename(view);
    await jest.advanceTimersByTimeAsync(2000);
    view.dispatch({ changes: { from: 8, to: 8, insert: 's' }, selection: { anchor: 9 } }); // `:releases:`
    expect(shown(view)?.revalidating).toBe(true);
    view.dispatch({ effects: applyRequestEffect.of(null) }); // click Apply mid-revalidation
    await flush();
    expect(renameSymbol).not.toHaveBeenCalled(); // the stale-collision window cannot fire a rename
    view.destroy();
  });

  test('losing edit rights hides an already-open offer', async () => {
    let canEdit = true;
    const { config } = makeConfig({ getCanEdit: () => canEdit });
    const view = mount(':edition:\n\nbody text here\n', config);
    beginRename(view);
    await jest.advanceTimersByTimeAsync(2000);
    expect(shown(view)?.status).toBe('visible');
    canEdit = false; // role downgraded while the offer is open
    view.dispatch({ selection: { anchor: 15 } }); // any change re-runs tracking
    await flush(); // the clear is dispatched from a microtask (never during the update)
    expect(shown(view)).toBeNull();
    view.destroy();
  });

  test('editing on after Apply does not overwrite the Undo affordance with a fresh offer', async () => {
    // find-usages returns hits for both the old and the applied new name, so the post-apply session's
    // lookup is NOT suppressed and would otherwise emit a fresh 'visible' offer over the applied one.
    const findSymbolUsages = jest.fn(async (_p: string, name: string): Promise<SymbolUsage[]> =>
      name === 'edition' || name === 'release'
        ? [u('F', 'definition', 0), u('G', 'xref', 5)]
        : [],
    );
    const { config } = makeConfig({ findSymbolUsages });
    const view = mount(':edition:\n', config);
    beginRename(view);
    await jest.advanceTimersByTimeAsync(2000);
    view.dispatch({ effects: applyRequestEffect.of(null) });
    await flush();
    expect(shown(view)?.status).toBe('applied');

    // Keep editing the just-renamed definition (`:release:` → `:release2:`).
    view.dispatch({ changes: { from: 8, to: 8, insert: '2' }, selection: { anchor: 9 } }); // new session
    view.dispatch({ changes: { from: 9, to: 9, insert: '2' }, selection: { anchor: 10 } }); // arms settle
    await jest.advanceTimersByTimeAsync(2000);
    expect(shown(view)?.status).toBe('applied'); // Undo affordance preserved, not clobbered
    view.destroy();
  });

  test('hides 5s after leaving the definition, but a return within the window keeps it', async () => {
    const { config } = makeConfig();
    const view = mount(':edition:\n\nbody text here\n', config);
    beginRename(view);
    await jest.advanceTimersByTimeAsync(2000);
    expect(shown(view)?.status).toBe('visible');

    view.dispatch({ selection: { anchor: 15 } }); // cursor onto the body line (off the definition)
    await jest.advanceTimersByTimeAsync(4000);
    expect(shown(view)?.status).toBe('visible'); // still within the 5s window
    view.dispatch({ selection: { anchor: 4 } }); // return to the definition → cancels disappearance
    await jest.advanceTimersByTimeAsync(5000);
    expect(shown(view)?.status).toBe('visible');

    view.dispatch({ selection: { anchor: 15 } }); // leave again
    await jest.advanceTimersByTimeAsync(5000);
    expect(shown(view)).toBeNull();
    view.destroy();
  });

  test('apply rewrites via the reused endpoint and undo reverses it', async () => {
    const { config, renameSymbol } = makeConfig();
    const view = mount(':edition:\n', config);
    beginRename(view);
    await jest.advanceTimersByTimeAsync(2000);
    expect(shown(view)?.status).toBe('visible');

    view.dispatch({ effects: applyRequestEffect.of(null) });
    await flush();
    expect(renameSymbol).toHaveBeenCalledWith('p1', {
      symbolKind: 'attribute',
      oldName: 'edition',
      newName: 'release',
      definitionAlreadyRenamed: true,
    });
    expect(shown(view)?.status).toBe('applied');

    view.dispatch({ effects: undoRequestEffect.of(null) });
    await flush();
    expect(renameSymbol).toHaveBeenLastCalledWith('p1', { symbolKind: 'attribute', oldName: 'release', newName: 'edition' });
    expect(shown(view)).toBeNull();
    view.destroy();
  });

  test('no suggestion for a read-only / observer editor (getCanEdit false)', async () => {
    const { config } = makeConfig({ getCanEdit: () => false });
    const view = mount(':edition:\n', config);
    beginRename(view);
    await jest.advanceTimersByTimeAsync(2000);
    expect(shown(view)).toBeNull();
    view.destroy();
  });

  test('a failed apply leaves the offer visible (not stranded) and never rejects', async () => {
    const renameSymbol = jest.fn(async () => {
      throw new Error('rate limited');
    });
    const { config } = makeConfig({ renameSymbol });
    const view = mount(':edition:\n', config);
    beginRename(view);
    await jest.advanceTimersByTimeAsync(2000);
    expect(shown(view)?.status).toBe('visible');
    view.dispatch({ effects: applyRequestEffect.of(null) });
    await flush();
    expect(renameSymbol).toHaveBeenCalled();
    expect(shown(view)?.status).toBe('visible'); // still offered for retry, not stuck in 'applied'
    view.destroy();
  });
});
