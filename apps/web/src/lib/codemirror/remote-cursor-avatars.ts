import * as Y from 'yjs';
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { ySyncFacet } from 'y-codemirror.next';
import { buildAvatarSvg } from '@/lib/avatar-svg';

/** Fallbacks matching the stock plugin, used when a peer publishes no colour/name. */
const DEFAULT_CARET_COLOR = '#30bced';
const DEFAULT_CARET_NAME = 'Anonymous';

/** Parses a `#rgb` or `#rrggbb` colour to 0–255 channels, or null if it isn't a plain hex colour. */
function parseHexColor(color: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (match === null) return null;
  const hex = match[1].length === 3 ? match[1].replaceAll(/(.)/g, '$1$1') : match[1];
  const value = Number.parseInt(hex, 16);
  return { r: (value >> 16) & 0xFF, g: (value >> 8) & 0xFF, b: value & 0xFF };
}

/**
 * Picks near-black or white for text on the given identity colour so the name on the caret flag stays
 * legible on both light (amber, cyan) and dark (indigo) palette colours. Uses the ITU-R BT.601 luma;
 * falls back to white when the colour isn't a parseable hex.
 *
 * @param color - The flag background (the peer's identity colour).
 * @returns A hex text colour with adequate contrast against `color`.
 */
export function readableTextColor(color: string): string {
  const rgb = parseHexColor(color);
  if (rgb === null) return '#ffffff';
  const luma = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return luma > 150 ? '#1a1a1a' : '#ffffff';
}

/** Identity of a remote collaborator, as published on their awareness `user` field. */
export interface RemoteCaretUser {
  /** The peer's identity colour (also tints their selection band and avatar ring). */
  color: string;
  /** The peer's display name. */
  name: string;
  /** The peer's DiceBear avatar key, or null for the default style. */
  avatarKey: string | null;
}

/** A remote caret to draw: where it sits, which side of the selection, and whose it is. */
export interface RemoteCaret {
  /** The peer's awareness client id (per tab). */
  clientId: number;
  /** Absolute document index of the caret (the selection head). */
  index: number;
  /** Which side of the position the widget sits on, so the caret stays outside the selection. */
  side: 1 | -1;
  /** The peer's resolved identity. */
  user: RemoteCaretUser;
}

/** The awareness state shape this plugin reads (a subset; other fields are ignored). */
interface RemoteAwarenessState {
  cursor?: { anchor?: unknown; head?: unknown } | null;
  user?: { color?: string; name?: string; avatarKey?: string | null } | null;
}

/**
 * Turns raw awareness states into caret specs. The mapping from a cursor endpoint to an absolute
 * document index is injected as `resolveIndex` so this stays a pure function — testable without Yjs
 * or a live document. The local client is excluded, and any peer whose endpoints can't be located in
 * the current text (a stale or cross-document position) is dropped.
 *
 * @param states - Awareness entries as `[clientId, state]` pairs.
 * @param localClientId - The viewer's own client id, so their caret is never drawn.
 * @param resolveIndex - Resolves a cursor endpoint to a document index, or null when unlocatable.
 * @returns One caret per eligible remote peer.
 */
export function collectRemoteCarets(
  states: Iterable<[number, RemoteAwarenessState]>,
  localClientId: number,
  resolveIndex: (endpoint: unknown) => number | null,
): RemoteCaret[] {
  const carets: RemoteCaret[] = [];
  for (const [clientId, state] of states) {
    if (clientId === localClientId) continue;
    const cursor = state.cursor;
    if (cursor == null || cursor.anchor == null || cursor.head == null) continue;
    const headIndex = resolveIndex(cursor.head);
    const anchorIndex = resolveIndex(cursor.anchor);
    if (headIndex === null || anchorIndex === null) continue;
    const user = state.user ?? {};
    carets.push({
      clientId,
      index: headIndex,
      // The caret sits outside its selection: after the anchor when the head trails it, before otherwise.
      side: headIndex - anchorIndex > 0 ? -1 : 1,
      user: {
        color: user.color ?? DEFAULT_CARET_COLOR,
        name: user.name ?? DEFAULT_CARET_NAME,
        avatarKey: user.avatarKey ?? null,
      },
    });
  }
  return carets;
}

/**
 * The remote caret: a thin bar in the peer's identity colour with a hover flag carrying their DiceBear
 * avatar and name — the same avatar shown in the presence bar and on their review comments. Replaces
 * the stock name-only caret so a cursor is identifiable by face, not just colour.
 */
export class RemoteCaretWidget extends WidgetType {
  /**
   * @param user - The peer's resolved identity (colour, name, avatar key).
   * @param clientId - The peer's awareness client id, used to namespace the avatar's SVG ids.
   */
  constructor(
    readonly user: RemoteCaretUser,
    readonly clientId: number,
  ) {
    super();
  }

  /**
   * Two carets look identical when their identity matches; the client id is irrelevant to appearance,
   * so CodeMirror can reuse the DOM across peers that share it.
   *
   * @param other - The widget CodeMirror is comparing against for DOM reuse.
   * @returns True when the rendered caret would be identical.
   */
  eq(other: RemoteCaretWidget): boolean {
    return (
      other.user.color === this.user.color &&
      other.user.name === this.user.name &&
      other.user.avatarKey === this.user.avatarKey
    );
  }

  /**
   * Builds the caret element: a thin identity-coloured bar with a hover flag carrying the avatar + name.
   *
   * @returns The caret DOM node.
   */
  toDOM(): HTMLElement {
    // Word-joiners give the zero-width caret its line height, matching the stock caret's technique.
    const wordJoiner = '\u2060';
    const caret = document.createElement('span');
    caret.className = 'cm-remoteCaret';
    caret.style.setProperty('--remote-color', this.user.color);
    caret.style.setProperty('--remote-fg', readableTextColor(this.user.color));
    caret.append(wordJoiner);

    const dot = document.createElement('span');
    dot.className = 'cm-remoteCaret-dot';
    caret.append(dot, wordJoiner);

    const flag = document.createElement('span');
    flag.className = 'cm-remoteCaret-flag';
    const avatar = document.createElement('span');
    avatar.className = 'cm-remoteCaret-avatar';
    // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method -- SVG is DiceBear-generated from a fixed first-party style registry, not user HTML
    avatar.innerHTML = buildAvatarSvg(this.user.avatarKey, this.user.name, `caret-${this.clientId}`);
    const name = document.createElement('span');
    name.className = 'cm-remoteCaret-name';
    name.textContent = this.user.name;
    flag.append(avatar, name);
    caret.append(flag, wordJoiner);

    return caret;
  }

  /**
   * Clicks and selections pass through the caret to the text beneath it.
   *
   * @returns Always true, so CodeMirror never treats an event on the caret as its own.
   */
  ignoreEvent(): boolean {
    return true;
  }

  /** The caret adds no block height, so line metrics are unaffected. */
  get estimatedHeight(): number {
    return -1;
  }
}

/**
 * Rebuilds the remote carets from awareness. Resolving each peer's relative-position cursor against the
 * live doc happens here; the pure {@link collectRemoteCarets} does the rest.
 */
function buildRemoteCaretDecorations(view: EditorView): DecorationSet {
  const facet = view.state.facet(ySyncFacet);
  const ytext = facet.ytext;
  const ydoc = ytext.doc;
  if (ydoc === null) return Decoration.none;
  const resolveIndex = (endpoint: unknown): number | null => {
    // Peers publish their cursor as a relative-position JSON; rebuild it, then resolve to an absolute
    // index against the live doc. A position from stale or foreign text resolves to null and is dropped.
    const relative = Y.createRelativePositionFromJSON(endpoint);
    const absolute = Y.createAbsolutePositionFromRelativePosition(relative, ydoc);
    return absolute && absolute.type === ytext ? absolute.index : null;
  };
  const carets = collectRemoteCarets(facet.awareness.getStates(), facet.awareness.doc.clientID, resolveIndex);
  const ranges = carets.map((caret) =>
    Decoration.widget({ widget: new RemoteCaretWidget(caret.user, caret.clientId), side: caret.side }).range(caret.index),
  );
  return Decoration.set(ranges, true);
}

class RemoteCursorsPluginValue {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = buildRemoteCaretDecorations(view);
  }

  update(update: ViewUpdate): void {
    // We deliberately do NOT listen on awareness ourselves: dispatching from an awareness handler would
    // re-enter an in-progress update (yCollab publishes the local cursor *during* its update cycle) and
    // throw "Calls to EditorView.update are not allowed while an update is in progress". Instead we
    // piggyback on yCollab's own stock remote-selections plugin, which already dispatches a transaction
    // on every non-local awareness change; that transaction — and any doc edit that shifts positions —
    // reaches us here, so we rebuild on any incoming transaction. (Pure geometry/scroll updates carry no
    // transaction and are skipped.)
    if (update.docChanged || update.transactions.length > 0) {
      this.decorations = buildRemoteCaretDecorations(update.view);
    }
  }
}

const remoteCursorsPlugin = ViewPlugin.fromClass(RemoteCursorsPluginValue, {
  decorations: (value) => value.decorations,
});

/**
 * Styles the custom caret and hides the stock `yRemoteSelections` caret (its selection band is kept —
 * it already uses the peer's light identity colour). The flag reveals on hover, matching the stock
 * name-tooltip interaction, but now carries the avatar too. A transparent hit area widens the hover
 * target so the flag appears reliably when the pointer is near the caret, not only on the 2px bar.
 */
const remoteCursorsTheme = EditorView.baseTheme({
  // `!important`: both this and the stock yRemoteSelectionsTheme are base themes targeting the same
  // class at equal specificity, so plain `display: none` loses to the stock `display: inline` by source
  // order and the stock name-only caret leaks through alongside ours. The stock rule has no `!important`,
  // so this wins unconditionally and the stock caret (bar, dot, and name label) stays hidden.
  '.cm-ySelectionCaret': { display: 'none !important' },
  '.cm-remoteCaret': {
    position: 'relative',
    marginLeft: '-1px',
    marginRight: '-1px',
    borderLeft: '2px solid var(--remote-color)',
    boxSizing: 'border-box',
    display: 'inline',
  },
  // A transparent, line-height-tall column centred on the caret. The 2px bar is a near-impossible hover
  // target on its own; this zone makes the flag reveal when the pointer is merely near the caret. The
  // flag itself is pointer-events:none, so the zone is all that needs hovering.
  '.cm-remoteCaret::before': {
    content: '""',
    position: 'absolute',
    top: '-1px',
    bottom: '-1px',
    left: '-6px',
    width: '14px',
  },
  '.cm-remoteCaret-dot': {
    position: 'absolute',
    top: '-2px',
    left: '-3px',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: 'var(--remote-color)',
    transition: 'opacity .12s ease-in-out',
  },
  '.cm-remoteCaret-flag': {
    position: 'absolute',
    bottom: '100%',
    left: '-2px',
    marginBottom: '3px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px 2px 2px',
    borderRadius: '999px 999px 999px 3px',
    backgroundColor: 'var(--remote-color)',
    // Contrast-picked per identity colour (set on the caret element) so the name is legible on both
    // light and dark palette colours; falls back to white.
    color: 'var(--remote-fg, #fff)',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '11px',
    fontWeight: '600',
    lineHeight: '1',
    whiteSpace: 'nowrap',
    opacity: '0',
    pointerEvents: 'none',
    transition: 'opacity .12s ease-in-out',
    zIndex: '30',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
  },
  '.cm-remoteCaret:hover .cm-remoteCaret-flag': { opacity: '1' },
  '.cm-remoteCaret:hover .cm-remoteCaret-dot': { opacity: '0' },
  '.cm-remoteCaret-avatar': {
    width: '15px',
    height: '15px',
    borderRadius: '50%',
    overflow: 'hidden',
    display: 'inline-block',
    flex: 'none',
    boxShadow: '0 0 0 1.5px rgba(255, 255, 255, 0.85)',
  },
  '.cm-remoteCaret-avatar svg': { display: 'block', width: '100%', height: '100%' },
  '.cm-remoteCaret-name': { paddingRight: '2px' },
});

/**
 * The extension that draws remote collaborators' carets with an avatar-bearing hover flag, replacing
 * the stock name-only caret. Pair it with `yCollab` (which still syncs the text, publishes the local
 * cursor, and paints the selection band); this only swaps the caret rendering.
 */
export function remoteCursorAvatars(): Extension {
  return [remoteCursorsTheme, remoteCursorsPlugin];
}
