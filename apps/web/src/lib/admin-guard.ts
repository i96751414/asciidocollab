import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Server-side guard for admin-only pages.
 * If the current session belongs to a non-admin user, logs the access attempt
 * via POST /admin/access-denied and redirects to /dashboard.
 * If no session exists, redirects directly without logging.
 * Admin users pass through without any action.
 */
export async function requireAdminOrRedirect(resourcePath: string): Promise<void> {
  const profile = await getProfile();

  if (!profile?.isAdmin) {
    if (profile) {
      const cookieStore = await cookies();
      const cookieHeader = cookieStore
        .getAll()
        .map(({ name, value }: { name: string; value: string }) => `${name}=${value}`)
        .join('; ');

      await fetch(`${API_BASE_URL}/admin/access-denied`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader,
        },
        body: JSON.stringify({ resource: resourcePath }),
      }).catch(() => {});
    }

    redirect('/dashboard');
  }
}
