import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LoginInputSchema } from "@/lib/auth/validation";
import {
  verifyPassword,
  calculateProgressiveDelay,
  sleep,
} from "@/lib/auth/password";
import {
  getRateLimiter,
  RateLimiterConfigurationError,
} from "@/lib/auth/rate-limiter";
import { createDatabaseSession } from "@/lib/auth/session";

// Constant dummy hash to simulate Argon2id verification for nonexistent users
// Eliminates timing discrepancy between existing and nonexistent accounts
const DUMMY_ARGON2_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXlTYWx0Rm9yVGltaW5nRGVmZW5zZQ$dummydigesttopreventtiminganalysisattacks";

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
          message: "Invalid JSON in request payload.",
        },
        { status: 400 }
      );
    }

    // 1. Strict Server-Side Input Validation
    const validationResult = LoginInputSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "VALIDATION_FAILED",
          message: "Invalid login credentials format.",
          details: validationResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { email, password } = validationResult.data;

    // 2. Client IP Extraction
    const forwardedHeader = request.headers.get("x-forwarded-for");
    const realIpHeader = request.headers.get("x-real-ip");
    const clientIp =
      (forwardedHeader ? forwardedHeader.split(",")[0].trim() : null) ||
      realIpHeader ||
      "127.0.0.1";

    // 3. IP-Based Rate Limiting Check (Fail-closed in production)
    try {
      const rateLimiter = getRateLimiter();
      const rateLimitKey = `auth:login:ip:${clientIp}`;
      const rateLimitResult = await rateLimiter.consume(
        rateLimitKey,
        10,
        15 * 60 * 1000 // 10 attempts per 15 minutes
      );

      if (!rateLimitResult.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: "RATE_LIMIT_EXCEEDED",
            message:
              "Too many login attempts from this network. Please try again later.",
            retryAfterSeconds: rateLimitResult.retryAfterSeconds,
          },
          { status: 429 }
        );
      }
    } catch (rateLimiterErr) {
      if (rateLimiterErr instanceof RateLimiterConfigurationError) {
        console.error(
          "SECURITY FAIL-CLOSED: Rate limiter configuration error in login:",
          rateLimiterErr.message
        );
        return NextResponse.json(
          {
            success: false,
            error: "SERVICE_UNAVAILABLE",
            message:
              "Authentication service security infrastructure is unconfigured.",
          },
          { status: 503 }
        );
      }
      throw rateLimiterErr;
    }

    // 4. User Lookup
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // 5. Anti-Enumeration for Nonexistent Users:
    // Run dummy Argon2id verification to avoid timing discrepancy revealing account existence
    if (!user) {
      await verifyPassword(DUMMY_ARGON2_HASH, password);
      await sleep(calculateProgressiveDelay(1));

      return NextResponse.json(
        {
          success: false,
          error: "INVALID_CREDENTIALS",
          message: "Invalid email or password.",
        },
        { status: 401 }
      );
    }

    // 6. Check Inactive Status or Active Lockout
    const now = new Date();
    const isLocked = user.lockedUntil !== null && user.lockedUntil > now;
    const isInactive = !user.isActive;

    if (isLocked || isInactive) {
      // Simulate verification workload and progressive delay
      await verifyPassword(DUMMY_ARGON2_HASH, password);
      await sleep(calculateProgressiveDelay(user.failedLoginAttempts));

      // Generic response - NEVER reveal that the account is locked or inactive
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_CREDENTIALS",
          message: "Invalid email or password.",
        },
        { status: 401 }
      );
    }

    // 7. Password Verification
    const isPasswordValid = await verifyPassword(user.passwordHash, password);

    if (!isPasswordValid) {
      // 1. Concurrency-Safe Atomic Failed-Login Increment & Lockout Evaluation in PostgreSQL
      // Uses atomic UPDATE ... RETURNING to eliminate read-modify-write race conditions.
      // Parameterized through Prisma ($queryRaw tagged template) to guarantee SQL injection safety.
      // Lockout is set to 15 minutes ONLY when the threshold is first crossed, and is NOT
      // repeatedly extended by subsequent concurrent requests.
      interface FailedLoginRow {
        failedLoginAttempts: number;
        lockedUntil: Date | null;
      }

      const updatedRows = await prisma.$queryRaw<FailedLoginRow[]>`
        UPDATE "users"
        SET "failedLoginAttempts" = "failedLoginAttempts" + 1,
            "lockedUntil" = CASE
              WHEN "failedLoginAttempts" + 1 >= 5 AND ("lockedUntil" IS NULL OR "lockedUntil" <= (NOW() AT TIME ZONE 'UTC'))
              THEN (NOW() AT TIME ZONE 'UTC' + INTERVAL '15 minutes')
              ELSE "lockedUntil"
            END,
            "updatedAt" = (NOW() AT TIME ZONE 'UTC')
        WHERE "id" = ${user.id}
        RETURNING "failedLoginAttempts", "lockedUntil"
      `;

      const updatedUser = updatedRows[0];
      const currentAttempts =
        updatedUser?.failedLoginAttempts ?? (user.failedLoginAttempts + 1);

      await sleep(calculateProgressiveDelay(currentAttempts));

      return NextResponse.json(
        {
          success: false,
          error: "INVALID_CREDENTIALS",
          message: "Invalid email or password.",
        },
        { status: 401 }
      );
    }

    // 8. Authentication Success - Concurrency-Safe Re-check & Reset under Row Lock
    // Re-check current account state under PostgreSQL row lock to ensure concurrent failed attempts
    // did not establish a lockout while password verification was executing.
    const accountState = await prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<
        Array<{
          id: string;
          isActive: boolean;
          lockedUntil: Date | null;
          failedLoginAttempts: number;
        }>
      >`
        SELECT "id", "isActive", "lockedUntil", "failedLoginAttempts"
        FROM "users"
        WHERE "id" = ${user.id}
        FOR UPDATE
      `;

      const currentUser = lockedRows[0];
      if (!currentUser) {
        return { allowed: false, failedAttempts: 1 };
      }

      const nowTime = Date.now();
      const lockedTime = currentUser.lockedUntil
        ? currentUser.lockedUntil instanceof Date
          ? currentUser.lockedUntil.getTime()
          : new Date(currentUser.lockedUntil).getTime()
        : null;

      const isCurrentlyLocked = lockedTime !== null && lockedTime > nowTime;
      const isCurrentlyInactive = !currentUser.isActive;

      if (isCurrentlyLocked || isCurrentlyInactive) {
        return {
          allowed: false,
          failedAttempts: currentUser.failedLoginAttempts,
        };
      }

      // Reset lockout counters atomically under the row lock
      await tx.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
        },
      });

      return { allowed: true };
    });

    if (!accountState.allowed) {
      await sleep(calculateProgressiveDelay(accountState.failedAttempts ?? 5));
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_CREDENTIALS",
          message: "Invalid email or password.",
        },
        { status: 401 }
      );
    }

    // 9. Create Database-Backed Session
    const userAgent = request.headers.get("user-agent") || undefined;
    const { session, cookieConfig } = await createDatabaseSession(user.id, {
      ipAddress: clientIp,
      userAgent,
    });

    // 10. Sanitized JSON Response with HttpOnly Cookie
    const response = NextResponse.json(
      {
        success: true,
        message: "Authentication successful.",
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
        },
        sessionId: session.id,
      },
      { status: 200 }
    );

    // Attach HttpOnly cookie
    response.cookies.set(cookieConfig.name, cookieConfig.value, {
      httpOnly: cookieConfig.httpOnly,
      secure: cookieConfig.secure,
      sameSite: cookieConfig.sameSite,
      path: cookieConfig.path,
      maxAge: cookieConfig.maxAge,
      expires: cookieConfig.expires,
    });

    return response;
  } catch (error) {
    console.error("Error processing login:", error);
    return NextResponse.json(
      {
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "An internal error occurred during authentication. Please try again.",
      },
      { status: 500 }
    );
  }
}
