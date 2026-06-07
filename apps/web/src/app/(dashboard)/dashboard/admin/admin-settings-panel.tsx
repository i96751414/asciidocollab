'use client';

import { useState, useEffect } from 'react';
import { adminApi, AdminSettings } from '@/lib/api';
import { AdminSettingsForm } from './settings/settings-form';

/** Fetches admin settings client-side and renders AdminSettingsForm with the loaded data. */
export function AdminSettingsPanel() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    adminApi.getAdminSettings()
      .then(setSettings)
      .catch(() => setError(true));
  }, []);

  if (error) {
    return <p role="alert" className="text-sm text-destructive">Failed to load settings.</p>;
  }
  if (!settings) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  return <AdminSettingsForm initialSettings={settings} />;
}
