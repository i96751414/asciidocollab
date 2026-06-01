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

// Paths that don't need middleware processing (static assets etc.)
function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "?"));
}

/** Next.js middleware that enforces authentication and email-verification on dashboard routes. */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Forward cookies to the internal API to get session status
  const cookieHeader = request.headers.get("cookie") ?? "";

  try {
    const response = await fetch(`${INTERNAL_API_URL}/auth/session-status`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // fetch().json() returns any — access fields directly without assertion.
    const session = await response.json();
    const authenticated: boolean = Boolean(session?.authenticated);
    const emailVerified: boolean = Boolean(session?.emailVerified);

    if (!authenticated) {
      return NextResponse.redirect(new URL("/login", request.url));
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
