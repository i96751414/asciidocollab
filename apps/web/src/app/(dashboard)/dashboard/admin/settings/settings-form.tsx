'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { adminApi, AdminSettings } from '@/lib/api';

interface AdminSettingsFormProperties {
  initialSettings: AdminSettings;
}

/** Form for editing global admin settings: open registration toggle and max upload size. */
export function AdminSettingsForm({ initialSettings }: AdminSettingsFormProperties) {
  const [openRegistration, setOpenRegistration] = useState(initialSettings.openRegistration);
  const [maxUploadSizeBytes, setMaxUploadSizeBytes] = useState(initialSettings.maxUploadSizeBytes ?? 0);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        await adminApi.updateAdminSettings({ openRegistration, maxUploadSizeBytes });
        setMessage('Settings saved');
      } catch {
        setError('Failed to save settings');
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Registration</CardTitle>
          <CardDescription>Control who can register for the application.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="openRegistration"
              checked={openRegistration}
              onChange={(event) => setOpenRegistration(event.target.checked)}
              className="h-4 w-4 rounded border"
            />
            <Label htmlFor="openRegistration">Open Registration</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Uploads</CardTitle>
          <CardDescription>Configure upload limits.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="maxUploadSizeBytes">Max Upload Size (bytes)</Label>
            <Input
              id="maxUploadSizeBytes"
              type="number"
              min={1}
              value={maxUploadSizeBytes}
              onChange={(event) => setMaxUploadSizeBytes(Number(event.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="text-sm text-green-700">{message}</p>}

      <Button onClick={handleSave} disabled={isPending}>
        {isPending ? 'Saving…' : 'Save Settings'}
      </Button>
    </div>
  );
}
