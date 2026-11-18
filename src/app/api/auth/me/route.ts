import { NextResponse } from "next/server";
import {
  extractSessionTokenFromRequest,
  validateDatabaseSession,
} from "@/lib/auth/session";

/**
 * GET /api/auth/me
 *
 * Retrieve safe authenticated user profile and session metadata for the caller.
 *
 * Security & Lifecycle Guarantees:
 * 1. Reads the `crediguide_session` cookie via the centralized extraction helper.
 * 2. Hashes the raw token with SHA-256 to look up the database session record.
 * 3. Enforces database checks: record must exist, revokedAt must be null,
 *    expiresAt must be in the future, and user.isActive must be true.
 * 4. Returns HTTP 401 for unauthenticated, invalid, expired, or revoked sessions.
 * 5. Constructs an explicit safe profile response containing only public/functional fields:
 *    - user.id, email, firstName, lastName, role, isEmailVerified
 *    - applicantId (if linked)
 *    - officerProfile (if user is a bank officer)
 *    - session.id, session.expiresAt
 * 6. Strictly excludes passwordHash, tokenHash, raw tokens, reset tokens,
 *    lockout counters, and internal database details.
 */
export async function GET(request: Request) {
  try {
    const rawToken = extractSessionTokenFromRequest(request);

    if (!rawToken) {
      return NextResponse.json(
        {
          success: false,
          error: "UNAUTHENTICATED",
          message: "Authentication required. No session cookie provided.",
        },
        { status: 401 }
      );
    }

    const validationResult = await validateDatabaseSession(rawToken);

    if (!validationResult.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: "UNAUTHENTICATED",
          message: "Session is invalid, expired, or revoked. Please log in again.",
        },
        { status: 401 }
      );
    }

    const { user, session, applicantId, officerProfile } = validationResult.context;

    // Construct explicit sanitized response (Zero leakage of secrets or internal counters)
    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
          phone: user.phone,
          applicantId,
          officerProfile: officerProfile
            ? {
                id: officerProfile.id,
                employeeCode: officerProfile.employeeCode,
                department: officerProfile.department,
                branchCode: officerProfile.branchCode,
                designation: officerProfile.designation,
                approvalLimitAmount: officerProfile.approvalLimitAmount,
              }
            : null,
        },
        session: {
          id: session.id,
          expiresAt: session.expiresAt.toISOString(),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error processing current user request:", error);
    return NextResponse.json(
      {
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "An internal error occurred while retrieving user details.",
      },
      { status: 500 }
    );
  }
}
