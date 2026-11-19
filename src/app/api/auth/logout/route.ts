import { NextResponse } from "next/server";
import {
  extractSessionTokenFromRequest,
  revokeDatabaseSession,
  getExpiredSessionCookieConfig,
} from "@/lib/auth/session";
import { requireCsrf } from "@/lib/auth/csrf";

/**
 * POST /api/auth/logout
 *
 * Terminate the caller's active database session and clear the HttpOnly session cookie.
 *
 * Security & Lifecycle Guarantees:
 * 1. Reads the `crediguide_session` cookie via the centralized extraction helper.
 * 2. Hashes the raw token with SHA-256 to revoke strictly this single session record.
 * 3. Never revokes other sessions belonging to this user or other users.
 * 4. Clears the browser session cookie with Max-Age=0, Path=/, and SameSite=Lax.
 * 5. Completely idempotent: repeated logouts or logouts without a cookie succeed safely.
 * 6. Never reveals raw tokens, token hashes, or user account secrets.
 * 7. In case of database error, returns 500 without claiming successful revocation.
 */
export async function POST(request: Request) {
  const csrfError = requireCsrf(request, { allowEmptyBody: true });
  if (csrfError) {
    return csrfError;
  }

  try {
    const rawToken = extractSessionTokenFromRequest(request);
    const expiredCookie = getExpiredSessionCookieConfig();

    let wasRevoked = false;

    if (rawToken) {
      // Revoke the database session by updating revokedAt
      wasRevoked = await revokeDatabaseSession(rawToken);
    }

    const response = NextResponse.json(
      {
        success: true,
        message: "Logged out successfully.",
        revoked: wasRevoked,
      },
      { status: 200 }
    );

    // Clear the authentication cookie
    response.cookies.set(expiredCookie.name, expiredCookie.value, {
      httpOnly: expiredCookie.httpOnly,
      secure: expiredCookie.secure,
      sameSite: expiredCookie.sameSite,
      path: expiredCookie.path,
      maxAge: expiredCookie.maxAge,
      expires: expiredCookie.expires,
    });

    return response;
  } catch (error) {
    console.error("Error processing logout:", error);
    return NextResponse.json(
      {
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "An internal error occurred during logout. Please try again.",
      },
      { status: 500 }
    );
  }
}
