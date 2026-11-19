import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateSecureToken,
  hashToken,
  maskEmail,
} from "@/lib/auth/tokens";
import { getEmailProvider } from "@/lib/auth/email-provider";
import {
  getRateLimiter,
  RateLimiterConfigurationError,
} from "@/lib/auth/rate-limiter";
import { extractClientIp } from "@/lib/auth/session";
import { ForgotPasswordInputSchema } from "@/lib/auth/validation";
import { requireCsrf } from "@/lib/auth/csrf";

/**
 * Standard anti-enumeration response message returned for all forgot-password requests,
 * regardless of whether the account exists, is inactive, or has pending requests.
 */
const GENERIC_FORGOT_PASSWORD_RESPONSE = {
  success: true,
  message: "If an account with that email exists, password reset instructions have been sent.",
};

/**
 * POST /api/auth/forgot-password
 *
 * Secure password reset request endpoint.
 *
 * SECURITY INVARIANTS:
 * 1. Anti-Enumeration: Unconditionally returns HTTP 200 with identical generic response.
 *    Never reveals account existence, user active status, or email delivery status.
 * 2. Rate Limiting: Dual-bucket throttling on IP and account email.
 *    Fails closed (HTTP 503) in production if distributed rate limiter is unconfigured.
 * 3. Cryptographic Token: Generates 256-bit cryptographically secure token.
 *    ONLY the deterministic SHA-256 digest is persisted to PostgreSQL.
 * 4. Token Expiration & Hygiene: Expires in 15 minutes. Atomically invalidates any
 *    pre-existing unconsumed tokens for this user before creating a new one.
 * 5. Zero Leakage: Raw tokens, plaintext passwords, and full reset URLs are NEVER logged to stdout
 *    or returned in the HTTP response.
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

    // 1. Validate input schema
    const validationResult = ForgotPasswordInputSchema.safeParse(body);
    if (!validationResult.success) {
      const issue = validationResult.error.issues[0];
      return NextResponse.json(
        {
          success: false,
          error: "VALIDATION_ERROR",
          message: issue?.message || "Invalid email address format.",
        },
        { status: 400 }
      );
    }

    const { email } = validationResult.data;
    const clientIp = extractClientIp(request);

    // 2. Dual-Bucket Rate Limiting (IP + Account)
    try {
      const rateLimiter = getRateLimiter();

      // IP limit: 5 requests per 15 minutes
      const ipLimitResult = await rateLimiter.consume(
        `auth:forgot-password:ip:${clientIp}`,
        5,
        15 * 60 * 1000
      );
      if (!ipLimitResult.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: "RATE_LIMIT_EXCEEDED",
            message: "Too many password reset requests. Please try again later.",
          },
          { status: 429 }
        );
      }

      // Account email limit: 3 requests per 15 minutes
      const emailLimitResult = await rateLimiter.consume(
        `auth:forgot-password:email:${email}`,
        3,
        15 * 60 * 1000
      );
      if (!emailLimitResult.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: "RATE_LIMIT_EXCEEDED",
            message: "Too many password reset requests for this account. Please try again later.",
          },
          { status: 429 }
        );
      }
    } catch (rateLimitErr) {
      if (rateLimitErr instanceof RateLimiterConfigurationError) {
        console.error("CRITICAL RATE LIMITER ERROR:", rateLimitErr.message);
        return NextResponse.json(
          {
            success: false,
            error: "SERVICE_UNAVAILABLE",
            message: "Authentication service security infrastructure is unconfigured.",
          },
          { status: 503 }
        );
      }
      throw rateLimitErr;
    }

    // 3. User Lookup
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
      },
    });

    // 4. Token Generation & Delivery (Only for existing, active users)
    if (user && user.isActive) {
      const rawToken = generateSecureToken(32); // 256 bits of entropy
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes TTL

      // Atomically invalidate previous unused reset tokens and create the new one
      await prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.updateMany({
          where: {
            userId: user.id,
            usedAt: null,
          },
          data: {
            usedAt: new Date(),
          },
        });

        await tx.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt,
          },
        });
      });

      // Dispatch password reset email via provider abstraction
      const emailProvider = getEmailProvider();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const resetUrl = `${appUrl}/auth/reset-password?token=${rawToken}`;

      const deliveryResult = await emailProvider.sendPasswordReset({
        to: user.email,
        recipientName: `${user.firstName} ${user.lastName}`,
        actionUrl: resetUrl,
        expiresInMinutes: 15,
        tokenHashPrefix: tokenHash.substring(0, 8),
      });

      if (!deliveryResult.success) {
        console.warn(
          `[EMAIL DISPATCH] Password reset delivery failed for ${maskEmail(user.email)}: ${deliveryResult.error}`
        );
      }
    }

    // 5. Anti-Enumeration generic response
    return NextResponse.json(GENERIC_FORGOT_PASSWORD_RESPONSE, { status: 200 });
  } catch (error) {
    console.error("Error processing password reset request:", error);
    return NextResponse.json(
      {
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "An internal error occurred while processing the request.",
      },
      { status: 500 }
    );
  }
}
