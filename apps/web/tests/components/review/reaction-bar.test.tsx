import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactionSummaryDto } from '@asciidocollab/shared';
import { ReactionBar } from '@/components/review/reaction-bar';
import { reactToItem } from '@/lib/api/review';

jest.mock('@/lib/api/review', () => ({
  reactToItem: jest.fn(),
}));

// Render the Radix dropdown inline so the emoji picker items are queryable without opening it.
jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockReact = reactToItem as jest.MockedFunction<typeof reactToItem>;

const summary = (overrides: Partial<ReactionSummaryDto> = {}): ReactionSummaryDto => ({
  emoji: '👍',
  count: 2,
  reactedByMe: false,
  userIds: ['a', 'b'],
  ...overrides,
});

describe('ReactionBar', () => {
  beforeEach(() => mockReact.mockReset());

  test('renders a chip per reaction with its count', () => {
    render(
      <ReactionBar
        projectId="p1"
        itemId="i1"
        reactions={[summary({ emoji: '👍', count: 3 }), summary({ emoji: '🎉', count: 1 })]}
      />,
    );
    expect(screen.getByRole('button', { name: '👍 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '🎉 1' })).toBeInTheDocument();
  });

  test('omits a zero-count chip (only the picker entry remains)', () => {
    render(<ReactionBar projectId="p1" itemId="i1" reactions={[summary({ emoji: '😄', count: 0 })]} />);
    // No chip for the zero-count emoji…
    expect(screen.queryByRole('button', { name: '😄 0' })).not.toBeInTheDocument();
    // …though it still appears as a pickable option in the add-reaction popover.
    expect(screen.getByRole('button', { name: 'React with 😄' })).toBeInTheDocument();
  });

  test('marks a reactedByMe chip as pressed', () => {
    render(
      <ReactionBar
        projectId="p1"
        itemId="i1"
        reactions={[summary({ emoji: '👍', reactedByMe: true })]}
      />,
    );
    expect(screen.getByRole('button', { name: '👍 2' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('clicking a chip toggles the reaction and adopts the returned summaries', async () => {
    mockReact.mockResolvedValue([summary({ emoji: '👍', count: 3, reactedByMe: true })]);
    render(<ReactionBar projectId="p1" itemId="i1" reactions={[summary({ emoji: '👍', count: 2 })]} />);
    fireEvent.click(screen.getByRole('button', { name: '👍 2' }));
    expect(mockReact).toHaveBeenCalledWith('p1', 'i1', { emoji: '👍' });
    await waitFor(() => expect(screen.getByRole('button', { name: '👍 3' })).toBeInTheDocument());
  });

  test('read-only mode disables chips and hides the add-reaction trigger', () => {
    render(
      <ReactionBar projectId="p1" itemId="i1" readOnly reactions={[summary({ emoji: '👍' })]} />,
    );
    expect(screen.getByRole('button', { name: '👍 2' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /add reaction/i })).not.toBeInTheDocument();
  });

  test('the add-reaction picker lists the allowlist and reacts on pick', async () => {
    mockReact.mockResolvedValue([]);
    render(<ReactionBar projectId="p1" itemId="i1" reactions={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /react with 🚀/i }));
    await waitFor(() => expect(mockReact).toHaveBeenCalledWith('p1', 'i1', { emoji: '🚀' }));
  });
});
