import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeToggle } from '@/components/theme-toggle';
import type { Theme } from '@/hooks/use-theme';

const mockSetTheme = jest.fn();
let mockResolvedTheme: 'light' | 'dark' = 'light';
let lastInitialTheme: Theme | undefined;

jest.mock('@/hooks/use-theme', () => ({
  useTheme: (initialTheme?: Theme) => {
    lastInitialTheme = initialTheme;
    return { resolvedTheme: mockResolvedTheme, theme: mockResolvedTheme, setTheme: mockSetTheme };
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockResolvedTheme = 'light';
  lastInitialTheme = undefined;
});

describe('ThemeToggle', () => {
  test('renders the dark-mode affordance when resolved theme is light', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument();
  });

  test('renders the light-mode affordance when resolved theme is dark', () => {
    mockResolvedTheme = 'dark';
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument();
  });

  test('switches to dark when currently light', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  test('switches to light when currently dark', () => {
    mockResolvedTheme = 'dark';
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });

  test('merges a custom className', () => {
    render(<ThemeToggle className="ml-2" />);
    expect(screen.getByRole('button')).toHaveClass('ml-2');
  });

  test('forwards the initialTheme preference to the hook', () => {
    render(<ThemeToggle initialTheme="dark" />);
    expect(lastInitialTheme).toBe('dark');
  });
});
