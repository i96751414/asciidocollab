import { render, screen } from '@testing-library/react';
import { CollabPresenceBar } from '@/components/editor/collab-presence-bar';
import type { AwarenessLike } from '@/hooks/use-collab-presence';
import type { AwarenessUser } from '@/lib/collab/awareness-user';

function user(userId: string, name: string): { user: AwarenessUser } {
  return { user: { userId, name, color: '#30bced', colorLight: '#30bced33' } };
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

  test('renders a coloured initial when the participant has no avatar (T035)', () => {
    const states = new Map([
      [1, user('u-local', 'Me')],
      [2, user('u-bea', 'Bea')],
    ]);
    render(<CollabPresenceBar awareness={fakeAwareness(1, states)} />);

    // Falls back to the first letter of the display name.
    expect(screen.getByText('B')).toBeInTheDocument();
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
