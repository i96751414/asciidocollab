import React from 'react';
import { render } from '@testing-library/react';
import { Logo, LogoIcon, LogoMark } from '@/components/logo';

describe('Logo components', () => {
  test('LogoIcon renders an svg labelled with the brand name', () => {
    const { container } = render(<LogoIcon />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('aria-label', 'AsciiDoCollab');
  });

  test('LogoMark renders a single-colour svg using currentColor', () => {
    const { container } = render(<LogoMark />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('fill', 'currentColor');
  });

  test('Logo renders the wordmark inline (no link) by default', () => {
    const { container } = render(<Logo />);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('Asciido');
    expect(container.textContent).toContain('collab');
  });

  test('Logo renders as a link to the given href', () => {
    const { container } = render(<Logo href="/dashboard" />);
    expect(container.querySelector('a')).toHaveAttribute('href', '/dashboard');
  });
});
