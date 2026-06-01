import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Paths that are always accessible without auth
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/accept-invite",
  "/verify-email",
  "/verify-email-required",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "?"));
}

/**
 * Next.js edge proxy that enforces authentication and email-verification on
 * dashboard routes by consulting the API's /auth/session-status endpoint.
 *
 * @param request - Incoming Next.js request.
 * @returns A redirect or pass-through response.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const cookieHeader = request.headers.get("cookie") ?? "";

  try {
    const response = await fetch(`${INTERNAL_API_URL}/auth/session-status`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
    });

    if (!response.ok) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // fetch().json() returns any — access fields directly without assertion.
    const session = await response.json();
    const authenticated: boolean = Boolean(session?.authenticated);
    const emailVerified: boolean = Boolean(session?.emailVerified);

    if (!authenticated) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (!emailVerified) {
      return NextResponse.redirect(new URL("/verify-email-required", request.url));
    }

    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: [
    "/dashboard/:path*",
  ],
};
