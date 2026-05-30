import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Proxy to protect routes that require authentication.
 * Checks for session cookie and redirects to login if not authenticated.
 */
export function proxy(request: NextRequest) {
  const session = request.cookies.get("session");

  // Protected routes that require authentication
  const protectedPaths = ["/dashboard"];
  const isProtectedPath = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (isProtectedPath && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
