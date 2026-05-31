import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js edge proxy — redirects unauthenticated requests to /login.
 * Runs at the edge before any page renders; checks cookie presence only.
 * Session validity is confirmed by the layout's getSession() call.
 *
 * @param request - Incoming Next.js request.
 * @returns A redirect response when the session cookie is absent, or passes through.
 */
export function proxy(request: NextRequest) {
  const session =
    request.cookies.get("sessionId") ?? request.cookies.get("session");

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    loginUrl.searchParams.set("reason", "unauthenticated");
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/(dashboard|projects)(.*)"],
};
