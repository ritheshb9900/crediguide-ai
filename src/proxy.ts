import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { requireCsrf } from "@/lib/auth/csrf";
import { sanitizeReturnUrl } from "@/lib/auth/redirects";

export { sanitizeReturnUrl };

/**
 * Next.js 16 Early Routing Guard & Early CSRF Perimeter (Proxy)
 *
 * ARCHITECTURAL BOUNDARIES & SECURITY GUARANTEES:
 * 1. Early CSRF Defense Perimeter:
 *    - Rejects cross-origin and invalid Content-Type requests targeting protected
 *      mutation endpoints before route execution.
 *    - Downstream route handlers also independently enforce requireCsrf() authoritatively.
 * 2. Non-Authoritative Early Authentication Guard:
 *    - Operates at the network boundary to quickly reject unauthenticated requests
 *      targeting protected administrative, officer, and applicant portal paths.
 *    - Public authentication endpoints (/api/auth/login, /api/auth/register, etc.)
 *      proceed upstream to handler logic.
 * 3. Downstream Defense-in-Depth:
 *    - A cookie's presence allows the request through to downstream route handlers.
 *    - Every protected API route independently verifies the database session, token hash,
 *      revocation state, and user role via requireAuth / requireRole.
 * 4. Open Redirect Mitigation:
 *    - All returnUrl redirect targets are strictly sanitized.
 * 5. Loop Prevention:
 *    - Never redirects if already on an authentication route.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const method = request.method.toUpperCase();

  // Never redirect auth UI routes to avoid redirect loops
  if (pathname.startsWith("/auth/")) {
    return NextResponse.next();
  }

  // 1. Early CSRF Protection Perimeter for Protected Mutation Endpoints
  const isMutatingMethod =
    method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";

  if (isMutatingMethod) {
    if (pathname === "/api/auth/logout") {
      const csrfError = requireCsrf(request, { allowEmptyBody: true });
      if (csrfError) {
        return csrfError;
      }
    } else if (
      pathname === "/api/auth/register" ||
      pathname === "/api/auth/login" ||
      pathname === "/api/auth/forgot-password" ||
      pathname === "/api/auth/reset-password" ||
      pathname === "/api/auth/verify-email" ||
      pathname === "/api/auth/resend-verification" ||
      pathname.startsWith("/api/admin/")
    ) {
      const csrfError = requireCsrf(request);
      if (csrfError) {
        return csrfError;
      }
    }
  }

  // 2. Early Authentication Guard for Protected Portals
  const isProtectedArea =
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/officer" ||
    pathname.startsWith("/officer/") ||
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/applications" ||
    pathname.startsWith("/applications/") ||
    pathname.startsWith("/api/admin/") ||
    pathname.startsWith("/api/officer/") ||
    pathname.startsWith("/api/applicant/");

  if (isProtectedArea) {
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
  }

  // Allow request upstream to downstream handlers
  return NextResponse.next();
}

/**
 * Next.js 16 Proxy route matcher.
 * Intercepts protected administrative, officer, applicant dashboard, and authentication mutation paths.
 */
export const config = {
  matcher: [
    "/admin/:path*",
    "/officer/:path*",
    "/dashboard/:path*",
    "/applications/:path*",
    "/api/admin/:path*",
    "/api/officer/:path*",
    "/api/applicant/:path*",
    "/api/auth/:path*",
  ],
};
