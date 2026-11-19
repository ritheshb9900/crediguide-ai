import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth/tokens";
import { VerifyEmailInputSchema } from "@/lib/auth/validation";

/**
 * POST /api/auth/verify-email
 *
 * Email verification token consumption endpoint.
 *
 * SECURITY INVARIANTS:
 * 1. Atomic Single-Use Consumption:
 *    Conditional updateMany ensures tokenHash matches, usedAt is null, and expiresAt > NOW().
 *    Concurrent verification requests cannot double-consume the token.
 * 2. Cross-User Isolation:
 *    Only the exact user associated with the token (tokenRecord.userId) is marked as verified.
 * 3. All-or-Nothing Rollback:
 *    If user verification update fails, the token is not marked consumed.
 * 4. Zero Token Exposure:
 *    Never returns tokens or hashes in the response.
 */
export async function POST(request: Request) {
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
    const validationResult = VerifyEmailInputSchema.safeParse(body);
    if (!validationResult.success) {
      const issue = validationResult.error.issues[0];
      return NextResponse.json(
        {
          success: false,
          error: "VALIDATION_ERROR",
          message: issue?.message || "Invalid verification token.",
        },
        { status: 400 }
      );
    }

    const { token } = validationResult.data;
    const tokenHash = hashToken(token);

    // 2. Atomic Database Transaction
    try {
      await prisma.$transaction(async (tx) => {
        // A. Atomically consume token only if valid, unused, and unexpired
        const updateResult = await tx.emailVerificationToken.updateMany({
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
        const tokenRecord = await tx.emailVerificationToken.findUniqueOrThrow({
          where: { tokenHash },
          select: { userId: true },
        });

        // C. Update user record to mark email as verified
        await tx.user.update({
          where: { id: tokenRecord.userId },
          data: {
            isEmailVerified: true,
          },
        });
      });
    } catch (txError: unknown) {
      const message = txError instanceof Error ? txError.message : String(txError);
      if (message === "INVALID_OR_EXPIRED_TOKEN") {
        return NextResponse.json(
          {
            success: false,
            error: "INVALID_OR_EXPIRED_TOKEN",
            message: "Email verification token is invalid, expired, or has already been used.",
          },
          { status: 400 }
        );
      }
      throw txError;
    }

    return NextResponse.json(
      {
        success: true,
        message: "Email has been successfully verified. You can now access all applicant features.",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error verifying email:", error);
    return NextResponse.json(
      {
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "An internal error occurred while verifying the email.",
      },
      { status: 500 }
    );
  }
}
