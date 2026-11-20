/**
 * Pure, browser-safe URL sanitization and role-based redirect resolution utilities.
 *
 * ARCHITECTURAL BOUNDARY:
 * This module has ZERO server-side, Node.js, database, or Prisma dependencies.
 * It is safe to import from both Client Components and Server Middleware/Proxy.
 */

export type UserRole = "BANK_ADMIN" | "BANK_OFFICER" | "LOAN_APPLICANT";

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
 * Validates that a sanitized path strictly belongs to an allowed route prefix.
 * Enforces strict path-boundary delimiters ('/', '?', '#', or exact match)
 * to prevent path-prefix confusion attacks (e.g. /dashboard-evil matching /dashboard).
 */
export function isAllowedRolePath(path: string, allowedPrefix: string): boolean {
  return (
    path === allowedPrefix ||
    path.startsWith(allowedPrefix + "/") ||
    path.startsWith(allowedPrefix + "?") ||
    path.startsWith(allowedPrefix + "#")
  );
}

/**
 * Determines the authoritative redirect destination based on the user's verified role
 * and an optional sanitized returnUrl.
 *
 * Security Invariants:
 * 1. An applicant can never be redirected to an officer or admin portal route.
 * 2. An officer can never be redirected to an admin portal route.
 * 3. All returnUrls are sanitized against protocol-relative and external open redirects.
 * 4. Fallback defaults to the role's primary landing destination.
 * 5. Role routes enforce strict path boundaries to prevent path-prefix confusion.
 */
export function getRoleRedirectDestination(role: UserRole, returnUrl?: string | null): string {
  if (returnUrl) {
    const sanitized = sanitizeReturnUrl(returnUrl);

    if (role === "LOAN_APPLICANT") {
      if (
        isAllowedRolePath(sanitized, "/dashboard") ||
        isAllowedRolePath(sanitized, "/applications")
      ) {
        return sanitized;
      }
    } else if (role === "BANK_OFFICER") {
      if (
        isAllowedRolePath(sanitized, "/officer") ||
        isAllowedRolePath(sanitized, "/dashboard")
      ) {
        return sanitized;
      }
    } else if (role === "BANK_ADMIN") {
      if (
        isAllowedRolePath(sanitized, "/admin") ||
        isAllowedRolePath(sanitized, "/officer") ||
        isAllowedRolePath(sanitized, "/dashboard")
      ) {
        return sanitized;
      }
    }
  }

  // Authoritative default destinations by role
  switch (role) {
    case "BANK_ADMIN":
      return "/admin";
    case "BANK_OFFICER":
      return "/officer";
    case "LOAN_APPLICANT":
    default:
      return "/dashboard";
  }
}
