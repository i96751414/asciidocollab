import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DisplayNameCard } from '@/app/(dashboard)/dashboard/account/display-name-card';

const mockUpdateProfile = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/api', () => ({
  authApi: {
    updateDisplayName: jest.fn(),
    updateProfile: (...arguments_: unknown[]) => mockUpdateProfile(...arguments_),
  },
  ApiError: class ApiError extends Error {},
}));

jest.mock('@/components/avatar', () => ({
  Avatar: ({ avatarKey, displayName }: { avatarKey: string | null; displayName: string }) => (
    <span data-testid={`avatar-${avatarKey ?? 'null'}`}>{displayName}</span>
  ),
}));

jest.mock('@/lib/avatars', () => ({
  DICEBEAR_STYLES: {
    'initial-face': { style: {}, label: 'Initial Face' },
    'bottts-neutral': { style: {}, label: 'Bottts Neutral' },
    'pixel-art': { style: {}, label: 'Pixel Art' },
  },
  DEFAULT_AVATAR_STYLE: 'initial-face',
  AVATAR_VARIANT_SEEDS: ['v1', 'v2', 'v3'],
}));

describe('DisplayNameCard with avatar picker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders all DiceBear styles as selectable options', () => {
    render(<DisplayNameCard displayName="Alice" avatarKey={null} />);
    for (const label of ['Initial Face', 'Bottts Neutral', 'Pixel Art']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  test('highlights the active style', () => {
    render(<DisplayNameCard displayName="Alice" avatarKey="bottts-neutral" />);
    const activeButton = screen.getByRole('button', { name: /bottts neutral/i });
    expect(activeButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('submit PATCH includes selected avatarKey', async () => {
    render(<DisplayNameCard displayName="Alice" avatarKey={null} />);
    fireEvent.click(screen.getByRole('button', { name: /bottts neutral/i }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Alice Updated' } });
    fireEvent.submit(screen.getByRole('form', { name: /update display name/i }));
    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'Alice Updated', avatarKey: 'bottts-neutral' }),
      );
    });
  });

  test('variant picker appears only for non-initials styles', () => {
    render(<DisplayNameCard displayName="Alice" avatarKey={null} />);
    expect(screen.queryByText('Variant')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /bottts neutral/i }));
    expect(screen.getByText('Variant')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Variant 1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /initial face/i }));
    expect(screen.queryByText('Variant')).not.toBeInTheDocument();
  });

  test('selecting a variant saves style:seed', async () => {
    render(<DisplayNameCard displayName="Alice" avatarKey={null} />);
    fireEvent.click(screen.getByRole('button', { name: /bottts neutral/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Variant 1' }));
    fireEvent.submit(screen.getByRole('form', { name: /update display name/i }));
    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'Alice', avatarKey: 'bottts-neutral:v1' }),
      );
    });
  });

  test('active variant button is aria-pressed', () => {
    render(<DisplayNameCard displayName="Alice" avatarKey="bottts-neutral:v2" />);
    expect(screen.getByRole('button', { name: 'Variant 2' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Variant 1' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('clicking the already-selected style button clears the variant selection', () => {
    render(<DisplayNameCard displayName="Alice" avatarKey="bottts-neutral" />);
    // Pick a variant
    fireEvent.click(screen.getByRole('button', { name: 'Variant 1' }));
    expect(screen.getByRole('button', { name: 'Variant 1' })).toHaveAttribute('aria-pressed', 'true');
    // Click the style button again — should clear the variant
    fireEvent.click(screen.getByRole('button', { name: /bottts neutral/i }));
    expect(screen.getByRole('button', { name: 'Variant 1' })).toHaveAttribute('aria-pressed', 'false');
  });
});
