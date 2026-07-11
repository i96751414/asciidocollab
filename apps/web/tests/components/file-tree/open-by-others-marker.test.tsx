import { render, screen } from '@testing-library/react';
import { OpenByOthersMarker } from '@/components/file-tree/open-by-others-marker';
import type { ParticipantPresence } from '@/hooks/use-collab-presence';

// Stub the shared DiceBear avatar so each rendered participant is queryable by its avatar key without
// generating SVG in jsdom — the marker's job is to render one avatar per participant.
jest.mock('@/components/avatar', () => ({
  Avatar: ({ displayName, avatarKey }: { displayName: string; avatarKey: string | null }) =>
    require('react').createElement('span', {
      'data-testid': 'participant-avatar',
      'data-avatar-key': avatarKey ?? '',
      'data-display-name': displayName,
    }),
}));

function participant(userId: string, name: string, avatarKey: string | null = null): ParticipantPresence {
  return { clientId: Number(userId.length), userId, name, color: '#30bced', colorLight: '#30bced33', avatarKey };
}

describe('OpenByOthersMarker', () => {
  test('renders nothing when no other user has the file open', () => {
    const { container } = render(<OpenByOthersMarker participants={[]} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('open-by-others-marker')).toBeNull();
  });

  test('renders a marker with an accessible label naming the single user', () => {
    render(<OpenByOthersMarker participants={[participant('u-bea', 'Bea')]} />);
    const marker = screen.getByTestId('open-by-others-marker');
    expect(marker).toHaveAttribute('aria-label', 'Open by Bea');
    expect(marker).toHaveAttribute('title', 'Bea');
  });

  test('is keyboard-focusable so the identity is revealed on focus', () => {
    render(<OpenByOthersMarker participants={[participant('u-bea', 'Bea')]} />);
    expect(screen.getByTestId('open-by-others-marker')).toHaveAttribute('tabindex', '0');
  });

  test('hover/label reveals all users when multiple have the file open', () => {
    render(<OpenByOthersMarker participants={[participant('u-bea', 'Bea'), participant('u-cy', 'Cy')]} />);
    const marker = screen.getByTestId('open-by-others-marker');
    expect(marker.getAttribute('aria-label')).toContain('Bea');
    expect(marker.getAttribute('aria-label')).toContain('Cy');
    expect(marker).toHaveAttribute('title', 'Bea, Cy');
  });

  test('collapses avatars beyond the cap into a "+N" overflow while still naming everyone', () => {
    const many = ['Bea', 'Cy', 'Dee', 'Eve', 'Fin'].map((n) => participant(`u-${n}`, n));
    render(<OpenByOthersMarker participants={many} />);
    expect(screen.getByText('+2')).toBeInTheDocument(); // 5 users, 3 avatars shown
    expect(screen.getByTestId('open-by-others-marker').getAttribute('aria-label')).toContain('Fin');
  });

  test('still renders an avatar for a participant with an empty name', () => {
    render(<OpenByOthersMarker participants={[participant('u-x', '')]} />);
    expect(screen.getByTestId('participant-avatar')).toHaveAttribute('data-display-name', '');
  });

  test("renders the participant's DiceBear avatar, driven by their configured avatar key", () => {
    render(<OpenByOthersMarker participants={[participant('u-bea', 'Bea', 'bottts:3')]} />);
    expect(screen.getByTestId('participant-avatar')).toHaveAttribute('data-avatar-key', 'bottts:3');
  });
});
