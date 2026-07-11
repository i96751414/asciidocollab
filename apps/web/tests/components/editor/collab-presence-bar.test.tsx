import { render, screen } from '@testing-library/react';
import { CollabPresenceBar } from '@/components/editor/collab-presence-bar';
import type { AwarenessLike } from '@/hooks/use-collab-presence';
import type { AwarenessUser } from '@/lib/collab/awareness-user';

// Render the shared DiceBear avatar as a lightweight stub so the participant's avatar key is queryable
// without generating SVG in jsdom — the presence bar's job is to pass that key through.
jest.mock('@/components/avatar', () => ({
  Avatar: ({ displayName, avatarKey }: { displayName: string; avatarKey: string | null }) =>
    require('react').createElement('span', {
      'data-testid': 'participant-avatar',
      'data-avatar-key': avatarKey ?? '',
      'data-display-name': displayName,
    }),
}));

function user(userId: string, name: string, avatarKey: string | null = null): { user: AwarenessUser } {
  return { user: { userId, name, color: '#30bced', colorLight: '#30bced33', avatarKey } };
}

function fakeAwareness(localClientId: number, states: Map<number, { user?: AwarenessUser }>): AwarenessLike {
  return {
    clientID: localClientId,
    getStates: () => states,
    on: () => {},
    off: () => {},
  };
}

describe('CollabPresenceBar', () => {
  test('renders other participants and excludes the local client', () => {
    const states = new Map([
      [1, user('u-local', 'Me')],
      [2, user('u-bea', 'Bea')],
    ]);
    render(<CollabPresenceBar awareness={fakeAwareness(1, states)} />);

    expect(screen.getByTestId('collab-presence-bar')).toBeInTheDocument();
    expect(screen.getByText('Bea')).toBeInTheDocument();
    expect(screen.queryByText('Me')).not.toBeInTheDocument();
  });

  test('dedupes the same userId across multiple tabs into one identity', () => {
    const states = new Map([
      [1, user('u-local', 'Me')],
      [2, user('u-bea', 'Bea')],
      [3, user('u-bea', 'Bea')], // same user, second tab
    ]);
    render(<CollabPresenceBar awareness={fakeAwareness(1, states)} />);

    expect(screen.getAllByText('Bea')).toHaveLength(1);
  });

  test('shows a count of distinct other participants', () => {
    const states = new Map([
      [1, user('u-local', 'Me')],
      [2, user('u-bea', 'Bea')],
      [3, user('u-bea', 'Bea')],
      [4, user('u-cam', 'Cam')],
    ]);
    render(<CollabPresenceBar awareness={fakeAwareness(1, states)} />);

    expect(screen.getByTestId('collab-presence-count')).toHaveTextContent('2');
  });

  test("renders each participant's DiceBear avatar, driven by their configured avatar key", () => {
    const states = new Map([
      [1, user('u-local', 'Me')],
      [2, user('u-bea', 'Bea', 'bottts:3')],
    ]);
    render(<CollabPresenceBar awareness={fakeAwareness(1, states)} />);

    const avatar = screen.getByTestId('participant-avatar');
    expect(avatar).toHaveAttribute('data-avatar-key', 'bottts:3');
    expect(avatar).toHaveAttribute('data-display-name', 'Bea');
  });

  test('renders nothing when there are no other participants', () => {
    const states = new Map([[1, user('u-local', 'Me')]]);
    const { container } = render(<CollabPresenceBar awareness={fakeAwareness(1, states)} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing when awareness is null', () => {
    const { container } = render(<CollabPresenceBar awareness={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
