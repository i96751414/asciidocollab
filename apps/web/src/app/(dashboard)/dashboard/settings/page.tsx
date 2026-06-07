import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth';
import { KeyboardShortcutsCard } from '@/app/(dashboard)/dashboard/account/keyboard-shortcuts-card';
import { AppThemeCard } from './app-theme-card';
import { EditorPreferencesCard } from './editor-preferences-card';

/** Server component that renders the application settings page (theme, editor preferences, and keyboard shortcuts). */
export default async function SettingsPage() {
  const profile = await getProfile();
  if (!profile) {
    redirect('/login?reason=expired');
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Manage your application preferences</p>
      </div>
      <AppThemeCard />
      <EditorPreferencesCard />
      <KeyboardShortcutsCard />
    </div>
  );
}
