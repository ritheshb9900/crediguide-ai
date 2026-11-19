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
import { ResendVerificationInputSchema } from "@/lib/auth/validation";

/**
 * Standard anti-enumeration response message returned for all resend-verification requests.
 */
const GENERIC_RESEND_VERIFICATION_RESPONSE = {
  success: true,
  message: "If an account with that email exists and requires verification, a verification email has been sent.",
};

/**
 * POST /api/auth/resend-verification
 *
 * Resend email verification endpoint.
 *
 * SECURITY INVARIANTS:
 * 1. Anti-Enumeration: Unconditionally returns HTTP 200 with identical generic response
 *    regardless of whether the account exists, is already verified, or is inactive.
 * 2. Rate Limiting: Dual-bucket throttling on IP and account email.
 *    Fails closed in production if distributed rate limiter is unconfigured.
 * 3. Token Hygiene & Invalidation:
 *    Atomically invalidates any prior unused verification tokens for this user
 *    before issuing a new 24-hour verification token. Prevents token accumulation.
 * 4. Verified Account Protection:
 *    If an account is already verified, no new token is created and no email is sent.
 * 5. Zero Secret Exposure: Raw tokens are never logged or exposed in HTTP responses.
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
    const validationResult = ResendVerificationInputSchema.safeParse(body);
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
        `auth:resend-verification:ip:${clientIp}`,
        5,
        15 * 60 * 1000
      );
      if (!ipLimitResult.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: "RATE_LIMIT_EXCEEDED",
            message: "Too many verification requests. Please try again later.",
          },
          { status: 429 }
        );
      }

      // Account email limit: 3 requests per 15 minutes
      const emailLimitResult = await rateLimiter.consume(
        `auth:resend-verification:email:${email}`,
        3,
        15 * 60 * 1000
      );
      if (!emailLimitResult.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: "RATE_LIMIT_EXCEEDED",
            message: "Too many verification requests for this account. Please try again later.",
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
        isEmailVerified: true,
      },
    });

    // 4. Token Generation & Invalidation (Only for existing, active, unverified users)
    if (user && user.isActive && !user.isEmailVerified) {
      const rawToken = generateSecureToken(32);
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours TTL

      // Atomically invalidate previous unused verification tokens and create the new one
      await prisma.$transaction(async (tx) => {
        await tx.emailVerificationToken.updateMany({
          where: {
            userId: user.id,
            usedAt: null,
          },
          data: {
            usedAt: new Date(),
          },
        });

        await tx.emailVerificationToken.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt,
          },
        });
      });

      // Dispatch verification email via provider abstraction
      const emailProvider = getEmailProvider();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const verificationUrl = `${appUrl}/auth/verify-email?token=${rawToken}`;

      const deliveryResult = await emailProvider.sendEmailVerification({
        to: user.email,
        recipientName: `${user.firstName} ${user.lastName}`,
        actionUrl: verificationUrl,
        expiresInMinutes: 24 * 60,
        tokenHashPrefix: tokenHash.substring(0, 8),
      });

      if (!deliveryResult.success) {
        console.warn(
          `[EMAIL DISPATCH] Resend verification delivery failed for ${maskEmail(user.email)}: ${deliveryResult.error}`
        );
      }
    }

    // 5. Anti-Enumeration generic response
    return NextResponse.json(GENERIC_RESEND_VERIFICATION_RESPONSE, { status: 200 });
  } catch (error) {
    console.error("Error processing resend verification request:", error);
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
