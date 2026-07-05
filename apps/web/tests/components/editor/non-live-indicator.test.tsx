import { render, screen } from '@testing-library/react';
import { NonLiveIndicator } from '@/components/editor/non-live-indicator';

describe('NonLiveIndicator', () => {
  it('renders nothing when all inputs are live', () => {
    const { container } = render(<NonLiveIndicator active={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a subtle, accessible status when some inputs are non-live', () => {
    render(<NonLiveIndicator active />);
    const indicator = screen.getByTestId('non-live-indicator');
    expect(indicator).toBeVisible();
    expect(indicator).toHaveAttribute('role', 'status');
    // Design-token styled and deliberately quiet — no destructive/warning colour classes.
    expect(indicator.className).toContain('text-muted-foreground');
    expect(indicator.className).not.toContain('text-destructive');
    // Explains the state on demand rather than shouting an error.
    expect(indicator).toHaveAttribute('title', expect.stringMatching(/last save/i));
  });
});
