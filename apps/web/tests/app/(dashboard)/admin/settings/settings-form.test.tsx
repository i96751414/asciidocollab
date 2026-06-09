import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdminSettingsForm } from '@/app/(dashboard)/dashboard/admin/settings/settings-form';

const mockUpdateAdminSettings = jest.fn();
jest.mock('@/lib/api', () => ({
  adminApi: {
    updateAdminSettings: (...a: unknown[]) => mockUpdateAdminSettings(...a),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateAdminSettings.mockResolvedValue(undefined);
});

describe('AdminSettingsForm', () => {
  test('defaults the upload size to 0 when the initial value is null', () => {
    render(<AdminSettingsForm initialSettings={{ maxUploadSizeBytes: null } as never} />);
    expect(screen.getByLabelText(/max upload size/i)).toHaveValue(0);
  });

  test('pre-fills the upload size from the initial settings', () => {
    render(<AdminSettingsForm initialSettings={{ maxUploadSizeBytes: 5000 } as never} />);
    expect(screen.getByLabelText(/max upload size/i)).toHaveValue(5000);
  });

  test('shows a success message after saving', async () => {
    render(<AdminSettingsForm initialSettings={{ maxUploadSizeBytes: 1000 } as never} />);
    fireEvent.change(screen.getByLabelText(/max upload size/i), { target: { value: '2048' } });
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/settings saved/i));
    expect(mockUpdateAdminSettings).toHaveBeenCalledWith({ maxUploadSizeBytes: 2048 });
  });

  test('shows an error message when saving fails', async () => {
    mockUpdateAdminSettings.mockRejectedValueOnce(new Error('nope'));
    render(<AdminSettingsForm initialSettings={{ maxUploadSizeBytes: 1000 } as never} />);
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/failed to save settings/i));
  });
});
