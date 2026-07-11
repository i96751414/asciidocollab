/* @jest-environment jsdom */
import { collectRemoteCarets, RemoteCaretWidget, readableTextColor } from '@/lib/codemirror/remote-cursor-avatars';

// Stub the DiceBear generator so the widget test stays in jsdom (real DiceBear needs structuredClone)
// and the embedded avatar is queryable. collectRemoteCarets under test is unaffected — it lives in the
// module being tested, not in this mocked one.
jest.mock('@/lib/avatar-svg', () => ({
  buildAvatarSvg: (avatarKey: string | null, name: string) =>
    `<svg data-testid="stub-avatar" data-key="${avatarKey ?? ''}" data-name="${name}"></svg>`,
}));

interface FakeState {
  cursor?: { anchor?: unknown; head?: unknown } | null;
  user?: { color?: string; name?: string; avatarKey?: string | null } | null;
}

// A resolver that treats a numeric endpoint as its own index and anything else as unlocatable.
const resolveByValue = (endpoint: unknown): number | null => (typeof endpoint === 'number' ? endpoint : null);

describe('collectRemoteCarets', () => {
  test('excludes the local client and carries the peer identity through', () => {
    const states = new Map<number, FakeState>([
      [1, { cursor: { anchor: 0, head: 2 }, user: { color: '#f00', name: 'Me' } }],
      [2, { cursor: { anchor: 0, head: 3 }, user: { color: '#0f0', name: 'Bea', avatarKey: 'bottts:2' } }],
    ]);
    const carets = collectRemoteCarets(states, 1, resolveByValue);
    expect(carets).toHaveLength(1);
    expect(carets[0].clientId).toBe(2);
    expect(carets[0].index).toBe(3);
    expect(carets[0].user).toEqual({ color: '#0f0', name: 'Bea', avatarKey: 'bottts:2' });
  });

  test('skips entries with no cursor or a missing endpoint', () => {
    const states = new Map<number, FakeState>([
      [2, { user: { name: 'A' } }],
      [3, { cursor: null, user: {} }],
      [4, { cursor: { anchor: 0 }, user: {} }],
      [5, { cursor: { anchor: 0, head: 2 }, user: {} }],
    ]);
    expect(collectRemoteCarets(states, 1, resolveByValue).map((caret) => caret.clientId)).toEqual([5]);
  });

  test('drops a peer whose head or anchor cannot be located in this text', () => {
    const states = new Map<number, FakeState>([
      [2, { cursor: { anchor: 0, head: 'stale' }, user: {} }],
      [3, { cursor: { anchor: 'stale', head: 2 }, user: {} }],
    ]);
    expect(collectRemoteCarets(states, 1, resolveByValue)).toEqual([]);
  });

  test('anchors the caret outside its selection for forward, backward, and collapsed ranges', () => {
    const states = new Map<number, FakeState>([
      [2, { cursor: { anchor: 1, head: 5 }, user: {} }],
      [3, { cursor: { anchor: 8, head: 4 }, user: {} }],
      [4, { cursor: { anchor: 3, head: 3 }, user: {} }],
    ]);
    const bySide = new Map(collectRemoteCarets(states, 1, resolveByValue).map((caret) => [caret.clientId, caret.side]));
    expect(bySide.get(2)).toBe(-1); // forward selection: caret trails the anchor
    expect(bySide.get(3)).toBe(1); // backward selection: caret leads the anchor
    expect(bySide.get(4)).toBe(1); // collapsed: no selection, default side
  });

  test('falls back to defaults when a peer publishes no user identity', () => {
    const states = new Map<number, FakeState>([[2, { cursor: { anchor: 0, head: 1 } }]]);
    const [caret] = collectRemoteCarets(states, 1, resolveByValue);
    expect(caret.user).toEqual({ color: '#30bced', name: 'Anonymous', avatarKey: null });
  });
});

describe('RemoteCaretWidget', () => {
  const user = { color: '#8a5cff', name: 'Ada', avatarKey: 'bottts:2' };

  test('renders a caret carrying the identity colour, the avatar, and the name', () => {
    const dom = new RemoteCaretWidget(user, 7).toDOM();
    expect(dom.className).toBe('cm-remoteCaret');
    expect(dom.style.getPropertyValue('--remote-color')).toBe('#8a5cff');
    // The mid-dark violet identity colour gets white text for contrast.
    expect(dom.style.getPropertyValue('--remote-fg')).toBe('#ffffff');
    expect(dom.querySelector<SVGElement>('.cm-remoteCaret-avatar svg')?.dataset.name).toBe('Ada');
    expect(dom.querySelector('.cm-remoteCaret-name')?.textContent).toBe('Ada');
    expect(dom.querySelector('.cm-remoteCaret-dot')).not.toBeNull();
  });

  test('eq ignores the client id but reacts to any identity change', () => {
    const base = new RemoteCaretWidget(user, 7);
    expect(base.eq(new RemoteCaretWidget({ ...user }, 99))).toBe(true);
    expect(base.eq(new RemoteCaretWidget({ ...user, color: '#000000' }, 7))).toBe(false);
    expect(base.eq(new RemoteCaretWidget({ ...user, name: 'Bea' }, 7))).toBe(false);
    expect(base.eq(new RemoteCaretWidget({ ...user, avatarKey: null }, 7))).toBe(false);
  });

  test('ignores events and reports an unknown height so line metrics are unaffected', () => {
    const widget = new RemoteCaretWidget(user, 1);
    expect(widget.ignoreEvent()).toBe(true);
    expect(widget.estimatedHeight).toBe(-1);
  });
});

describe('readableTextColor', () => {
  test('uses near-black text on a light identity colour', () => {
    expect(readableTextColor('#ffffff')).toBe('#1a1a1a');
    expect(readableTextColor('#f2d24a')).toBe('#1a1a1a'); // amber
    expect(readableTextColor('#fff')).toBe('#1a1a1a'); // 3-digit shorthand
  });

  test('uses white text on a dark identity colour', () => {
    expect(readableTextColor('#000000')).toBe('#ffffff');
    expect(readableTextColor('#3b3bff')).toBe('#ffffff'); // deep blue
  });

  test('falls back to white when the colour is not a plain hex value', () => {
    expect(readableTextColor('rgb(0, 0, 0)')).toBe('#ffffff');
    expect(readableTextColor('tomato')).toBe('#ffffff');
  });
});
