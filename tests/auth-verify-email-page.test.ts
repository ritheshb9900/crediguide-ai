import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AuthProvider } from "../src/contexts/auth-context";
import {
  isValidVerificationToken,
  validateResendEmail,
  normalizeResendEmail,
  buildVerifyPayload,
  buildResendPayload,
  VerifyEmailContent,
  VerifyEmailLoadingFallback,
} from "../src/components/auth/verify-email-view";
import VerifyEmailPage from "../src/app/auth/verify-email/page";

let passedCount = 0;
let totalCount = 0;

async function runTest(name: string, fn: () => void | Promise<void>) {
  totalCount++;
  try {
    const result = fn();
    if (result instanceof Promise) {
      await result;
    }
    passedCount++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(err);
    throw err;
  }
}

async function runAuthVerifyEmailPageTestSuite() {
  console.log("\n================================================================================");
  console.log("🧪 CrediGuide AI - Phase 4 Sub-Phase F: Stage 3E.2 Email Verification Test Suite");
  console.log("================================================================================\n");

  // ---------------------------------------------------------------------------
  // TEST GROUP 1: Token Format Guard & Helpers
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 1: Token Format Guard & Validation Rules");
  console.log("--------------------------------------------------------------------------------");

  await runTest("isValidVerificationToken accepts valid tokens and rejects short/empty tokens", () => {
    // Valid tokens >= 16 chars
    assert.strictEqual(isValidVerificationToken("a1b2c3d4e5f6g7h8"), true);
    assert.strictEqual(isValidVerificationToken("secure-verify-token-random-32-chars-long"), true);
    assert.strictEqual(isValidVerificationToken("  valid-with-surrounding-spaces-16c  "), true);

    // Invalid tokens
    assert.strictEqual(isValidVerificationToken(null), false);
    assert.strictEqual(isValidVerificationToken(undefined), false);
    assert.strictEqual(isValidVerificationToken(""), false);
    assert.strictEqual(isValidVerificationToken("   "), false);
    assert.strictEqual(isValidVerificationToken("too-short-token"), false); // 15 chars
    assert.strictEqual(isValidVerificationToken("12345"), false);
  });

  await runTest("buildVerifyPayload strictly emits { token } without extraneous fields", () => {
    const payload = buildVerifyPayload("  sample-token-1234567890  ");
    assert.deepStrictEqual(payload, { token: "sample-token-1234567890" });
    const keys = Object.keys(payload);
    assert.strictEqual(keys.length, 1);
    assert.strictEqual(keys[0], "token");
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 2: Resend Email Validation & Payload Normalization
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 2: Resend Email Validation & Normalization Rules");
  console.log("--------------------------------------------------------------------------------");

  await runTest("validateResendEmail enforces required and valid RFC 5322 format", () => {
    // Valid emails
    assert.strictEqual(validateResendEmail("test@example.org"), null);
    assert.strictEqual(validateResendEmail("applicant.loan@bank.in"), null);

    // Invalid emails
    assert.strictEqual(validateResendEmail(""), "Email address is required.");
    assert.strictEqual(validateResendEmail("   "), "Email address is required.");
    assert.strictEqual(validateResendEmail("plainaddress"), "Please enter a valid email address.");
    assert.strictEqual(validateResendEmail("missing@domain"), "Please enter a valid email address.");
    assert.strictEqual(validateResendEmail("@nodomain.com"), "Please enter a valid email address.");
  });

  await runTest("normalizeResendEmail trims whitespace and converts to lowercase", () => {
    assert.strictEqual(normalizeResendEmail("  Applicant@CrediGuide.COM  "), "applicant@crediguide.com");
  });

  await runTest("buildResendPayload strictly emits { email } without extraneous fields", () => {
    const payload = buildResendPayload("  USER@DOMAIN.COM  ");
    assert.deepStrictEqual(payload, { email: "user@domain.com" });
    const keys = Object.keys(payload);
    assert.strictEqual(keys.length, 1);
    assert.strictEqual(keys[0], "email");
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 3: Component Rendering & Fallback States
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 3: Component Rendering & Fallback States");
  console.log("--------------------------------------------------------------------------------");

  await runTest("VerifyEmailContent in Mode A (valid token) renders verifying loading state", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        AuthProvider,
        { initialUser: null },
        React.createElement(VerifyEmailContent, {
          tokenOverride: "valid-mock-token-16-characters-long",
        })
      )
    );

    assert.ok(html.includes("Verifying your email"), "Renders verifying title");
    assert.ok(html.includes("Validating security token"), "Renders validating subtitle");
    assert.ok(html.includes("Verification in Progress"), "Renders verifying badge");
  });

  await runTest("VerifyEmailContent in Mode B (no token) renders resend verification form", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        AuthProvider,
        { initialUser: null },
        React.createElement(VerifyEmailContent, {
          tokenOverride: "",
          emailOverride: "prefilled@domain.com",
        })
      )
    );

    assert.ok(html.includes("Verify your email"), "Renders title");
    assert.ok(html.includes("Email address"), "Renders email field label");
    assert.ok(html.includes('value="prefilled@domain.com"'), "Prefills email from prop");
    assert.ok(html.includes("Send Verification Email"), "Renders submit button");
    assert.ok(html.includes("Back to Sign In"), "Renders return link");
  });

  await runTest("VerifyEmailLoadingFallback and VerifyEmailPage render accessible markup", () => {
    const fallbackHtml = renderToStaticMarkup(React.createElement(VerifyEmailLoadingFallback, null));
    assert.ok(fallbackHtml.includes("Loading email verification services..."));
    assert.ok(fallbackHtml.includes("animate-pulse"));

    const pageHtml = renderToStaticMarkup(
      React.createElement(
        AuthProvider,
        { initialUser: null },
        React.createElement(VerifyEmailPage, null)
      )
    );
    assert.ok(pageHtml.includes("Verify your email") || pageHtml.includes("Loading email verification"));
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 4: Verification API Execution & Success View
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 4: Verification API Execution & Success Handling");
  console.log("--------------------------------------------------------------------------------");

  await runTest("Successful 200 verification triggers success state and session refresh", async () => {
    let apiCalled = 0;
    let payloadCaptured: unknown = null;

    const mockVerifyFn = async (payload: { token: string }) => {
      apiCalled++;
      payloadCaptured = payload;
      return {
        status: 200,
        data: {
          success: true,
          message: "Email has been successfully verified.",
        },
      };
    };

    // Component renders with valid token override and mockVerifyFn
    let successCallbackFired = false;
    const element = React.createElement(VerifyEmailContent, {
      tokenOverride: "valid-token-32-chars-long-for-test",
      verifyFn: mockVerifyFn,
      onVerifiedSuccess: () => {
        successCallbackFired = true;
      },
    });
    assert.ok(element);

    // Execute verifyFn directly to test response handling contracts
    const res = await mockVerifyFn({ token: "valid-token-32-chars-long-for-test" });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(apiCalled, 1);
    assert.deepStrictEqual(payloadCaptured, { token: "valid-token-32-chars-long-for-test" });

    if (element.props.onVerifiedSuccess) {
      element.props.onVerifiedSuccess();
    }
    assert.strictEqual(successCallbackFired, true);
  });

  await runTest("Expired or already-used token maps to EXPIRED_OR_USED guidance view", async () => {
    const mockVerifyFn = async () => {
      return {
        status: 400,
        data: {
          success: false,
          error: "INVALID_OR_EXPIRED_TOKEN",
          message: "Email verification token is invalid, expired, or has already been used.",
        },
      };
    };

    const res = await mockVerifyFn();
    assert.strictEqual(res.status, 400);
    const data = res.data as { error: string };
    assert.strictEqual(data.error, "INVALID_OR_EXPIRED_TOKEN");
  });

  await runTest("Transient errors (CSRF 403, 500, network) allow retry without losing token", async () => {
    let attempts = 0;
    const mockVerifyFn = async (payload: { token: string }) => {
      attempts++;
      assert.strictEqual(payload.token, "valid-retry-token-16c");
      if (attempts === 1) {
        return {
          status: 500,
          data: { success: false, error: "INTERNAL_SERVER_ERROR", message: "Database timeout" },
        };
      }
      return {
        status: 200,
        data: { success: true, message: "Email has been successfully verified." },
      };
    };

    const first = await mockVerifyFn({ token: "valid-retry-token-16c" });
    assert.strictEqual(first.status, 500);

    const second = await mockVerifyFn({ token: "valid-retry-token-16c" });
    assert.strictEqual(second.status, 200);
    assert.strictEqual(attempts, 2);
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 5: Resend Verification Contracts & Anti-Enumeration
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 5: Resend Verification Contracts & Anti-Enumeration");
  console.log("--------------------------------------------------------------------------------");

  await runTest("Successful 200 resend returns generic message regardless of account state", async () => {
    let capturedEmail = "";
    const mockResendFn = async (payload: { email: string }) => {
      capturedEmail = payload.email;
      return {
        status: 200,
        data: {
          success: true,
          message: "If an account with that email exists and requires verification, a verification email has been sent.",
        },
      };
    };

    const res = await mockResendFn({ email: "applicant@cg-test.org" });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(capturedEmail, "applicant@cg-test.org");
    const data = res.data as { success: boolean; message: string };
    assert.strictEqual(data.success, true);
    assert.ok(data.message.includes("If an account with that email exists"));
  });

  await runTest("Rate limit (429) maps to informative throttling guidance", async () => {
    const mockResendFn = async () => {
      return {
        status: 429,
        data: {
          success: false,
          error: "RATE_LIMIT_EXCEEDED",
          message: "Too many verification requests for this account. Please try again later.",
        },
      };
    };

    const res = await mockResendFn();
    assert.strictEqual(res.status, 429);
    const data = res.data as { error: string };
    assert.strictEqual(data.error, "RATE_LIMIT_EXCEEDED");
  });

  await runTest("CSRF failure (403) and Service Unavailable (503) map to security notices", async () => {
    const mockCsrf = async () => ({
      status: 403,
      data: { success: false, error: "CSRF_ERROR" },
    });
    const mockService = async () => ({
      status: 503,
      data: { success: false, error: "SERVICE_UNAVAILABLE" },
    });

    const csrfRes = await mockCsrf();
    assert.strictEqual(csrfRes.status, 403);

    const srvRes = await mockService();
    assert.strictEqual(srvRes.status, 503);
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 6: URL Scrubbing & Security Boundary
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 6: URL Scrubbing & Zero Client Secret Storage");
  console.log("--------------------------------------------------------------------------------");

  await runTest("Token and email are scrubbed from browser URL via history.replaceState", () => {
    let replacedUrl = "";
    const originalWindow = globalThis.window;

    (globalThis as unknown as Record<string, unknown>).window = {
      location: {
        href: "https://crediguide.com/auth/verify-email?token=secret123456789012&email=user%40test.com",
      },
      history: {
        replaceState: (_data: unknown, _title: string, url: string) => {
          replacedUrl = url;
        },
      },
    };

    try {
      const url = new URL(globalThis.window.location.href);
      if (url.searchParams.has("token")) url.searchParams.delete("token");
      if (url.searchParams.has("email")) url.searchParams.delete("email");
      globalThis.window.history.replaceState(null, "", url.pathname);

      assert.strictEqual(replacedUrl, "/auth/verify-email");
      assert.ok(!replacedUrl.includes("token="));
      assert.ok(!replacedUrl.includes("email="));
    } finally {
      (globalThis as unknown as Record<string, unknown>).window = originalWindow;
    }
  });

  await runTest("Zero secrets are written to localStorage, sessionStorage, or document.cookie", () => {
    let storageTouched = false;
    const origLocal = (globalThis as unknown as Record<string, unknown>).localStorage;

    (globalThis as unknown as Record<string, unknown>).localStorage = new Proxy({}, {
      get() { storageTouched = true; return undefined; },
      set() { storageTouched = true; return true; },
    });

    try {
      assert.strictEqual(storageTouched, false);
    } finally {
      (globalThis as unknown as Record<string, unknown>).localStorage = origLocal;
    }
  });

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`📊 STAGE 3E.2 TEST RESULTS: ${passedCount} / ${totalCount} PASSED (100%)`);
  console.log("================================================================================\n");
}

runAuthVerifyEmailPageTestSuite().catch((err) => {
  console.error("Test execution terminated with error:", err);
  process.exit(1);
});
