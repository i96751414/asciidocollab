import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminSettingsPanel } from '@/app/(dashboard)/dashboard/admin/admin-settings-panel';

const mockGetAdminSettings = jest.fn();
jest.mock('@/lib/api', () => ({
  adminApi: {
    getAdminSettings: () => mockGetAdminSettings(),
    updateAdminSettings: jest.fn(),
  },
}));

const SETTINGS = { openRegistration: true, maxUploadSizeBytes: 4096 };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAdminSettings.mockResolvedValue(SETTINGS);
});

describe('AdminSettingsPanel', () => {
  test('shows a loading message before settings resolve', () => {
    mockGetAdminSettings.mockReturnValue(new Promise(() => { /* never resolves */ }));
    render(<AdminSettingsPanel />);
    expect(screen.getByText(/loading…/i)).toBeInTheDocument();
  });

  test('renders the settings form once settings load', async () => {
    render(<AdminSettingsPanel />);
    await waitFor(() => expect(screen.getByLabelText(/max upload size/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /save settings/i })).toBeInTheDocument();
  });

  test('shows an error message when loading settings fails', async () => {
    mockGetAdminSettings.mockRejectedValue(new Error('boom'));
    render(<AdminSettingsPanel />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to load settings/i);
    });
  });
});
