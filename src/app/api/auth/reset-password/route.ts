import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth/tokens";
import { hashPassword } from "@/lib/auth/password";
import { revokeAllUserSessions } from "@/lib/auth/session";
import { ResetPasswordInputSchema } from "@/lib/auth/validation";
import { requireCsrf } from "@/lib/auth/csrf";

/**
 * POST /api/auth/reset-password
 *
 * Password reset confirmation endpoint.
 *
 * SECURITY INVARIANTS:
 * 1. CPU-Intensive Hashing Outside Transaction:
 *    Argon2id password hashing is computed BEFORE opening the database transaction,
 *    preventing connection starvation and prolonged row locks.
 * 2. Atomic Single-Use Token Consumption:
 *    Conditional atomic updateMany verifies tokenHash matches, usedAt is null,
 *    and expiresAt > NOW(). Prevents double-spend and concurrent replay attacks.
 * 3. Lockout Recovery:
 *    Resets failedLoginAttempts to 0 and clears lockedUntil, restoring access for legitimate users.
 * 4. Transactional Session Invalidation:
 *    Revokes all active database sessions for the user within the same transaction.
 * 5. All-or-Nothing Rollback:
 *    If any step fails, the token is not consumed and the password is not changed.
 * 6. Zero Secret Leakage:
 *    Zero passwords, hashes, or tokens exposed in responses.
 */
export async function POST(request: Request) {
  const csrfError = requireCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_JSON",
          message: "Request payload must be valid JSON.",
        },
        { status: 400 }
      );
    }

    // 1. Validate payload schema
    const validationResult = ResetPasswordInputSchema.safeParse(body);
    if (!validationResult.success) {
      const issue = validationResult.error.issues[0];
      return NextResponse.json(
        {
          success: false,
          error: "VALIDATION_ERROR",
          message: issue?.message || "Invalid password reset data.",
        },
        { status: 400 }
      );
    }

    const { token, password } = validationResult.data;

    // 2. Compute Argon2id hash BEFORE opening database transaction
    const passwordHash = await hashPassword(password);
    const tokenHash = hashToken(token);

    // 3. Atomic Database Transaction
    try {
      await prisma.$transaction(async (tx) => {
        // A. Atomically consume token only if valid, unused, and not expired
        const updateResult = await tx.passwordResetToken.updateMany({
          where: {
            tokenHash,
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: {
            usedAt: new Date(),
          },
        });

        if (updateResult.count === 0) {
          throw new Error("INVALID_OR_EXPIRED_TOKEN");
        }

        // B. Identify associated user
        const tokenRecord = await tx.passwordResetToken.findUniqueOrThrow({
          where: { tokenHash },
          select: { userId: true },
        });

        // C. Update user's password and reset lockout counters
        await tx.user.update({
          where: { id: tokenRecord.userId },
          data: {
            passwordHash,
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        });

        // D. Transactional session revocation: revoke all active sessions for this user
        await revokeAllUserSessions(tokenRecord.userId, tx);
      });
    } catch (txError: unknown) {
      const message = txError instanceof Error ? txError.message : String(txError);
      if (message === "INVALID_OR_EXPIRED_TOKEN") {
        return NextResponse.json(
          {
            success: false,
            error: "INVALID_OR_EXPIRED_TOKEN",
            message: "Password reset token is invalid, expired, or has already been used.",
          },
          { status: 400 }
        );
      }
      throw txError;
    }

    return NextResponse.json(
      {
        success: true,
        message: "Password has been reset successfully. Please log in with your new password.",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error confirming password reset:", error);
    return NextResponse.json(
      {
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "An internal error occurred while resetting the password.",
      },
      { status: 500 }
    );
  }
}
