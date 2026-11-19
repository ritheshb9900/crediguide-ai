import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

/**
 * Validates and normalizes a candidate returnUrl to prevent Open Redirect vulnerabilities.
 *
 * Rules:
 * - Must be an absolute-path relative URL starting with a single '/'
 * - Must NOT start with '//' (protocol-relative external redirect)
 * - Must NOT start with '/\' (Windows backslash path traversal / scheme trick)
 * - Must NOT contain ':' or '@' (disallows http:, https:, javascript:, data:, credentials)
 * - Falls back to safe default '/' on any violation
 */
export function sanitizeReturnUrl(candidate: string | null | undefined): string {
  if (!candidate || typeof candidate !== "string") {
    return "/";
  }

  const trimmed = candidate.trim();

  // Must begin with a single '/'
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return "/";
  }

  // Reject scheme/protocol or authority indicators
  if (trimmed.includes(":") || trimmed.includes("@") || trimmed.includes("\\")) {
    return "/";
  }

  return trimmed;
}

/**
 * Next.js 16 Early Routing Guard (Proxy)
 *
 * ARCHITECTURAL BOUNDARIES & SECURITY GUARANTEES:
 * 1. Non-Authoritative Early Guard:
 *    - Operates at the network boundary to quickly reject unauthenticated requests
 *      or redirect unauthenticated browser users to the login page.
 *    - Does NOT validate database sessions or role permissions.
 * 2. Downstream Defense-in-Depth:
 *    - A cookie's presence allows the request through to downstream route handlers.
 *    - Every protected API route independently verifies the database session, token hash,
 *      revocation state, and user role via requireAuth / requireRole.
 *    - Forged, expired, or revoked cookies are authoritatively rejected (401) downstream.
 * 3. Open Redirect Mitigation:
 *    - All returnUrl redirect targets are strictly sanitized.
 * 4. Loop Prevention:
 *    - Never redirects if already on an authentication route.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Never redirect auth routes to avoid redirect loops
  if (pathname.startsWith("/auth/")) {
    return NextResponse.next();
  }

  const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);

  if (!hasSessionCookie) {
    // For protected API endpoints, fast-fail with 401 Unauthorized JSON
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          success: false,
          error: "UNAUTHENTICATED",
          message: "Authentication required. No session cookie provided.",
        },
        { status: 401 }
      );
    }

    // For protected UI pages, redirect to login page with sanitized returnUrl
    const safeReturnUrl = sanitizeReturnUrl(`${pathname}${search}`);
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("returnUrl", safeReturnUrl);

    return NextResponse.redirect(loginUrl);
  }

  // Cookie is present -> Allow request upstream to authoritative server validation
  return NextResponse.next();
}

/**
 * Next.js 16 Proxy route matcher.
 * Intercepts protected administrative, officer, and applicant dashboard paths.
 */
export const config = {
  matcher: [
    "/admin/:path*",
    "/officer/:path*",
    "/dashboard/:path*",
    "/applications/:path*",
    "/api/admin/:path*",
    "/api/officer/:path*",
  ],
};
