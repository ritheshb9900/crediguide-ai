import { prisma } from "@/lib/prisma";
import { generateSecureToken, hashToken } from "./tokens";
import {
  AuthUser,
  SessionData,
  SessionContext,
  SessionValidationResult,
  SessionCookieConfig,
  OfficerProfileSummary,
} from "./types";

/**
 * Enterprise session constants
 */
export const SESSION_COOKIE_NAME = "crediguide_session";
export const SESSION_EXPIRATION_DAYS = 7;
export const SESSION_EXPIRATION_MS = SESSION_EXPIRATION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Generates the standard HTTP cookie configuration for crediguide_session.
 *
 * Flags:
 * - name: crediguide_session
 * - httpOnly: true (inaccessible to client JavaScript / XSS protection)
 * - sameSite: "lax" (mitigates CSRF on cross-site requests while supporting top-level navigations)
 * - path: "/"
 * - secure: true in production, false for localhost HTTP development
 * - maxAge: 7 days in seconds
 */
export function getSessionCookieConfig(
  secretToken: string,
  expiresAt: Date
): SessionCookieConfig {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    name: SESSION_COOKIE_NAME,
    value: secretToken,
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_EXPIRATION_DAYS * 24 * 60 * 60,
    expires: expiresAt,
  };
}

/**
 * Generates an expired cookie config to delete/clear the session cookie upon logout.
 */
export function getExpiredSessionCookieConfig(): SessionCookieConfig {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  };
}

/**
 * Extracts the raw session token from a standard Request's Cookie header.
 *
 * @param request - Standard Web Request or NextRequest.
 * @returns Raw session token string if present and valid, otherwise null.
 */
export function extractSessionTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const name = trimmed.substring(0, separatorIndex).trim();
    const value = trimmed.substring(separatorIndex + 1).trim();

    if (name === SESSION_COOKIE_NAME) {
      return value && value.length > 0 ? value : null;
    }
  }

  return null;
}

/**
 * Creates a new database-backed session in PostgreSQL.
 *
 * SECURITY INVARIANT:
 * - Generates 256 bits of cryptographically secure random entropy (`rawToken`).
 * - ONLY the SHA-256 digest (`tokenHash`) is written to `user_sessions`.
 * - The `rawToken` is returned to the caller to be placed in an HttpOnly cookie.
 * - The raw token is NEVER persisted to the database.
 *
 * @param userId - ID of the authenticating User.
 * @param metadata - Optional IP address and User-Agent headers.
 * @returns Object containing the created database record and the raw secret token.
 */
export async function createDatabaseSession(
  userId: string,
  metadata?: { ipAddress?: string; userAgent?: string }
): Promise<{ session: SessionData; rawToken: string; cookieConfig: SessionCookieConfig }> {
  if (!userId || typeof userId !== "string") {
    throw new Error("userId must be a valid string.");
  }

  const rawToken = generateSecureToken(32); // 256 bits
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_EXPIRATION_MS);

  const dbSession = await prisma.userSession.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      ipAddress: metadata?.ipAddress ?? null,
      userAgent: metadata?.userAgent ?? null,
    },
  });

  const session: SessionData = {
    id: dbSession.id,
    userId: dbSession.userId,
    tokenHash: dbSession.tokenHash,
    expiresAt: dbSession.expiresAt,
    revokedAt: dbSession.revokedAt,
    ipAddress: dbSession.ipAddress,
    userAgent: dbSession.userAgent,
    createdAt: dbSession.createdAt,
  };

  const cookieConfig = getSessionCookieConfig(rawToken, expiresAt);

  return {
    session,
    rawToken,
    cookieConfig,
  };
}

/**
 * Validates an incoming raw session secret from an HttpOnly cookie.
 *
 * Checks:
 * 1. Token format.
 * 2. Database lookup via SHA-256 `tokenHash`.
 * 3. `revokedAt === null`.
 * 4. `expiresAt > new Date()`.
 * 5. `user.isActive === true`.
 *
 * @param rawToken - Raw session secret string from `crediguide_session` cookie.
 * @returns Structured validation result with full session context on success.
 */
export async function validateDatabaseSession(
  rawToken: string | undefined | null
): Promise<SessionValidationResult> {
  if (!rawToken || typeof rawToken !== "string" || rawToken.trim().length === 0) {
    return { isValid: false, reason: "MALFORMED" };
  }

  const tokenHash = hashToken(rawToken.trim());

  const record = await prisma.userSession.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          applicantProfile: {
            select: { id: true },
          },
          officerProfile: true,
        },
      },
    },
  });

  if (!record) {
    return { isValid: false, reason: "NOT_FOUND" };
  }

  // 1. Check if session was explicitly revoked (e.g. via logout, password reset, or admin action)
  if (record.revokedAt !== null) {
    return { isValid: false, reason: "REVOKED" };
  }

  // 2. Check if session has expired past its 7-day TTL
  if (record.expiresAt.getTime() <= Date.now()) {
    return { isValid: false, reason: "EXPIRED" };
  }

  // 3. Check if user account has been deactivated
  if (!record.user.isActive) {
    return { isValid: false, reason: "INACTIVE_USER" };
  }

  const user: AuthUser = {
    id: record.user.id,
    email: record.user.email,
    role: record.user.role,
    firstName: record.user.firstName,
    lastName: record.user.lastName,
    phone: record.user.phone,
    isActive: record.user.isActive,
    isEmailVerified: record.user.isEmailVerified,
    failedLoginAttempts: record.user.failedLoginAttempts,
    lockedUntil: record.user.lockedUntil,
    lastLoginAt: record.user.lastLoginAt,
    createdAt: record.user.createdAt,
    updatedAt: record.user.updatedAt,
  };

  const session: SessionData = {
    id: record.id,
    userId: record.userId,
    tokenHash: record.tokenHash,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
    ipAddress: record.ipAddress,
    userAgent: record.userAgent,
    createdAt: record.createdAt,
  };

  let officerProfile: OfficerProfileSummary | null = null;
  if (record.user.officerProfile) {
    officerProfile = {
      id: record.user.officerProfile.id,
      employeeCode: record.user.officerProfile.employeeCode,
      department: record.user.officerProfile.department,
      branchCode: record.user.officerProfile.branchCode,
      designation: record.user.officerProfile.designation,
      approvalLimitAmount: Number(record.user.officerProfile.approvalLimitAmount),
    };
  }

  const context: SessionContext = {
    user,
    session,
    applicantId: record.user.applicantProfile?.id ?? null,
    officerProfile,
  };

  return {
    isValid: true,
    context,
  };
}

/**
 * Revokes a session given its raw token (e.g. during logout).
 *
 * @param rawToken - Raw session token from cookie.
 * @returns boolean indicating whether an active session was revoked.
 */
export async function revokeDatabaseSession(
  rawToken: string | undefined | null
): Promise<boolean> {
  if (!rawToken || typeof rawToken !== "string") {
    return false;
  }

  const tokenHash = hashToken(rawToken.trim());

  const result = await prisma.userSession.updateMany({
    where: {
      tokenHash,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  return result.count > 0;
}

/**
 * Revokes all active sessions for a specific user.
 * Triggered on password change, password reset, or account deactivation.
 *
 * @param userId - Master User ID.
 * @returns Number of sessions revoked.
 */
export async function revokeAllUserSessions(userId: string): Promise<number> {
  if (!userId) {
    return 0;
  }

  const result = await prisma.userSession.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  return result.count;
}
