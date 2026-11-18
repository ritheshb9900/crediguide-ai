import assert from "node:assert";
import {
  hashPassword,
  verifyPassword,
  calculateProgressiveDelay,
  ARGON2_OPTIONS,
} from "../src/lib/auth/password";
import {
  generateSecureToken,
  hashToken,
  verifyTokenHash,
  maskEmail,
  maskTokenPrefix,
} from "../src/lib/auth/tokens";
import {
  DevelopmentMemoryRateLimiter,
  RateLimiterConfigurationError,
  getRateLimiter,
  resetRateLimiterInstance,
} from "../src/lib/auth/rate-limiter";
import {
  DevelopmentEmailProvider,
  DisabledEmailProvider,
  DevEmailSink,
} from "../src/lib/auth/email-provider";
import {
  getSessionCookieConfig,
  getExpiredSessionCookieConfig,
  SESSION_COOKIE_NAME,
  SESSION_EXPIRATION_DAYS,
} from "../src/lib/auth/session";
import {
  RegisterApplicantInputSchema,
  LoginInputSchema,
  ForgotPasswordInputSchema,
  ResetPasswordInputSchema,
  VerifyEmailInputSchema,
} from "../src/lib/auth/validation";

let passedCount = 0;
let failedCount = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passedCount++;
    } catch (err: unknown) {
      console.error(`  ❌ [FAIL] ${name}`);
      console.error(err instanceof Error ? err.stack : String(err));
      failedCount++;
    }
  })();
}

async function runAllTests() {
  console.log("\n================================================================================");
  console.log("🔐 CREDIGUIDE AI — SUB-PHASE A: CRYPTOGRAPHY & SECURITY INFRASTRUCTURE TESTS");
  console.log("================================================================================\n");

  console.log("▶ SUITE 1: Argon2id Password Hashing & Verification");
  await test("Argon2id options match OWASP guidance (m=19456 KiB, t=2, p=1)", () => {
    assert.strictEqual(ARGON2_OPTIONS.memoryCost, 19456);
    assert.strictEqual(ARGON2_OPTIONS.timeCost, 2);
    assert.strictEqual(ARGON2_OPTIONS.parallelism, 1);
  });

  let generatedHash = "";
  await test("hashPassword generates valid Argon2id PHC string", async () => {
    generatedHash = await hashPassword("ComplexP@ssw0rd2026!");
    assert.ok(generatedHash.startsWith("$argon2id$v=19$m=19456,t=2,p=1$"));
  });

  await test("verifyPassword returns true for matching password", async () => {
    const isMatch = await verifyPassword(generatedHash, "ComplexP@ssw0rd2026!");
    assert.strictEqual(isMatch, true);
  });

  await test("verifyPassword returns false for incorrect password", async () => {
    const isMatch = await verifyPassword(generatedHash, "WrongPassword999!");
    assert.strictEqual(isMatch, false);
  });

  await test("verifyPassword returns false for malformed hash without crashing", async () => {
    const isMatch = await verifyPassword("not-a-valid-argon2-hash", "ComplexP@ssw0rd2026!");
    assert.strictEqual(isMatch, false);
  });

  await test("hashPassword rejects passwords shorter than 8 characters", async () => {
    await assert.rejects(async () => {
      await hashPassword("Short1!");
    }, /at least 8 characters/);
  });

  await test("calculateProgressiveDelay computes bounded delay (0 to 2000ms)", () => {
    assert.strictEqual(calculateProgressiveDelay(0), 0);
    assert.strictEqual(calculateProgressiveDelay(1), 200);
    assert.strictEqual(calculateProgressiveDelay(3), 600);
    assert.strictEqual(calculateProgressiveDelay(5), 1000);
    assert.strictEqual(calculateProgressiveDelay(10), 2000); // capped at 2000ms
    assert.strictEqual(calculateProgressiveDelay(25), 2000); // capped at 2000ms
  });

  console.log("\n▶ SUITE 2: Cryptographic Tokens & SHA-256 Hashing");
  await test("generateSecureToken generates 256-bit base64url string", () => {
    const token1 = generateSecureToken(32);
    const token2 = generateSecureToken(32);
    assert.ok(token1.length >= 40);
    assert.notStrictEqual(token1, token2);
    // Base64url contains only URL-safe chars
    assert.match(token1, /^[A-Za-z0-9_-]+$/);
  });

  await test("hashToken computes deterministic 64-character SHA-256 hex digest", () => {
    const raw = "sample-secret-token-12345678";
    const digest1 = hashToken(raw);
    const digest2 = hashToken(raw);
    assert.strictEqual(digest1, digest2);
    assert.strictEqual(digest1.length, 64);
    assert.match(digest1, /^[0-9a-f]{64}$/);
  });

  await test("verifyTokenHash matches valid candidate token against stored hash", () => {
    const raw = "auth-session-test-token-value";
    const storedHash = hashToken(raw);
    assert.strictEqual(verifyTokenHash(raw, storedHash), true);
    assert.strictEqual(verifyTokenHash("tampered-token-value", storedHash), false);
  });

  await test("maskEmail correctly masks local part", () => {
    assert.strictEqual(maskEmail("rohit.sharma@example.com"), "r****@example.com");
    assert.strictEqual(maskEmail("a@domain.com"), "*@domain.com");
    assert.strictEqual(maskEmail("invalid-email"), "***@***");
  });

  await test("maskTokenPrefix masks tokens to 4 chars + ***", () => {
    assert.strictEqual(maskTokenPrefix("e4b2d3c4f5"), "e4b2***");
    assert.strictEqual(maskTokenPrefix("ab"), "****");
  });

  console.log("\n▶ SUITE 3: Rate Limiting & Fail-Closed Guard");
  await test("DevelopmentMemoryRateLimiter throttles when window is exceeded", async () => {
    const limiter = new DevelopmentMemoryRateLimiter();
    const key = "test-ip-127.0.0.1";

    const r1 = await limiter.consume(key, 3, 60000);
    assert.strictEqual(r1.allowed, true);
    assert.strictEqual(r1.remaining, 2);

    const r2 = await limiter.consume(key, 3, 60000);
    assert.strictEqual(r2.allowed, true);
    assert.strictEqual(r2.remaining, 1);

    const r3 = await limiter.consume(key, 3, 60000);
    assert.strictEqual(r3.allowed, true);
    assert.strictEqual(r3.remaining, 0);

    // 4th request must be rejected
    const r4 = await limiter.consume(key, 3, 60000);
    assert.strictEqual(r4.allowed, false);
    assert.strictEqual(r4.remaining, 0);
    assert.ok(r4.retryAfterSeconds! > 0);

    // Resetting clears the bucket
    await limiter.reset(key);
    const r5 = await limiter.consume(key, 3, 60000);
    assert.strictEqual(r5.allowed, true);
  });

  await test("getRateLimiter fails closed in production when shared store is unconfigured", () => {
    const origEnv = process.env.NODE_ENV;
    const origRedis = process.env.REDIS_URL;
    const envObj = process.env as Record<string, string | undefined>;
    try {
      envObj.NODE_ENV = "production";
      delete process.env.REDIS_URL;
      delete process.env.RATE_LIMIT_STORE;
      resetRateLimiterInstance();

      assert.throws(() => {
        getRateLimiter();
      }, RateLimiterConfigurationError);
    } finally {
      envObj.NODE_ENV = origEnv;
      if (origRedis) process.env.REDIS_URL = origRedis;
      resetRateLimiterInstance();
    }
  });

  console.log("\n▶ SUITE 4: Email Provider Abstraction & Masked Sink");
  await test("DevelopmentEmailProvider logs masked token and saves to DevEmailSink", async () => {
    DevEmailSink.clear();
    const provider = new DevelopmentEmailProvider();

    const result = await provider.sendPasswordReset({
      to: "priya.patel@example.com",
      recipientName: "Priya Patel",
      actionUrl: "http://localhost:3000/auth/reset-password?token=secret123",
      expiresInMinutes: 15,
      tokenHashPrefix: "abcd1234",
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.messageId);

    const latest = DevEmailSink.getLatest();
    assert.ok(latest);
    assert.strictEqual(latest.to, "priya.patel@example.com");
    assert.strictEqual(latest.type, "PASSWORD_RESET");
    assert.strictEqual(latest.actionUrl, "http://localhost:3000/auth/reset-password?token=secret123");
  });

  await test("DisabledEmailProvider returns failure without false claim of delivery", async () => {
    const disabled = new DisabledEmailProvider();
    const result = await disabled.sendPasswordReset({
      to: "user@example.com",
      recipientName: "Test User",
      actionUrl: "https://example.com/reset",
      expiresInMinutes: 15,
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes("OUTBOUND_EMAIL_DISABLED"));
  });

  console.log("\n▶ SUITE 5: Session Cookie Configuration");
  await test("getSessionCookieConfig sets enterprise security flags", () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const config = getSessionCookieConfig("test-raw-token", expiresAt);

    assert.strictEqual(config.name, SESSION_COOKIE_NAME);
    assert.strictEqual(config.value, "test-raw-token");
    assert.strictEqual(config.httpOnly, true);
    assert.strictEqual(config.sameSite, "lax");
    assert.strictEqual(config.path, "/");
    assert.strictEqual(config.maxAge, SESSION_EXPIRATION_DAYS * 24 * 60 * 60);
    assert.strictEqual(config.expires, expiresAt);
  });

  await test("getSessionCookieConfig sets secure=true in production and secure=false in development", () => {
    const origEnv = process.env.NODE_ENV;
    const envObj = process.env as Record<string, string | undefined>;
    try {
      envObj.NODE_ENV = "production";
      const prodConfig = getSessionCookieConfig("tok", new Date());
      assert.strictEqual(prodConfig.secure, true);

      envObj.NODE_ENV = "development";
      const devConfig = getSessionCookieConfig("tok", new Date());
      assert.strictEqual(devConfig.secure, false);
    } finally {
      envObj.NODE_ENV = origEnv;
    }
  });

  await test("getExpiredSessionCookieConfig clears cookie with maxAge=0", () => {
    const config = getExpiredSessionCookieConfig();
    assert.strictEqual(config.name, SESSION_COOKIE_NAME);
    assert.strictEqual(config.value, "");
    assert.strictEqual(config.maxAge, 0);
  });

  console.log("\n▶ SUITE 6: Validation Schemas & Role Injection Defense");
  await test("RegisterApplicantInputSchema normalizes email and validates password", () => {
    const valid = RegisterApplicantInputSchema.parse({
      firstName: "Rohit",
      lastName: "Sharma",
      email: "  ROHIT.SHARMA@Example.com  ",
      phone: "9876543210",
      password: "StrongPassword123!",
    });

    assert.strictEqual(valid.email, "rohit.sharma@example.com");
    assert.strictEqual(valid.firstName, "Rohit");
  });

  await test("RegisterApplicantInputSchema rejects password lacking complexity", () => {
    assert.throws(() => {
      RegisterApplicantInputSchema.parse({
        firstName: "Rohit",
        lastName: "Sharma",
        email: "rohit@example.com",
        password: "simplepassword", // missing uppercase, number, symbol
      });
    });
  });

  await test("RegisterApplicantInputSchema strictly rejects client-supplied role (prevents role injection)", () => {
    assert.throws(() => {
      RegisterApplicantInputSchema.parse({
        firstName: "Malicious",
        lastName: "User",
        email: "attacker@example.com",
        password: "StrongPassword123!",
        role: "BANK_ADMIN", // Illegal role injection attempt
      });
    });
  });

  await test("LoginInputSchema parses valid login inputs", () => {
    const valid = LoginInputSchema.parse({
      email: "  User@Domain.com ",
      password: "MyPassword123!",
      rememberMe: true,
    });
    assert.strictEqual(valid.email, "user@domain.com");
    assert.strictEqual(valid.rememberMe, true);
  });

  await test("ForgotPasswordInputSchema normalizes email and rejects invalid format", () => {
    const valid = ForgotPasswordInputSchema.parse({
      email: " RECOVERY@Example.COM ",
    });
    assert.strictEqual(valid.email, "recovery@example.com");

    assert.throws(() => {
      ForgotPasswordInputSchema.parse({
        email: "not-an-email",
      });
    });
  });

  await test("ResetPasswordInputSchema and VerifyEmailInputSchema enforce minimum token length", () => {
    const validReset = ResetPasswordInputSchema.parse({
      token: "valid-secure-token-12345678",
      password: "NewPassword2026!",
    });
    assert.strictEqual(validReset.token, "valid-secure-token-12345678");

    assert.throws(() => {
      VerifyEmailInputSchema.parse({
        token: "short",
      });
    });
  });

  console.log("\n================================================================================");
  console.log(`🏁 SUB-PHASE A TEST RESULTS: ${passedCount} Passed | ${failedCount} Failed`);
  console.log("================================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error("Unhandled test suite execution error:", err);
  process.exit(1);
});
