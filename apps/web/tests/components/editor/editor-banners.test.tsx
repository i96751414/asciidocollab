import { render, screen } from '@testing-library/react';
import { EditorBanners } from '@/components/editor/editor-banners';

const noop = () => {};
const baseProperties = {
  externalChange: false,
  draftContent: null,
  onDismissExternalChange: noop,
  onRestoreDraft: noop,
  onDiscardDraft: noop,
};

// T045 / US4 / FR-014: connection-state banners for the collab path.
describe('EditorBanners connection-state strips', () => {
  test('shows a "connecting" banner', () => {
    render(<EditorBanners {...baseProperties} connectionState="connecting" />);
    expect(screen.getByTestId('collab-banner-connecting')).toBeInTheDocument();
  });

  test('shows a "reconnecting" banner', () => {
    render(<EditorBanners {...baseProperties} connectionState="reconnecting" />);
    expect(screen.getByTestId('collab-banner-reconnecting')).toBeInTheDocument();
  });

  test('shows an "editing unavailable" banner when offline', () => {
    render(<EditorBanners {...baseProperties} connectionState="offline" />);
    const banner = screen.getByTestId('collab-banner-offline');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/unavailable/i);
  });

  // Guard B: a text document with no collaborative backing is read-only with a clear notice.
  test('shows a "collaboration unavailable" read-only banner when collabUnavailable', () => {
    render(<EditorBanners {...baseProperties} collabUnavailable />);
    const banner = screen.getByTestId('collab-banner-unavailable');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/read-only/i);
  });

  test('shows no connection banner when synced', () => {
    render(<EditorBanners {...baseProperties} connectionState="synced" />);
    expect(screen.queryByTestId('collab-banner-connecting')).not.toBeInTheDocument();
    expect(screen.queryByTestId('collab-banner-reconnecting')).not.toBeInTheDocument();
    expect(screen.queryByTestId('collab-banner-offline')).not.toBeInTheDocument();
  });

  test('shows a read-only notice for an observer when synced', () => {
    render(<EditorBanners {...baseProperties} connectionState="synced" readOnly />);
    expect(screen.getByTestId('collab-banner-readonly')).toBeInTheDocument();
  });

  test('offline banner takes precedence over the read-only notice', () => {
    render(<EditorBanners {...baseProperties} connectionState="offline" readOnly />);
    expect(screen.getByTestId('collab-banner-offline')).toBeInTheDocument();
    expect(screen.queryByTestId('collab-banner-readonly')).not.toBeInTheDocument();
  });

  test('renders no connection banner on the legacy path (no connectionState)', () => {
    const { container } = render(<EditorBanners {...baseProperties} />);
    expect(container).toBeEmptyDOMElement();
  });
});
