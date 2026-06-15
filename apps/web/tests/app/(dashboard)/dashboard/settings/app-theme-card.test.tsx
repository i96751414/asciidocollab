import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppThemeCard } from '@/app/(dashboard)/dashboard/settings/app-theme-card';

const mockSetTheme = jest.fn();
let currentTheme = 'system';
jest.mock('@/hooks/use-theme', () => ({
  useTheme: () => ({ theme: currentTheme, setTheme: mockSetTheme }),
}));

describe('AppThemeCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentTheme = 'system';
  });

  test('renders all three theme options', () => {
    render(<AppThemeCard />);
    for (const label of ['Light', 'Dark', 'Auto']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  test('marks the active theme button as pressed', () => {
    currentTheme = 'dark';
    render(<AppThemeCard />);
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('calls setTheme with the selected value when a button is clicked', () => {
    render(<AppThemeCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });

  test('maps the Auto label to the system value', () => {
    render(<AppThemeCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Auto' }));
    expect(mockSetTheme).toHaveBeenCalledWith('system');
  });
});
