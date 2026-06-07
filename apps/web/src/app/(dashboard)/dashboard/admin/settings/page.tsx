import { requireAdminOrRedirect } from '@/lib/admin-guard';
import { AdminSettingsForm } from './settings-form';
import { adminApi } from '@/lib/api';

/** Server component rendering the admin system-settings form. */
export default async function AdminSettingsPage() {
  await requireAdminOrRedirect('/dashboard/admin/settings');

  const settings = await adminApi.getAdminSettings();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">System Settings</h1>
        <p className="text-muted-foreground">Configure application-wide settings.</p>
      </div>
      <AdminSettingsForm initialSettings={settings} />
    </div>
  );
}
