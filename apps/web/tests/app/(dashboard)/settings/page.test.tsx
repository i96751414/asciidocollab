import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('@/lib/auth', () => ({
  getProfile: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn().mockImplementation((url: string) => {
    const error = new Error(`NEXT_REDIRECT:${url}`);
    Object.defineProperty(error, 'digest', { value: `NEXT_REDIRECT:${url}` });
    throw error;
  }),
}));

jest.mock('@/app/(dashboard)/dashboard/account/keyboard-shortcuts-card', () => ({
  KeyboardShortcutsCard: () => <div data-testid="keyboard-shortcuts-card" />,
}));

jest.mock('@/app/(dashboard)/dashboard/settings/app-theme-card', () => ({
  AppThemeCard: () => <div data-testid="app-theme-card" />,
}));

jest.mock('@/app/(dashboard)/dashboard/settings/editor-preferences-card', () => ({
  EditorPreferencesCard: () => <div data-testid="editor-preferences-card" />,
}));

const defaultProfile = {
  userId: 'u1',
  displayName: 'Alice',
  email: 'alice@example.com',
  isAdmin: false,
  emailVerified: true,
  avatarKey: null,
  appTheme: 'system',
};

describe('SettingsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders AppThemeCard', async () => {
    const { getProfile } = require('@/lib/auth');
    const { default: SettingsPage } = require('@/app/(dashboard)/dashboard/settings/page');
    (getProfile as jest.Mock).mockResolvedValue(defaultProfile);
    render(await SettingsPage());
    expect(screen.getByTestId('app-theme-card')).toBeInTheDocument();
  });

  test('renders KeyboardShortcutsCard', async () => {
    const { getProfile } = require('@/lib/auth');
    const { default: SettingsPage } = require('@/app/(dashboard)/dashboard/settings/page');
    (getProfile as jest.Mock).mockResolvedValue(defaultProfile);
    render(await SettingsPage());
    expect(screen.getByTestId('keyboard-shortcuts-card')).toBeInTheDocument();
  });

  test('renders EditorPreferencesCard', async () => {
    const { getProfile } = require('@/lib/auth');
    const { default: SettingsPage } = require('@/app/(dashboard)/dashboard/settings/page');
    (getProfile as jest.Mock).mockResolvedValue(defaultProfile);
    render(await SettingsPage());
    expect(screen.getByTestId('editor-preferences-card')).toBeInTheDocument();
  });

  test('redirects to /login?reason=expired when profile is null', async () => {
    const { getProfile } = require('@/lib/auth');
    const { redirect } = require('next/navigation');
    const { default: SettingsPage } = require('@/app/(dashboard)/dashboard/settings/page');
    (getProfile as jest.Mock).mockResolvedValue(null);
    await expect(SettingsPage()).rejects.toThrow('NEXT_REDIRECT:/login?reason=expired');
    expect(redirect).toHaveBeenCalledWith('/login?reason=expired');
  });
});
