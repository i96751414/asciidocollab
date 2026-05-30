import { cookies } from 'next/headers';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Returns the current session by forwarding the browser's cookies to the API.
 * For use in Next.js Server Components only.
 *
 * @returns The session object with userId, or null when no valid session exists.
 */
export async function getSession(): Promise<{ userId: string } | null> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore
      .getAll()
      .map(({ name, value }) => `${name}=${value}`)
      .join('; ');

    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Cookie: cookieHeader },
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch {
    return null;
  }
}
