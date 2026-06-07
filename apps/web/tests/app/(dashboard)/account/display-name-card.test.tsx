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
    'initial-face': { style: {}, label: 'Initials' },
    'bottts': { style: {}, label: 'Bottts' },
    'pixel-art': { style: {}, label: 'Pixel Art' },
  },
  DEFAULT_AVATAR_STYLE: 'initial-face',
}));

describe('DisplayNameCard with avatar picker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders all DiceBear styles as selectable options', () => {
    render(<DisplayNameCard displayName="Alice" avatarKey={null} />);
    for (const label of ['Initials', 'Bottts', 'Pixel Art']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  test('highlights the active style', () => {
    render(<DisplayNameCard displayName="Alice" avatarKey="bottts" />);
    const activeButton = screen.getByRole('button', { name: /bottts/i });
    expect(activeButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('submit PATCH includes selected avatarKey', async () => {
    render(<DisplayNameCard displayName="Alice" avatarKey={null} />);
    fireEvent.click(screen.getByRole('button', { name: /bottts/i }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Alice Updated' } });
    fireEvent.submit(screen.getByRole('form', { name: /update display name/i }));
    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'Alice Updated', avatarKey: 'bottts' }),
      );
    });
  });
});
