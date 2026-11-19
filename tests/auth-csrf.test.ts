import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  getCanonicalOrigin,
  validateCsrfOrigin,
  validateContentType,
  requireCsrf,
  CsrfConfigurationError,
} from "@/lib/auth/csrf";
import { proxy } from "@/proxy";

// Route handlers under test
import { POST as registerHandler } from "@/app/api/auth/register/route";
import { POST as loginHandler } from "@/app/api/auth/login/route";
import { POST as logoutHandler } from "@/app/api/auth/logout/route";
import { POST as forgotPasswordHandler } from "@/app/api/auth/forgot-password/route";
import { POST as resetPasswordHandler } from "@/app/api/auth/reset-password/route";
import { POST as verifyEmailHandler } from "@/app/api/auth/verify-email/route";
import { POST as resendVerificationHandler } from "@/app/api/auth/resend-verification/route";
import { POST as adminOfficersHandler } from "@/app/api/admin/officers/route";
import { POST as chatHandler } from "@/app/api/chat/route";
import { POST as eligibilityHandler } from "@/app/api/eligibility/route";

const DEFAULT_ORIGIN = "http://localhost:3000";

let passedCount = 0;
let totalCount = 0;

function runTest(name: string, fn: () => void | Promise<void>) {
  totalCount++;
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result
        .then(() => {
          passedCount++;
          console.log(`  ✅ [PASS] ${name}`);
        })
        .catch((err) => {
          console.error(`  ❌ [FAIL] ${name}`);
          console.error(err);
          throw err;
        });
    } else {
      passedCount++;
      console.log(`  ✅ [PASS] ${name}`);
    }
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(err);
    throw err;
  }
}

async function runAllTests() {
  console.log("================================================================================");
  console.log("🧪 CrediGuide AI - Phase 4 Sub-Phase F: CSRF & Route Protection Test Suite");
  console.log("================================================================================\n");

  // Save initial env state
  const originalEnv = { ...process.env };

  try {
    // -------------------------------------------------------------------------
    // GROUP 1: Canonical Origin Resolution & Production Fail-Closed
    // -------------------------------------------------------------------------
    console.log("--------------------------------------------------------------------------------");
    console.log("▶ TEST GROUP 1: Canonical Origin Resolution & Production Fail-Closed");
    console.log("--------------------------------------------------------------------------------");

    runTest("Dev default origin resolves to http://localhost:3000", () => {
      delete process.env.APP_URL;
      delete process.env.NEXT_PUBLIC_APP_URL;
      (process.env as Record<string, string | undefined>).NODE_ENV = "development";

      const canonical = getCanonicalOrigin();
      assert.equal(canonical.origin, "http://localhost:3000");
      assert.equal(canonical.protocol, "http:");
      assert.equal(canonical.hostname, "localhost");
      assert.equal(canonical.effectivePort, "3000");
    });

    runTest("Explicit APP_URL is correctly parsed in development", () => {
      process.env.APP_URL = "http://localhost:8080";
      delete process.env.NEXT_PUBLIC_APP_URL;
      (process.env as Record<string, string | undefined>).NODE_ENV = "development";

      const canonical = getCanonicalOrigin();
      assert.equal(canonical.origin, "http://localhost:8080");
      assert.equal(canonical.effectivePort, "8080");
    });

    runTest("NEXT_PUBLIC_APP_URL fallback is supported in development when APP_URL is unset", () => {
      delete process.env.APP_URL;
      process.env.NEXT_PUBLIC_APP_URL = "http://localhost:4000";
      (process.env as Record<string, string | undefined>).NODE_ENV = "development";

      const canonical = getCanonicalOrigin();
      assert.equal(canonical.origin, "http://localhost:4000");
      assert.equal(canonical.effectivePort, "4000");
    });

    runTest("Production with valid APP_URL resolves canonical origin correctly", () => {
      process.env.APP_URL = "https://app.crediguide.ai";
      delete process.env.NEXT_PUBLIC_APP_URL;
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";

      const canonical = getCanonicalOrigin();
      assert.equal(canonical.origin, "https://app.crediguide.ai");
      assert.equal(canonical.protocol, "https:");
      assert.equal(canonical.hostname, "app.crediguide.ai");
      assert.equal(canonical.effectivePort, "443");
    });

    runTest("Production fails closed when APP_URL is missing", () => {
      delete process.env.APP_URL;
      delete process.env.NEXT_PUBLIC_APP_URL;
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";

      assert.throws(() => getCanonicalOrigin(), CsrfConfigurationError);
    });

    runTest("Production fails closed and does NOT fall back to NEXT_PUBLIC_APP_URL when APP_URL is missing", () => {
      delete process.env.APP_URL;
      process.env.NEXT_PUBLIC_APP_URL = "https://app.crediguide.ai";
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";

      assert.throws(() => getCanonicalOrigin(), (err: unknown) => {
        return (
          err instanceof CsrfConfigurationError &&
          err.message.includes("requires an explicitly configured server-side APP_URL")
        );
      });
    });

    runTest("Production fails closed if APP_URL is empty or whitespace-only", () => {
      process.env.APP_URL = "   ";
      delete process.env.NEXT_PUBLIC_APP_URL;
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";

      assert.throws(() => getCanonicalOrigin(), CsrfConfigurationError);
    });

    runTest("Reject canonical URL with unexpected subpaths beyond root slash", () => {
      process.env.APP_URL = "https://app.crediguide.ai/subpath";
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";

      assert.throws(() => getCanonicalOrigin(), (err: unknown) => {
        return err instanceof CsrfConfigurationError && err.message.includes("subpaths");
      });
    });

    runTest("Reject canonical URL with embedded credentials", () => {
      process.env.APP_URL = "https://user:pass@app.crediguide.ai";
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";

      assert.throws(() => getCanonicalOrigin(), (err: unknown) => {
        return err instanceof CsrfConfigurationError && err.message.includes("credentials");
      });
    });

    runTest("Reject canonical URL with query string or fragment", () => {
      process.env.APP_URL = "https://app.crediguide.ai/?query=1";
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";

      assert.throws(() => getCanonicalOrigin(), (err: unknown) => {
        return err instanceof CsrfConfigurationError && err.message.includes("search or query");
      });

      process.env.APP_URL = "https://app.crediguide.ai/#fragment";
      assert.throws(() => getCanonicalOrigin(), (err: unknown) => {
        return err instanceof CsrfConfigurationError && err.message.includes("hash fragments");
      });
    });

    runTest("Reject non-http/https protocols for canonical URL", () => {
      process.env.APP_URL = "ftp://app.crediguide.ai";
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";

      assert.throws(() => getCanonicalOrigin(), CsrfConfigurationError);
    });

    // Reset back to dev localhost:3000 for remainder of tests
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    process.env.APP_URL = DEFAULT_ORIGIN;
    delete process.env.NEXT_PUBLIC_APP_URL;

    // -------------------------------------------------------------------------
    // GROUP 2: CSRF Origin Header Validation & Spoofing Defense
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("▶ TEST GROUP 2: CSRF Origin Header Validation & Spoofing Defense");
    console.log("--------------------------------------------------------------------------------");

    runTest("Valid same-origin Origin header passes", () => {
      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { origin: DEFAULT_ORIGIN },
      });
      const result = validateCsrfOrigin(req);
      assert.equal(result.isValid, true);
    });

    runTest("Valid same-origin Referer fallback passes when Origin is absent", () => {
      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { referer: "http://localhost:3000/auth/login" },
      });
      const result = validateCsrfOrigin(req);
      assert.equal(result.isValid, true);
    });

    runTest("Missing both Origin and Referer fails closed with 403", () => {
      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
      });
      const result = validateCsrfOrigin(req);
      assert.equal(result.isValid, false);
      if (!result.isValid) {
        assert.equal(result.status, 403);
        assert.equal(result.error, "CSRF_VIOLATION");
      }
    });

    runTest("Cross-origin Origin header is rejected with 403", () => {
      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { origin: "https://evil.com" },
      });
      const result = validateCsrfOrigin(req);
      assert.equal(result.isValid, false);
      if (!result.isValid) {
        assert.equal(result.status, 403);
      }
    });

    runTest("Protocol mismatch is rejected with 403", () => {
      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { origin: "https://localhost:3000" },
      });
      const result = validateCsrfOrigin(req);
      assert.equal(result.isValid, false);
      if (!result.isValid) {
        assert.equal(result.status, 403);
      }
    });

    runTest("Hostname mismatch is rejected with 403", () => {
      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { origin: "http://127.0.0.1:3000" },
      });
      const result = validateCsrfOrigin(req);
      assert.equal(result.isValid, false);
      if (!result.isValid) {
        assert.equal(result.status, 403);
      }
    });

    runTest("Port mismatch is rejected with 403", () => {
      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { origin: "http://localhost:8080" },
      });
      const result = validateCsrfOrigin(req);
      assert.equal(result.isValid, false);
      if (!result.isValid) {
        assert.equal(result.status, 403);
      }
    });

    runTest("Prefix hostname spoofing (attacker-localhost) is rejected with 403", () => {
      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { origin: "http://attacker-localhost:3000" },
      });
      const result = validateCsrfOrigin(req);
      assert.equal(result.isValid, false);
      if (!result.isValid) {
        assert.equal(result.status, 403);
      }
    });

    runTest("Suffix hostname spoofing (localhost.attacker.com) is rejected with 403", () => {
      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { origin: "http://localhost.attacker.com:3000" },
      });
      const result = validateCsrfOrigin(req);
      assert.equal(result.isValid, false);
      if (!result.isValid) {
        assert.equal(result.status, 403);
      }
    });

    runTest("Malformed Origin string is rejected with 403", () => {
      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { origin: "not-a-valid-url" },
      });
      const result = validateCsrfOrigin(req);
      assert.equal(result.isValid, false);
      if (!result.isValid) {
        assert.equal(result.status, 403);
      }
    });

    runTest("Malformed Referer string is rejected with 403", () => {
      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { referer: "not-a-valid-referer" },
      });
      const result = validateCsrfOrigin(req);
      assert.equal(result.isValid, false);
      if (!result.isValid) {
        assert.equal(result.status, 403);
      }
    });

    runTest("Spoofed X-Forwarded-Host does NOT alter expected canonical origin", () => {
      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          origin: "https://evil.com",
          "x-forwarded-host": "evil.com",
          "x-forwarded-proto": "https",
        },
      });
      const result = validateCsrfOrigin(req);
      assert.equal(result.isValid, false);
      if (!result.isValid) {
        assert.equal(result.status, 403);
      }
    });

    // -------------------------------------------------------------------------
    // GROUP 3: Content-Type Validation
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("▶ TEST GROUP 3: Content-Type Validation");
    console.log("--------------------------------------------------------------------------------");

    runTest("Content-Type 'application/json' is accepted", () => {
      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      assert.equal(validateContentType(req).isValid, true);
    });

    runTest("Content-Type 'application/json; charset=utf-8' is accepted", () => {
      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
      });
      assert.equal(validateContentType(req).isValid, true);
    });

    runTest("Content-Type 'application/json; charset=UTF-8' (case-insensitive) is accepted", () => {
      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json; charset=UTF-8" },
      });
      assert.equal(validateContentType(req).isValid, true);
    });

    runTest("Content-Type 'application/x-www-form-urlencoded' is rejected with 415", () => {
      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      });
      const result = validateContentType(req);
      assert.equal(result.isValid, false);
      if (!result.isValid) {
        assert.equal(result.status, 415);
      }
    });

    runTest("Content-Type 'multipart/form-data' is rejected with 415", () => {
      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=something" },
      });
      const result = validateContentType(req);
      assert.equal(result.isValid, false);
      if (!result.isValid) {
        assert.equal(result.status, 415);
      }
    });

    runTest("Content-Type 'text/plain' is rejected with 415", () => {
      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "content-type": "text/plain" },
      });
      const result = validateContentType(req);
      assert.equal(result.isValid, false);
      if (!result.isValid) {
        assert.equal(result.status, 415);
      }
    });

    runTest("Missing Content-Type on standard mutation is rejected with 415", () => {
      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
      });
      const result = validateContentType(req);
      assert.equal(result.isValid, false);
      if (!result.isValid) {
        assert.equal(result.status, 415);
      }
    });

    runTest("Missing Content-Type with allowEmptyBody (logout) is accepted", () => {
      const req = new Request("http://localhost:3000/api/auth/logout", {
        method: "POST",
      });
      assert.equal(validateContentType(req, { allowEmptyBody: true }).isValid, true);
    });

    runTest("Omitted body with non-JSON Content-Type on logout is rejected with 415", () => {
      const req = new Request("http://localhost:3000/api/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      });
      const result = validateContentType(req, { allowEmptyBody: true });
      assert.equal(result.isValid, false);
      if (!result.isValid) {
        assert.equal(result.status, 415);
      }
    });

    // -------------------------------------------------------------------------
    // GROUP 4: Safe HTTP Methods Exemption
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("▶ TEST GROUP 4: Safe HTTP Methods Exemption");
    console.log("--------------------------------------------------------------------------------");

    runTest("GET request passes requireCsrf without Origin or Content-Type", () => {
      const req = new Request("http://localhost:3000/api/auth/me", { method: "GET" });
      assert.equal(requireCsrf(req), null);
    });

    runTest("HEAD request passes requireCsrf without Origin or Content-Type", () => {
      const req = new Request("http://localhost:3000/api/auth/me", { method: "HEAD" });
      assert.equal(requireCsrf(req), null);
    });

    runTest("OPTIONS preflight passes requireCsrf without Origin or Content-Type", () => {
      const req = new Request("http://localhost:3000/api/auth/login", { method: "OPTIONS" });
      assert.equal(requireCsrf(req), null);
    });

    // -------------------------------------------------------------------------
    // GROUP 5: Direct Route-Handler Enforcement (All 8 Mutation Handlers)
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("▶ TEST GROUP 5: Direct Route-Handler Enforcement (All 8 Mutation Handlers)");
    console.log("--------------------------------------------------------------------------------");

    const mutationHandlers = [
      { name: "POST /api/auth/register", handler: registerHandler, path: "/api/auth/register" },
      { name: "POST /api/auth/login", handler: loginHandler, path: "/api/auth/login" },
      { name: "POST /api/auth/logout", handler: logoutHandler, path: "/api/auth/logout", isLogout: true },
      { name: "POST /api/auth/forgot-password", handler: forgotPasswordHandler, path: "/api/auth/forgot-password" },
      { name: "POST /api/auth/reset-password", handler: resetPasswordHandler, path: "/api/auth/reset-password" },
      { name: "POST /api/auth/verify-email", handler: verifyEmailHandler, path: "/api/auth/verify-email" },
      { name: "POST /api/auth/resend-verification", handler: resendVerificationHandler, path: "/api/auth/resend-verification" },
      { name: "POST /api/admin/officers", handler: adminOfficersHandler, path: "/api/admin/officers" },
    ];

    for (const { name, handler, path, isLogout } of mutationHandlers) {
      await runTest(`${name}: Direct call with cross-origin Origin returns 403`, async () => {
        const req = new Request(`http://localhost:3000${path}`, {
          method: "POST",
          headers: {
            origin: "https://evil.com",
            "content-type": "application/json",
          },
          body: JSON.stringify({ test: "data" }),
        });
        const res = await handler(req);
        assert.equal(res.status, 403);
        const data = await res.json();
        assert.equal(data.success, false);
        assert.equal(data.error, "CSRF_VIOLATION");
      });

      await runTest(`${name}: Direct call with missing Origin and Referer returns 403`, async () => {
        const req = new Request(`http://localhost:3000${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ test: "data" }),
        });
        const res = await handler(req);
        assert.equal(res.status, 403);
        const data = await res.json();
        assert.equal(data.success, false);
        assert.equal(data.error, "CSRF_VIOLATION");
      });

      await runTest(`${name}: Direct call with form-encoded Content-Type returns 415`, async () => {
        const req = new Request(`http://localhost:3000${path}`, {
          method: "POST",
          headers: {
            origin: DEFAULT_ORIGIN,
            "content-type": "application/x-www-form-urlencoded",
          },
          body: "email=victim%40bank.com",
        });
        const res = await handler(req);
        assert.equal(res.status, 415);
        const data = await res.json();
        assert.equal(data.success, false);
        assert.equal(data.error, "UNSUPPORTED_MEDIA_TYPE");
      });

      await runTest(`${name}: Direct call with valid same-origin headers passes CSRF check`, async () => {
        // Send empty JSON or invalid schema: proves CSRF passed and reached payload validation (400 or 200 for logout)
        // Zero database records created!
        const req = new Request(`http://localhost:3000${path}`, {
          method: "POST",
          headers: {
            origin: DEFAULT_ORIGIN,
            "content-type": "application/json",
          },
          body: JSON.stringify({}),
        });
        const res = await handler(req);
        // Status should NOT be 403 (CSRF) or 415 (Content-Type)
        assert.notEqual(res.status, 403, "Must not fail CSRF check on valid origin");
        assert.notEqual(res.status, 415, "Must not fail Content-Type check on application/json");
        if (isLogout) {
          // Logout succeeds safely with empty payload (idempotent, revokes nothing if no cookie)
          assert.equal(res.status, 200);
        } else if (path === "/api/admin/officers") {
          // Admin officers handler proceeds past CSRF check to requireRole authorization check (401 without cookie)
          assert.equal(res.status, 401);
        } else {
          // Other 6 public handlers return 400 Validation Error on empty JSON, proving CSRF succeeded without touching DB!
          assert.equal(res.status, 400);
        }
      });
    }

    // -------------------------------------------------------------------------
    // GROUP 6: Next.js 16 Proxy Boundary Integration
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("▶ TEST GROUP 6: Next.js 16 Proxy Boundary Integration");
    console.log("--------------------------------------------------------------------------------");

    runTest("Proxy fast-rejects cross-origin POST /api/auth/login with 403", () => {
      const nextReq = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          origin: "https://evil.com",
          "content-type": "application/json",
        },
      });
      const res = proxy(nextReq);
      assert.equal(res.status, 403);
    });

    runTest("Proxy fast-rejects cross-origin POST /api/auth/register with 403", () => {
      const nextReq = new NextRequest("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: {
          origin: "https://attacker.org",
          "content-type": "application/json",
        },
      });
      const res = proxy(nextReq);
      assert.equal(res.status, 403);
    });

    runTest("Proxy fast-rejects cross-origin POST /api/admin/officers with 403", () => {
      const nextReq = new NextRequest("http://localhost:3000/api/admin/officers", {
        method: "POST",
        headers: {
          origin: "https://attacker.org",
          "content-type": "application/json",
        },
      });
      const res = proxy(nextReq);
      assert.equal(res.status, 403);
    });

    runTest("Proxy fast-rejects form-encoded POST /api/auth/login with 415", () => {
      const nextReq = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          origin: DEFAULT_ORIGIN,
          "content-type": "application/x-www-form-urlencoded",
        },
      });
      const res = proxy(nextReq);
      assert.equal(res.status, 415);
    });

    runTest("Proxy allows same-origin POST /api/auth/login to proceed upstream", () => {
      const nextReq = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          origin: DEFAULT_ORIGIN,
          "content-type": "application/json",
        },
      });
      const res = proxy(nextReq);
      // NextResponse.next() returns a response without 403 or 415
      assert.notEqual(res.status, 403);
      assert.notEqual(res.status, 415);
    });

    runTest("Proxy allows GET /api/auth/me without CSRF rejection", () => {
      const nextReq = new NextRequest("http://localhost:3000/api/auth/me", {
        method: "GET",
      });
      const res = proxy(nextReq);
      assert.notEqual(res.status, 403);
      assert.notEqual(res.status, 415);
    });

    // -------------------------------------------------------------------------
    // GROUP 7: Unaltered Functionality of /api/chat and /api/eligibility
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("▶ TEST GROUP 7: Unaltered Functionality of /api/chat and /api/eligibility");
    console.log("--------------------------------------------------------------------------------");

    await runTest("POST /api/chat operates normally with valid conversational payload", async () => {
      const req = new Request("http://localhost:3000/api/chat", {
        method: "POST",
        headers: {
          origin: DEFAULT_ORIGIN,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: "Hello, I am interested in applying for a personal loan.",
          conversationState: {
            applicantProfile: {},
            collectedFields: [],
            missingFields: [],
            currentQuestion: null,
            conversationHistory: [],
          },
        }),
      });
      const res = await chatHandler(req);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.message, "Chat must return conversational reply");
    });

    await runTest("POST /api/eligibility operates normally with valid calculation payload", async () => {
      const req = new Request("http://localhost:3000/api/eligibility", {
        method: "POST",
        headers: {
          origin: DEFAULT_ORIGIN,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          applicant: {
            firstName: "Rajesh",
            lastName: "Kumar",
            email: "rajesh.kumar@sample.in",
            phone: "9876543210",
            age: 32,
            employmentType: "SALARIED",
            monthlyNetIncome: 75000,
            existingMonthlyEmi: 15000,
            creditScore: 780,
          },
          requestedAmount: 500000,
          requestedTenureMonths: 36,
          productCode: "PL_STANDARD",
        }),
      });
      const res = await eligibilityHandler(req);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.assessment, "Must return structured loan eligibility assessment");
      assert.equal(data.assessment.status, "ELIGIBLE");
    });
  } finally {
    // Restore environment variables
    process.env = originalEnv;
  }

  console.log("\n================================================================================");
  console.log(`🏁 STAGE 1 TEST SUMMARY: ${passedCount}/${totalCount} Tests Passed (100% SUCCESS)`);
  console.log("================================================================================\n");
}

runAllTests().catch(() => {
  process.exit(1);
});
