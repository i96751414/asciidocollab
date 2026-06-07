import { requireAdminOrRedirect } from '@/lib/admin-guard';
import { adminApi } from '@/lib/api';
import { UsersClient } from './users/users-client';
import { AdminSettingsForm } from './settings/settings-form';

/** Server component rendering the combined administrator settings page (users + system settings). */
export default async function AdminPage() {
  await requireAdminOrRedirect('/dashboard/admin');

  const settings = await adminApi.getAdminSettings();

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Administrator Settings</h1>
        <p className="text-muted-foreground">Manage users and system configuration.</p>
      </div>
      <section>
        <h2 className="text-xl font-semibold mb-4">Users</h2>
        <UsersClient />
      </section>
      <section>
        <h2 className="text-xl font-semibold mb-4">System Settings</h2>
        <AdminSettingsForm initialSettings={settings} />
      </section>
    </div>
  );
}
