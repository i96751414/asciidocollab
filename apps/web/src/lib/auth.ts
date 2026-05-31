import { cache } from 'react';
import { cookies } from 'next/headers';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Minimal session data returned by /auth/me. */
export interface SessionData {
  /** The authenticated user's ID. */
  userId: string;
}

/** Full profile data returned by /auth/me. */
export interface ProfileData {
  /** The authenticated user's ID. */
  userId: string;
  /** The user's display name. */
  displayName: string;
  /** The user's email address. */
  email: string;
}

/**
 * Fetches /auth/me and parses the JSON body, forwarding the browser's session cookies.
 * Memoized with React.cache() so layout and page share a single HTTP round-trip per render.
 * For use in Next.js Server Components only.
 */
const fetchMeData = cache(async (): Promise<ProfileData | null> => {
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
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
});

/**
 * Returns the current session by forwarding the browser's cookies to the API.
 * For use in Next.js Server Components only.
 */
export async function getSession(): Promise<SessionData | null> {
  const profile = await fetchMeData();
  if (!profile) return null;
  return { userId: profile.userId };
}

/**
 * Returns the full user profile by forwarding the browser's cookies to the API.
 * For use in Next.js Server Components only.
 */
export async function getProfile(): Promise<ProfileData | null> {
  return fetchMeData();
}
