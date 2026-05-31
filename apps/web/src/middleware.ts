import { NextRequest, NextResponse } from 'next/server';

const PROTECTED_PATHS = ['/dashboard'];

/**
 * Edge middleware — authentication gate only.
 * Checks for the presence of the session cookie; if absent on a protected route,
 * redirects to /login. Project-specific role authorization happens in server
 * components via getProjectAccess(), which can query the API.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PATHS.some((path) => pathname.startsWith(path));
  if (!isProtected) return NextResponse.next();

  // The session cookie name used by @fastify/session + our custom encryption.
  // We only check presence (not validity) — the server validates the session on API calls.
  const sessionCookie = request.cookies.get('sessionId') ?? request.cookies.get('session');
  if (!sessionCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('reason', 'unauthenticated');
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
