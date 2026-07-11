import React from 'react';
import { render, screen } from '@testing-library/react';
import { Avatar } from '@/components/avatar';

const avatarConstructor = jest.fn();

jest.mock('@dicebear/core', () => ({
  Avatar: jest.fn().mockImplementation((style: unknown, options: unknown) => {
    avatarConstructor(style, options);
    return { toString: () => '<svg data-testid="dicebear-svg"><g id="head-x"></g><use href="#head-x"></use></svg>' };
  }),
}));

jest.mock('@/lib/avatars', () => ({
  DICEBEAR_STYLES: {
    'initials': { style: 'initialsStyle' },
    'initial-face': {
      style: 'initialFaceStyle',
      variants: [
        { id: '1', options: { eyesVariant: 'variant01', backgroundColor: ['#111111'] } },
        { id: '2', options: { eyesVariant: 'variant02', backgroundColor: ['#222222'] } },
      ],
    },
    'bottts': {
      style: 'bottsStyle',
      variants: [
        { id: '1', options: { seed: '1' } },
        { id: '2', options: { seed: '2' } },
      ],
    },
  },
  DEFAULT_AVATAR_STYLE: 'initials',
}));

describe('Avatar', () => {
  beforeEach(() => {
    avatarConstructor.mockClear();
  });

  test('renders SVG for a known style key', () => {
    render(<Avatar avatarKey="bottts" displayName="Alice" />);
    expect(avatarConstructor).toHaveBeenCalledWith('bottsStyle', expect.objectContaining({ seed: 'Alice' }));
    expect(screen.getByTestId('dicebear-svg')).toBeInTheDocument();
  });

  test('falls back to DEFAULT_AVATAR_STYLE for null key', () => {
    render(<Avatar avatarKey={null} displayName="Bob" />);
    expect(avatarConstructor).toHaveBeenCalledWith('initialsStyle', expect.objectContaining({ seed: 'Bob' }));
  });

  test('falls back to DEFAULT_AVATAR_STYLE for unknown key', () => {
    render(<Avatar avatarKey="nonexistent-style" displayName="Carol" />);
    expect(avatarConstructor).toHaveBeenCalledWith('initialsStyle', expect.objectContaining({ seed: 'Carol' }));
  });

  test('different display names produce different seed', () => {
    render(<Avatar avatarKey="initial-face" displayName="Alice" />);
    render(<Avatar avatarKey="initial-face" displayName="David" />);
    const calls = avatarConstructor.mock.calls;
    expect(calls[0][1].seed).toBe('Alice');
    expect(calls[1][1].seed).toBe('David');
  });

  test('a seed-varied style uses the variant as the seed', () => {
    render(<Avatar avatarKey="bottts:2" displayName="Alice" />);
    expect(avatarConstructor).toHaveBeenCalledWith('bottsStyle', expect.objectContaining({ seed: '2' }));
  });

  test('an initial-face variant keeps the name seed (initials persist) but swaps eyes and background', () => {
    render(<Avatar avatarKey="initial-face:2" displayName="Jane Doe" />);
    expect(avatarConstructor).toHaveBeenCalledWith(
      'initialFaceStyle',
      expect.objectContaining({ seed: 'Jane Doe', eyesVariant: 'variant02', backgroundColor: ['#222222'] }),
    );
  });

  test('ignores a variant when the style has no variants list', () => {
    render(<Avatar avatarKey="initials:1" displayName="Eve" />);
    // 'initials' has no variants → no variant options merged, seed stays the name.
    expect(avatarConstructor).toHaveBeenCalledWith('initialsStyle', expect.objectContaining({ seed: 'Eve' }));
  });

  test('ignores a variant id that does not exist in the style', () => {
    render(<Avatar avatarKey="bottts:99" displayName="Frank" />);
    // Variant 99 is not found → falls back to the base options (seed = name).
    expect(avatarConstructor).toHaveBeenCalledWith('bottsStyle', expect.objectContaining({ seed: 'Frank' }));
  });

  test('namespaces svg ids so same-seed avatars on a page do not collide', () => {
    const { container: a } = render(<Avatar avatarKey="initial-face:1" displayName="Jane" />);
    const { container: b } = render(<Avatar avatarKey="initial-face:2" displayName="Jane" />);
    const idA = a.querySelector('g[id]')!.getAttribute('id');
    const idB = b.querySelector('g[id]')!.getAttribute('id');
    // Different avatarKeys must yield different ids, even though the seed (name) is identical.
    expect(idA).not.toBe(idB);
    // Each svg's internal reference still points at its own (namespaced) id.
    expect(a.querySelector('use')!.getAttribute('href')).toBe(`#${idA}`);
    expect(b.querySelector('use')!.getAttribute('href')).toBe(`#${idB}`);
  });
});
