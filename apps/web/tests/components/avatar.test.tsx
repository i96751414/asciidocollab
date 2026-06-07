import React from 'react';
import { render, screen } from '@testing-library/react';
import { Avatar } from '@/components/avatar';

jest.mock('@dicebear/core', () => ({
  createAvatar: jest.fn().mockReturnValue({ toString: () => '<svg data-testid="dicebear-svg">mock</svg>' }),
}));

jest.mock('@/lib/avatars', () => ({
  DICEBEAR_STYLES: {
    'initial-face': { style: 'initialFaceStyle' },
    'bottts': { style: 'bottsStyle' },
  },
  DEFAULT_AVATAR_STYLE: 'initial-face',
}), { virtual: true });

describe('Avatar', () => {
  test('renders SVG for a known style key', () => {
    const { createAvatar } = require('@dicebear/core');
    render(<Avatar avatarKey="bottts" displayName="Alice" />);
    expect(createAvatar).toHaveBeenCalledWith('bottsStyle', expect.objectContaining({ seed: 'Alice' }));
    expect(screen.getByTestId('dicebear-svg')).toBeInTheDocument();
  });

  test('falls back to DEFAULT_AVATAR_STYLE for null key', () => {
    const { createAvatar } = require('@dicebear/core');
    (createAvatar as jest.Mock).mockClear();
    render(<Avatar avatarKey={null} displayName="Bob" />);
    expect(createAvatar).toHaveBeenCalledWith('initialFaceStyle', expect.objectContaining({ seed: 'Bob' }));
  });

  test('falls back to DEFAULT_AVATAR_STYLE for unknown key', () => {
    const { createAvatar } = require('@dicebear/core');
    (createAvatar as jest.Mock).mockClear();
    render(<Avatar avatarKey="nonexistent-style" displayName="Carol" />);
    expect(createAvatar).toHaveBeenCalledWith('initialFaceStyle', expect.objectContaining({ seed: 'Carol' }));
  });

  test('different display names produce different seed', () => {
    const { createAvatar } = require('@dicebear/core');
    (createAvatar as jest.Mock).mockClear();
    render(<Avatar avatarKey="initial-face" displayName="Alice" />);
    render(<Avatar avatarKey="initial-face" displayName="David" />);
    const calls = (createAvatar as jest.Mock).mock.calls;
    expect(calls[0][1].seed).toBe('Alice');
    expect(calls[1][1].seed).toBe('David');
  });
});
