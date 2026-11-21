import { NextResponse } from "next/server";
import crypto from "crypto";
import { DevEmailSink } from "@/lib/auth/email-provider";

const ALLOWED_TEST_DOMAINS = ["@cg-test-domain.org", "@e2e.crediguide.local"];

export function isAllowedTestEmail(email: string): boolean {
  const normalized = email.toLowerCase().trim();
  return ALLOWED_TEST_DOMAINS.some((domain) => normalized.endsWith(domain));
}

/**
 * Timing-safe string comparison to protect against side-channel timing analysis.
 * Safely handles unequal length buffers without throwing an unhandled exception.
 */
export function isTimingSafeEqual(provided: string, expected: string): boolean {
  if (typeof provided !== "string" || typeof expected !== "string") {
    return false;
  }

  const bufProvided = Buffer.from(provided, "utf8");
  const bufExpected = Buffer.from(expected, "utf8");

  if (bufProvided.length !== bufExpected.length) {
    // Perform dummy timingSafeEqual against self to prevent timing leakage
    crypto.timingSafeEqual(bufProvided, bufProvided);
    return false;
  }

  return crypto.timingSafeEqual(bufProvided, bufExpected);
}

function verifyBridgeAccess(request: Request): { authorized: boolean; response?: NextResponse } {
  // 1. Guard against production execution
  if (process.env.NODE_ENV === "production") {
    return {
      authorized: false,
      response: NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }),
    };
  }

  // 2. Guard against execution unless explicitly enabled
  if (process.env.ENABLE_E2E_EMAIL_BRIDGE !== "true") {
    return {
      authorized: false,
      response: NextResponse.json({ error: "E2E_EMAIL_BRIDGE_DISABLED" }, { status: 404 }),
    };
  }

  // 3. Verify bridge secret is configured on the server
  const expectedSecret = process.env.E2E_BRIDGE_SECRET;
  if (!expectedSecret || expectedSecret.trim() === "") {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          error: "E2E_BRIDGE_SECRET_UNCONFIGURED",
          message: "Bridge secret is not configured on the server.",
        },
        { status: 500 }
      ),
    };
  }

  // 4. Verify bridge secret header using timing-safe comparison
  const providedSecret = request.headers.get("x-e2e-bridge-secret");
  if (!providedSecret || !isTimingSafeEqual(providedSecret, expectedSecret)) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          error: "UNAUTHORIZED_BRIDGE_ACCESS",
          message: "Invalid or missing bridge authorization header.",
        },
        { status: 401 }
      ),
    };
  }

  return { authorized: true };
}

/**
 * GET /api/dev/e2e/email-link?email=...
 *
 * Isolated development-only bridge enabling E2E test runners to retrieve
 * verification or password reset links generated in-memory by DevEmailSink.
 */
export async function GET(request: Request) {
  const auth = verifyBridgeAccess(request);
  if (!auth.authorized) {
    return auth.response!;
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");

  if (!email) {
    return NextResponse.json(
      { success: false, error: "MISSING_EMAIL", message: "Query parameter 'email' is required." },
      { status: 400 }
    );
  }

  if (!isAllowedTestEmail(email)) {
    return NextResponse.json(
      {
        success: false,
        error: "FORBIDDEN_DOMAIN",
        message: "Email domain not permitted. Only test domains are accessible via bridge.",
      },
      { status: 403 }
    );
  }

  const record = DevEmailSink.findLatestFor(email);
  if (!record) {
    return NextResponse.json(
      { success: false, error: "EMAIL_NOT_FOUND", message: "No email records found for recipient." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    actionUrl: record.actionUrl,
    type: record.type,
    timestamp: record.timestamp,
  });
}

/**
 * DELETE /api/dev/e2e/email-link?email=...
 * Clears in-memory sink records specifically targeted to the validated test email.
 * Refuses blanket deletion to prevent clearing unrelated development email records.
 */
export async function DELETE(request: Request) {
  const auth = verifyBridgeAccess(request);
  if (!auth.authorized) {
    return auth.response!;
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");

  if (!email) {
    return NextResponse.json(
      {
        success: false,
        error: "MISSING_EMAIL",
        message: "Query parameter 'email' is required for targeted sink cleanup.",
      },
      { status: 400 }
    );
  }

  if (!isAllowedTestEmail(email)) {
    return NextResponse.json(
      {
        success: false,
        error: "FORBIDDEN_DOMAIN",
        message: "Email domain not permitted. Only test domains can be cleared via bridge.",
      },
      { status: 403 }
    );
  }

  const removedCount = DevEmailSink.clearFor(email);
  return NextResponse.json({
    success: true,
    message: `DevEmailSink records for '${email}' cleared successfully.`,
    removedCount,
  });
}
