import "dotenv/config";
import assert from "node:assert";
import { prisma } from "../src/lib/prisma";
import { UserRole } from "../src/generated/prisma/enums";
import { POST as forgotPasswordHandler } from "../src/app/api/auth/forgot-password/route";
import { POST as resetPasswordHandler } from "../src/app/api/auth/reset-password/route";
import { POST as verifyEmailHandler } from "../src/app/api/auth/verify-email/route";
import { POST as resendVerificationHandler } from "../src/app/api/auth/resend-verification/route";
import { POST as registerHandler } from "../src/app/api/auth/register/route";
import { GET as meHandler } from "../src/app/api/auth/me/route";
import {
  hashPassword,
  verifyPassword,
} from "../src/lib/auth/password";
import {
  generateSecureToken,
  hashToken,
} from "../src/lib/auth/tokens";
import {
  createDatabaseSession,
  SESSION_COOKIE_NAME,
  extractClientIp,
  SAFE_FALLBACK_CLIENT_IP,
  getTrustedProxyHops,
} from "../src/lib/auth/session";
import {
  DevEmailSink,
  DisabledEmailProvider,
  resetEmailProviderInstance,
} from "../src/lib/auth/email-provider";
import {
  resetRateLimiterInstance,
} from "../src/lib/auth/rate-limiter";

const TEST_DOMAIN = "cg-test-domain.org";
const USER_A_EMAIL = `test.reset.user.a@${TEST_DOMAIN}`;
const USER_B_EMAIL = `test.reset.user.b@${TEST_DOMAIN}`;
const INACTIVE_USER_EMAIL = `test.reset.inactive@${TEST_DOMAIN}`;
const NONEXISTENT_EMAIL = `test.does.not.exist@${TEST_DOMAIN}`;

const INITIAL_PASSWORD = "InitialPassword@2026!";
const NEW_PASSWORD = "NewUpdatedPassword#2026!";
const WEAK_PASSWORD = "weak";
const TEST_ORIGIN = "http://localhost:3000";

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

// Clean up all test data under TEST_DOMAIN
async function cleanupTestData() {
  const testUsers = await prisma.user.findMany({
    where: { email: { endsWith: `@${TEST_DOMAIN}` } },
    select: { id: true },
  });

  const testUserIds = testUsers.map((u) => u.id);

  if (testUserIds.length > 0) {
    await prisma.userSession.deleteMany({
      where: { userId: { in: testUserIds } },
    });
    await prisma.passwordResetToken.deleteMany({
      where: { userId: { in: testUserIds } },
    });
    await prisma.emailVerificationToken.deleteMany({
      where: { userId: { in: testUserIds } },
    });
    await prisma.applicant.deleteMany({
      where: { userId: { in: testUserIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: testUserIds } },
    });
  }

  DevEmailSink.clear();
  resetRateLimiterInstance();
  resetEmailProviderInstance();
}

async function runResetVerificationTestSuite() {
  console.log("================================================================================");
  console.log("🔐 CrediGuide AI — Phase 4 Sub-Phase E: Password Reset & Email Verification");
  console.log("================================================================================\n");

  await cleanupTestData();

  try {
    // -------------------------------------------------------------------------
    // Setup Base Test Users
    // -------------------------------------------------------------------------
    const hashA = await hashPassword(INITIAL_PASSWORD);

    const userA = await prisma.user.create({
      data: {
        email: USER_A_EMAIL,
        passwordHash: hashA,
        role: UserRole.LOAN_APPLICANT,
        firstName: "Reset",
        lastName: "Alpha",
        isEmailVerified: false,
        isActive: true,
      },
    });

    const userB = await prisma.user.create({
      data: {
        email: USER_B_EMAIL,
        passwordHash: hashA,
        role: UserRole.LOAN_APPLICANT,
        firstName: "Reset",
        lastName: "Beta",
        isEmailVerified: true,
        isActive: true,
      },
    });

    const inactiveUser = await prisma.user.create({
      data: {
        email: INACTIVE_USER_EMAIL,
        passwordHash: hashA,
        role: UserRole.LOAN_APPLICANT,
        firstName: "Inactive",
        lastName: "User",
        isEmailVerified: false,
        isActive: false, // Inactive user
      },
    });

    // -------------------------------------------------------------------------
    // GROUP 1: Password Reset Request & Anti-Enumeration
    // -------------------------------------------------------------------------
    console.log("▶ GROUP 1: Password Reset Request & Anti-Enumeration");

    await test("POST /forgot-password generates token and records to DevEmailSink for existing user", async () => {
      DevEmailSink.clear();
      const req = new Request("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: TEST_ORIGIN },
        body: JSON.stringify({ email: USER_A_EMAIL }),
      });
      const res = await forgotPasswordHandler(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.message.includes("If an account with that email exists"));

      // Verify token in PostgreSQL
      const tokens = await prisma.passwordResetToken.findMany({
        where: { userId: userA.id, usedAt: null },
      });
      assert.strictEqual(tokens.length, 1);
      assert.strictEqual(tokens[0]!.usedAt, null);
      assert.ok(tokens[0]!.expiresAt.getTime() > Date.now());

      // Verify email was sent to DevEmailSink with actionUrl
      const latestEmail = DevEmailSink.findLatestFor(USER_A_EMAIL);
      assert.ok(latestEmail, "Email must be recorded in DevEmailSink");
      assert.strictEqual(latestEmail.type, "PASSWORD_RESET");
      assert.ok(latestEmail.actionUrl.includes("/auth/reset-password?token="));
    });

    await test("POST /forgot-password returns identical generic 200 response for non-existent account", async () => {
      DevEmailSink.clear();
      const req = new Request("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: TEST_ORIGIN },
        body: JSON.stringify({ email: NONEXISTENT_EMAIL }),
      });
      const res = await forgotPasswordHandler(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(
        data.message,
        "If an account with that email exists, password reset instructions have been sent."
      );

      // Verify no email recorded for non-existent user
      const latestEmail = DevEmailSink.findLatestFor(NONEXISTENT_EMAIL);
      assert.strictEqual(latestEmail, undefined);
    });

    await test("POST /forgot-password returns identical generic 200 response for inactive user without generating token", async () => {
      DevEmailSink.clear();
      const req = new Request("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: TEST_ORIGIN },
        body: JSON.stringify({ email: INACTIVE_USER_EMAIL }),
      });
      const res = await forgotPasswordHandler(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);

      // Verify no tokens created for inactive user
      const tokens = await prisma.passwordResetToken.findMany({
        where: { userId: inactiveUser.id },
      });
      assert.strictEqual(tokens.length, 0);
    });

    await test("Multiple reset requests safely invalidate prior unused tokens (avoiding token accumulation)", async () => {
      DevEmailSink.clear();
      // First request
      const req1 = new Request("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: TEST_ORIGIN },
        body: JSON.stringify({ email: USER_A_EMAIL }),
      });
      await forgotPasswordHandler(req1);

      // Second request
      const req2 = new Request("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: TEST_ORIGIN },
        body: JSON.stringify({ email: USER_A_EMAIL }),
      });
      await forgotPasswordHandler(req2);

      // In database: only 1 token should have usedAt: null; previous must be marked used
      const activeTokens = await prisma.passwordResetToken.findMany({
        where: { userId: userA.id, usedAt: null },
      });
      assert.strictEqual(activeTokens.length, 1, "Only one token should be active");

      const totalTokens = await prisma.passwordResetToken.findMany({
        where: { userId: userA.id },
      });
      assert.ok(totalTokens.length >= 2, "Historical tokens exist but prior ones are invalidated");
    });

    await test("POST /forgot-password rate limiter throttles excessive requests", async () => {
      // Trigger multiple requests until account limit (3) or IP limit (5) is reached
      let throttled = false;
      for (let i = 0; i < 6; i++) {
        const req = new Request("http://localhost:3000/api/auth/forgot-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            origin: TEST_ORIGIN,
            "x-forwarded-for": "198.51.100.1",
          },
          body: JSON.stringify({ email: `test.throttle.${i}@${TEST_DOMAIN}` }),
        });
        const res = await forgotPasswordHandler(req);
        if (res.status === 429) {
          throttled = true;
          const data = await res.json();
          assert.strictEqual(data.error, "RATE_LIMIT_EXCEEDED");
          break;
        }
      }
      assert.strictEqual(throttled, true, "Rate limiter must throttle after burst limit");
    });

    // -------------------------------------------------------------------------
    // GROUP 2: Password Reset Confirmation & Concurrency
    // -------------------------------------------------------------------------
    console.log("\n▶ GROUP 2: Password Reset Confirmation & Concurrency");

    // Establish active session and locked state for User A
    const userASession = await createDatabaseSession(userA.id);
    await prisma.user.update({
      where: { id: userA.id },
      data: { failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 15 * 60 * 1000) },
    });

    // Generate fresh reset token for User A
    const rawResetTokenA = generateSecureToken(32);
    const resetHashA = hashToken(rawResetTokenA);
    await prisma.passwordResetToken.create({
      data: {
        userId: userA.id,
        tokenHash: resetHashA,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    await test("POST /reset-password rejects weak password without consuming token", async () => {
      const req = new Request("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: TEST_ORIGIN },
        body: JSON.stringify({ token: rawResetTokenA, password: WEAK_PASSWORD }),
      });
      const res = await resetPasswordHandler(req);
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error, "VALIDATION_ERROR");

      // Verify token was NOT consumed
      const token = await prisma.passwordResetToken.findUnique({
        where: { tokenHash: resetHashA },
      });
      assert.strictEqual(token?.usedAt, null);
    });

    await test("POST /reset-password successfully updates password, unlocks account, and revokes sessions", async () => {
      const req = new Request("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: TEST_ORIGIN },
        body: JSON.stringify({ token: rawResetTokenA, password: NEW_PASSWORD }),
      });
      const res = await resetPasswordHandler(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);

      // Verify token is marked consumed
      const token = await prisma.passwordResetToken.findUnique({
        where: { tokenHash: resetHashA },
      });
      assert.ok(token?.usedAt !== null, "usedAt must be set");

      // Verify password was updated in Argon2id format
      const updatedUser = await prisma.user.findUniqueOrThrow({
        where: { id: userA.id },
      });
      const passwordMatches = await verifyPassword(updatedUser.passwordHash, NEW_PASSWORD);
      assert.strictEqual(passwordMatches, true);

      // Verify lockout counters were cleared
      assert.strictEqual(updatedUser.failedLoginAttempts, 0);
      assert.strictEqual(updatedUser.lockedUntil, null);

      // Verify existing sessions were revoked
      const sessionInDb = await prisma.userSession.findUniqueOrThrow({
        where: { id: userASession.session.id },
      });
      assert.ok(sessionInDb.revokedAt !== null, "Session must be revoked");

      // Verify old session cookie is rejected by /api/auth/me
      const meReq = new Request("http://localhost:3000/api/auth/me", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${userASession.rawToken}` },
      });
      const meRes = await meHandler(meReq);
      assert.strictEqual(meRes.status, 401);
    });

    await test("Replay Attack Defense: Re-submitting consumed reset token returns HTTP 400", async () => {
      const req = new Request("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: TEST_ORIGIN },
        body: JSON.stringify({ token: rawResetTokenA, password: "AnotherPassword!2026" }),
      });
      const res = await resetPasswordHandler(req);
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error, "INVALID_OR_EXPIRED_TOKEN");
    });

    await test("POST /reset-password rejects expired reset token", async () => {
      const rawExpiredToken = generateSecureToken(32);
      const expiredHash = hashToken(rawExpiredToken);
      await prisma.passwordResetToken.create({
        data: {
          userId: userA.id,
          tokenHash: expiredHash,
          expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        },
      });

      const req = new Request("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: TEST_ORIGIN },
        body: JSON.stringify({ token: rawExpiredToken, password: NEW_PASSWORD }),
      });
      const res = await resetPasswordHandler(req);
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error, "INVALID_OR_EXPIRED_TOKEN");
    });

    await test("Concurrency Race Defense: Two simultaneous reset requests with same token produce exactly 1 success and 1 failure", async () => {
      const rawConcurrentToken = generateSecureToken(32);
      const concurrentHash = hashToken(rawConcurrentToken);
      await prisma.passwordResetToken.create({
        data: {
          userId: userA.id,
          tokenHash: concurrentHash,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      });

      // Execute two simultaneous reset requests
      const [res1, res2] = await Promise.all([
        resetPasswordHandler(
          new Request("http://localhost:3000/api/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json", origin: TEST_ORIGIN },
            body: JSON.stringify({ token: rawConcurrentToken, password: "ConcurPassA#2026!" }),
          })
        ),
        resetPasswordHandler(
          new Request("http://localhost:3000/api/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json", origin: TEST_ORIGIN },
            body: JSON.stringify({ token: rawConcurrentToken, password: "ConcurPassB#2026!" }),
          })
        ),
      ]);

      const statuses = [res1.status, res2.status].sort();
      assert.strictEqual(statuses[0], 200, "Exactly one concurrent request must succeed");
      assert.strictEqual(statuses[1], 400, "Competing concurrent request must be rejected with 400");
    });

    // -------------------------------------------------------------------------
    // GROUP 3: Email Verification
    // -------------------------------------------------------------------------
    console.log("\n▶ GROUP 3: Email Verification");

    const NEW_REGISTER_EMAIL = `test.verify.applicant@${TEST_DOMAIN}`;
    DevEmailSink.clear();

    // Register a new applicant via /api/auth/register
    const regReq = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: TEST_ORIGIN },
      body: JSON.stringify({
        firstName: "Verifiable",
        lastName: "Applicant",
        email: NEW_REGISTER_EMAIL,
        password: INITIAL_PASSWORD,
      }),
    });
    const regRes = await registerHandler(regReq);
    assert.strictEqual(regRes.status, 201);

    // Retrieve generated verification token from DevEmailSink
    const regEmail = DevEmailSink.findLatestFor(NEW_REGISTER_EMAIL);
    assert.ok(regEmail, "Registration must dispatch verification email to DevEmailSink");
    const tokenMatch = regEmail.actionUrl.match(/token=([^&]+)/);
    assert.ok(tokenMatch, "ActionUrl must contain token parameter");
    const rawVerificationToken = tokenMatch[1]!;

    await test("POST /verify-email successfully verifies user email", async () => {
      const req = new Request("http://localhost:3000/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: TEST_ORIGIN },
        body: JSON.stringify({ token: rawVerificationToken }),
      });
      const res = await verifyEmailHandler(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);

      // Verify in database: user.isEmailVerified === true
      const verifiedUser = await prisma.user.findUniqueOrThrow({
        where: { email: NEW_REGISTER_EMAIL },
      });
      assert.strictEqual(verifiedUser.isEmailVerified, true);
    });

    await test("Replay Attack Defense: Re-submitting consumed verification token returns HTTP 400", async () => {
      const req = new Request("http://localhost:3000/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: TEST_ORIGIN },
        body: JSON.stringify({ token: rawVerificationToken }),
      });
      const res = await verifyEmailHandler(req);
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error, "INVALID_OR_EXPIRED_TOKEN");
    });

    await test("POST /verify-email rejects expired verification token", async () => {
      const rawExpiredVerify = generateSecureToken(32);
      const expiredVerifyHash = hashToken(rawExpiredVerify);
      await prisma.emailVerificationToken.create({
        data: {
          userId: userA.id,
          tokenHash: expiredVerifyHash,
          expiresAt: new Date(Date.now() - 1000), // Expired
        },
      });

      const req = new Request("http://localhost:3000/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: TEST_ORIGIN },
        body: JSON.stringify({ token: rawExpiredVerify }),
      });
      const res = await verifyEmailHandler(req);
      assert.strictEqual(res.status, 400);
    });

    await test("Cross-User Isolation: User A verification token cannot verify User B account", async () => {
      // Ensure userA.isEmailVerified is false
      await prisma.user.update({
        where: { id: userA.id },
        data: { isEmailVerified: false },
      });

      const rawIsolatedToken = generateSecureToken(32);
      const isolatedHash = hashToken(rawIsolatedToken);
      await prisma.emailVerificationToken.create({
        data: {
          userId: userA.id, // Strictly belonging to user A
          tokenHash: isolatedHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      // Verify user A
      const req = new Request("http://localhost:3000/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: TEST_ORIGIN },
        body: JSON.stringify({ token: rawIsolatedToken }),
      });
      const res = await verifyEmailHandler(req);
      assert.strictEqual(res.status, 200);

      // Confirm User A is verified
      const dbUserA = await prisma.user.findUniqueOrThrow({ where: { id: userA.id } });
      assert.strictEqual(dbUserA.isEmailVerified, true);

      // Confirm other users were not affected
      const dbUserB = await prisma.user.findUniqueOrThrow({ where: { id: userB.id } });
      assert.strictEqual(dbUserB.email, USER_B_EMAIL);
    });

    await test("Concurrency Race Defense: Two simultaneous verification requests produce exactly 1 success and 1 failure", async () => {
      const rawConcurrentVerify = generateSecureToken(32);
      const concurrentVerifyHash = hashToken(rawConcurrentVerify);
      await prisma.emailVerificationToken.create({
        data: {
          userId: userA.id,
          tokenHash: concurrentVerifyHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      const [res1, res2] = await Promise.all([
        verifyEmailHandler(
          new Request("http://localhost:3000/api/auth/verify-email", {
            method: "POST",
            headers: { "Content-Type": "application/json", origin: TEST_ORIGIN },
            body: JSON.stringify({ token: rawConcurrentVerify }),
          })
        ),
        verifyEmailHandler(
          new Request("http://localhost:3000/api/auth/verify-email", {
            method: "POST",
            headers: { "Content-Type": "application/json", origin: TEST_ORIGIN },
            body: JSON.stringify({ token: rawConcurrentVerify }),
          })
        ),
      ]);

      const statuses = [res1.status, res2.status].sort();
      assert.strictEqual(statuses[0], 200, "Exactly one concurrent verification must succeed");
      assert.strictEqual(statuses[1], 400, "Competing concurrent verification must be rejected with 400");
    });

    // -------------------------------------------------------------------------
    // GROUP 4: Resend Email Verification
    // -------------------------------------------------------------------------
    console.log("\n▶ GROUP 4: Resend Email Verification");

    // Make userA unverified again for resend tests
    await prisma.user.update({
      where: { id: userA.id },
      data: { isEmailVerified: false },
    });

    await test("POST /resend-verification issues new token and invalidates prior unused tokens", async () => {
      DevEmailSink.clear();
      const req = new Request("http://localhost:3000/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: TEST_ORIGIN },
        body: JSON.stringify({ email: USER_A_EMAIL }),
      });
      const res = await resendVerificationHandler(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.message.includes("If an account with that email exists"));

      // Verify new token in DB
      const activeTokens = await prisma.emailVerificationToken.findMany({
        where: { userId: userA.id, usedAt: null },
      });
      assert.strictEqual(activeTokens.length, 1);

      // Verify email was dispatched to DevEmailSink
      const emailRecord = DevEmailSink.findLatestFor(USER_A_EMAIL);
      assert.ok(emailRecord);
      assert.strictEqual(emailRecord.type, "EMAIL_VERIFICATION");
    });

    await test("POST /resend-verification for already verified user returns generic 200 without issuing new token", async () => {
      DevEmailSink.clear();
      // userB is already isEmailVerified: true
      const initialTokenCount = await prisma.emailVerificationToken.count({
        where: { userId: userB.id },
      });

      const req = new Request("http://localhost:3000/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: TEST_ORIGIN },
        body: JSON.stringify({ email: USER_B_EMAIL }),
      });
      const res = await resendVerificationHandler(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);

      // Verify no new token was created
      const finalTokenCount = await prisma.emailVerificationToken.count({
        where: { userId: userB.id },
      });
      assert.strictEqual(finalTokenCount, initialTokenCount);

      // Verify no email was dispatched
      const emailRecord = DevEmailSink.findLatestFor(USER_B_EMAIL);
      assert.strictEqual(emailRecord, undefined);
    });

    await test("POST /resend-verification for non-existent email returns generic 200", async () => {
      const req = new Request("http://localhost:3000/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: TEST_ORIGIN },
        body: JSON.stringify({ email: NONEXISTENT_EMAIL }),
      });
      const res = await resendVerificationHandler(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
    });

    // -------------------------------------------------------------------------
    // GROUP 5: Email Provider Failures & Fail-Closed Behavior
    // -------------------------------------------------------------------------
    console.log("\n▶ GROUP 5: Email Provider Failures & Fail-Closed Behavior");

    await test("DisabledEmailProvider reports delivery failure honestly without claiming success", async () => {
      const disabled = new DisabledEmailProvider();
      const resetRes = await disabled.sendPasswordReset({
        to: "test@example.com",
        recipientName: "Test User",
        actionUrl: "http://localhost:3000/auth/reset-password?token=123",
        expiresInMinutes: 15,
      });
      assert.strictEqual(resetRes.success, false);
      assert.ok(resetRes.error?.includes("OUTBOUND_EMAIL_DISABLED"));

      const verifyRes = await disabled.sendEmailVerification({
        to: "test@example.com",
        recipientName: "Test User",
        actionUrl: "http://localhost:3000/auth/verify-email?token=123",
        expiresInMinutes: 1440,
      });
      assert.strictEqual(verifyRes.success, false);
      assert.ok(verifyRes.error?.includes("OUTBOUND_EMAIL_DISABLED"));
    });

    await test("Rate limiter fails closed in production with 503 when shared store is unconfigured", async () => {
      const envObj = process.env as Record<string, string | undefined>;
      const origEnv = process.env.NODE_ENV;
      const origStore = process.env.RATE_LIMIT_STORE;
      const origRedis = process.env.REDIS_URL;
      const origAppUrl = process.env.APP_URL;

      try {
        envObj.NODE_ENV = "production";
        envObj.APP_URL = TEST_ORIGIN;
        delete process.env.RATE_LIMIT_STORE;
        delete process.env.REDIS_URL;
        resetRateLimiterInstance();

        const req = new Request("http://localhost:3000/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json", origin: TEST_ORIGIN },
          body: JSON.stringify({ email: USER_A_EMAIL }),
        });
        const res = await forgotPasswordHandler(req);
        assert.strictEqual(res.status, 503);
        const data = await res.json();
        assert.strictEqual(data.error, "SERVICE_UNAVAILABLE");
      } finally {
        envObj.NODE_ENV = origEnv;
        if (origAppUrl !== undefined) process.env.APP_URL = origAppUrl;
        else delete process.env.APP_URL;
        if (origStore) process.env.RATE_LIMIT_STORE = origStore;
        if (origRedis) process.env.REDIS_URL = origRedis;
        resetRateLimiterInstance();
      }
    });

    // -------------------------------------------------------------------------
    // GROUP 6: Client IP Extraction & Trusted Proxy Security Model
    // -------------------------------------------------------------------------
    console.log("\n▶ GROUP 6: Client IP Extraction & Trusted Proxy Security Model");

    await test("Strict TRUSTED_PROXY_HOPS parsing and validation", async () => {
      const origHops = process.env.TRUSTED_PROXY_HOPS;
      try {
        // Valid complete positive integer strings
        process.env.TRUSTED_PROXY_HOPS = "1";
        assert.strictEqual(getTrustedProxyHops(), 1);

        process.env.TRUSTED_PROXY_HOPS = "2";
        assert.strictEqual(getTrustedProxyHops(), 2);

        // Undefined environment variable defaults strictly to 1
        delete process.env.TRUSTED_PROXY_HOPS;
        assert.strictEqual(getTrustedProxyHops(), 1);

        // Decimals must be rejected
        process.env.TRUSTED_PROXY_HOPS = "1.5";
        assert.strictEqual(getTrustedProxyHops(), null);

        // Alphabetic suffixes must be rejected
        process.env.TRUSTED_PROXY_HOPS = "2abc";
        assert.strictEqual(getTrustedProxyHops(), null);

        // Zero must be rejected
        process.env.TRUSTED_PROXY_HOPS = "0";
        assert.strictEqual(getTrustedProxyHops(), null);

        // Negative values must be rejected
        process.env.TRUSTED_PROXY_HOPS = "-1";
        assert.strictEqual(getTrustedProxyHops(), null);

        // Empty string and whitespace must be rejected
        process.env.TRUSTED_PROXY_HOPS = "";
        assert.strictEqual(getTrustedProxyHops(), null);

        process.env.TRUSTED_PROXY_HOPS = "   ";
        assert.strictEqual(getTrustedProxyHops(), null);

        // Unsafe integer (> Number.MAX_SAFE_INTEGER) must be rejected
        process.env.TRUSTED_PROXY_HOPS = "9007199254740992";
        assert.strictEqual(getTrustedProxyHops(), null);

        // Verify that malformed hops configuration fails closed in extractClientIp
        process.env.TRUST_PROXY = "true";
        process.env.TRUSTED_PROXY_HOPS = "2abc";
        const reqMalformedConfig = new Request("http://localhost:3000/api/auth/forgot-password", {
          headers: { "x-forwarded-for": "10.0.0.1, 203.0.113.195" },
        });
        assert.strictEqual(extractClientIp(reqMalformedConfig), SAFE_FALLBACK_CLIENT_IP);
      } finally {
        if (origHops !== undefined) process.env.TRUSTED_PROXY_HOPS = origHops;
        else delete process.env.TRUSTED_PROXY_HOPS;
        delete process.env.TRUST_PROXY;
      }
    });

    await test("A valid IP from the configured trusted proxy is accepted (IPv4 & IPv6)", async () => {
      const origTrust = process.env.TRUST_PROXY;
      const origHops = process.env.TRUSTED_PROXY_HOPS;
      try {
        process.env.TRUST_PROXY = "true";
        delete process.env.TRUSTED_PROXY_HOPS;

        // Valid IPv4 in X-Forwarded-For
        const reqIpv4 = new Request("http://localhost:3000/api/auth/forgot-password", {
          headers: { "x-forwarded-for": "203.0.113.195" },
        });
        assert.strictEqual(extractClientIp(reqIpv4), "203.0.113.195");

        // Valid IPv6 in X-Forwarded-For
        const reqIpv6 = new Request("http://localhost:3000/api/auth/forgot-password", {
          headers: { "x-forwarded-for": "2001:db8:85a3::8a2e:370:7334" },
        });
        assert.strictEqual(extractClientIp(reqIpv6), "2001:db8:85a3::8a2e:370:7334");

        // Valid IPv4 in X-Real-IP (when X-Forwarded-For is absent)
        const reqRealIp = new Request("http://localhost:3000/api/auth/forgot-password", {
          headers: { "x-real-ip": "198.51.100.42" },
        });
        assert.strictEqual(extractClientIp(reqRealIp), "198.51.100.42");
      } finally {
        if (origTrust !== undefined) process.env.TRUST_PROXY = origTrust;
        else delete process.env.TRUST_PROXY;
        if (origHops !== undefined) process.env.TRUSTED_PROXY_HOPS = origHops;
        else delete process.env.TRUSTED_PROXY_HOPS;
      }
    });

    await test("An arbitrary spoofed X-Forwarded-For value is not trusted when proxy trust is disabled", async () => {
      const origTrust = process.env.TRUST_PROXY;
      try {
        delete process.env.TRUST_PROXY;

        const req = new Request("http://localhost:3000/api/auth/forgot-password", {
          headers: { "x-forwarded-for": "198.51.100.99" },
        });
        assert.strictEqual(extractClientIp(req), SAFE_FALLBACK_CLIENT_IP);
      } finally {
        if (origTrust !== undefined) process.env.TRUST_PROXY = origTrust;
        else delete process.env.TRUST_PROXY;
      }
    });

    await test("An arbitrary spoofed X-Real-IP value is not trusted when proxy trust is disabled", async () => {
      const origTrust = process.env.TRUST_PROXY;
      try {
        delete process.env.TRUST_PROXY;

        const req = new Request("http://localhost:3000/api/auth/forgot-password", {
          headers: { "x-real-ip": "198.51.100.99" },
        });
        assert.strictEqual(extractClientIp(req), SAFE_FALLBACK_CLIENT_IP);
      } finally {
        if (origTrust !== undefined) process.env.TRUST_PROXY = origTrust;
        else delete process.env.TRUST_PROXY;
      }
    });

    await test("Forwarding chain with leading, trailing, or middle empty entries is rejected", async () => {
      const origTrust = process.env.TRUST_PROXY;
      const origHops = process.env.TRUSTED_PROXY_HOPS;
      try {
        process.env.TRUST_PROXY = "true";
        delete process.env.TRUSTED_PROXY_HOPS;

        // Leading empty entry
        const reqLeading = new Request("http://localhost:3000/api/auth/forgot-password", {
          headers: { "x-forwarded-for": ", 203.0.113.195" },
        });
        assert.strictEqual(extractClientIp(reqLeading), SAFE_FALLBACK_CLIENT_IP);

        // Trailing empty entry
        const reqTrailing = new Request("http://localhost:3000/api/auth/forgot-password", {
          headers: { "x-forwarded-for": "203.0.113.195, " },
        });
        assert.strictEqual(extractClientIp(reqTrailing), SAFE_FALLBACK_CLIENT_IP);

        // Middle empty entry
        const reqMiddle = new Request("http://localhost:3000/api/auth/forgot-password", {
          headers: { "x-forwarded-for": "10.0.0.1, , 203.0.113.195" },
        });
        assert.strictEqual(extractClientIp(reqMiddle), SAFE_FALLBACK_CLIENT_IP);

        // Multiple middle empty entries
        const reqMultiEmpty = new Request("http://localhost:3000/api/auth/forgot-password", {
          headers: { "x-forwarded-for": "10.0.0.1,   ,   , 203.0.113.195" },
        });
        assert.strictEqual(extractClientIp(reqMultiEmpty), SAFE_FALLBACK_CLIENT_IP);
      } finally {
        if (origTrust !== undefined) process.env.TRUST_PROXY = origTrust;
        else delete process.env.TRUST_PROXY;
        if (origHops !== undefined) process.env.TRUSTED_PROXY_HOPS = origHops;
        else delete process.env.TRUSTED_PROXY_HOPS;
      }
    });

    await test("Forwarding chain with malformed intermediate entries is rejected", async () => {
      const origTrust = process.env.TRUST_PROXY;
      const origHops = process.env.TRUSTED_PROXY_HOPS;
      try {
        process.env.TRUST_PROXY = "true";
        delete process.env.TRUSTED_PROXY_HOPS;

        const malformedChains = [
          "10.0.0.1, not-an-ip, 203.0.113.195",
          "10.0.0.1, 999.999.999.999, 203.0.113.195",
          "10.0.0.1, 192.168.1.1; DROP TABLE users, 203.0.113.195",
          "10.0.0.1, 2001:xyz:::1, 203.0.113.195",
          "10.0.0.1, 127.0.0.1:8080, 203.0.113.195",
        ];

        for (const chain of malformedChains) {
          const req = new Request("http://localhost:3000/api/auth/forgot-password", {
            headers: { "x-forwarded-for": chain },
          });
          assert.strictEqual(
            extractClientIp(req),
            SAFE_FALLBACK_CLIENT_IP,
            `Malformed chain '${chain}' must fall back to ${SAFE_FALLBACK_CLIENT_IP}`
          );
        }
      } finally {
        if (origTrust !== undefined) process.env.TRUST_PROXY = origTrust;
        else delete process.env.TRUST_PROXY;
        if (origHops !== undefined) process.env.TRUSTED_PROXY_HOPS = origHops;
        else delete process.env.TRUSTED_PROXY_HOPS;
      }
    });

    await test("Forwarding chain with insufficient length for configured hops is rejected", async () => {
      const origTrust = process.env.TRUST_PROXY;
      const origHops = process.env.TRUSTED_PROXY_HOPS;
      try {
        process.env.TRUST_PROXY = "true";

        // Configured for 2 hops, but header contains only 1 IP
        process.env.TRUSTED_PROXY_HOPS = "2";
        const reqSingle = new Request("http://localhost:3000/api/auth/forgot-password", {
          headers: { "x-forwarded-for": "203.0.113.195" },
        });
        assert.strictEqual(extractClientIp(reqSingle), SAFE_FALLBACK_CLIENT_IP);

        // Configured for 3 hops, but header contains only 2 IPs
        process.env.TRUSTED_PROXY_HOPS = "3";
        const reqTwo = new Request("http://localhost:3000/api/auth/forgot-password", {
          headers: { "x-forwarded-for": "10.0.0.1, 203.0.113.195" },
        });
        assert.strictEqual(extractClientIp(reqTwo), SAFE_FALLBACK_CLIENT_IP);
      } finally {
        if (origTrust !== undefined) process.env.TRUST_PROXY = origTrust;
        else delete process.env.TRUST_PROXY;
        if (origHops !== undefined) process.env.TRUSTED_PROXY_HOPS = origHops;
        else delete process.env.TRUSTED_PROXY_HOPS;
      }
    });

    await test("Valid one-hop and two-hop forwarding chains extract trusted IP via right-to-left policy", async () => {
      const origTrust = process.env.TRUST_PROXY;
      const origHops = process.env.TRUSTED_PROXY_HOPS;
      try {
        process.env.TRUST_PROXY = "true";

        // One-hop proxy (default): extracts rightmost IP
        delete process.env.TRUSTED_PROXY_HOPS;
        const reqSingleHop = new Request("http://localhost:3000/api/auth/forgot-password", {
          headers: { "x-forwarded-for": "10.0.0.1, 203.0.113.195" },
        });
        assert.strictEqual(extractClientIp(reqSingleHop), "203.0.113.195");

        // Two-hop proxy: extracts index (3 - 2 = 1)
        process.env.TRUSTED_PROXY_HOPS = "2";
        const reqTwoHop = new Request("http://localhost:3000/api/auth/forgot-password", {
          headers: { "x-forwarded-for": "198.51.100.1, 203.0.113.50, 10.0.1.20" },
        });
        assert.strictEqual(extractClientIp(reqTwoHop), "203.0.113.50");
      } finally {
        if (origTrust !== undefined) process.env.TRUST_PROXY = origTrust;
        else delete process.env.TRUST_PROXY;
        if (origHops !== undefined) process.env.TRUSTED_PROXY_HOPS = origHops;
        else delete process.env.TRUSTED_PROXY_HOPS;
      }
    });

    await test("Missing or untrusted headers use the documented safe fallback (SAFE_FALLBACK_CLIENT_IP = 127.0.0.1)", async () => {
      const origTrust = process.env.TRUST_PROXY;
      try {
        process.env.TRUST_PROXY = "true";

        // Request with no headers
        const reqEmpty = new Request("http://localhost:3000/api/auth/forgot-password");
        assert.strictEqual(extractClientIp(reqEmpty), SAFE_FALLBACK_CLIENT_IP);

        // Request with empty string headers
        const reqWhitespace = new Request("http://localhost:3000/api/auth/forgot-password", {
          headers: { "x-forwarded-for": "   " },
        });
        assert.strictEqual(extractClientIp(reqWhitespace), SAFE_FALLBACK_CLIENT_IP);
      } finally {
        if (origTrust !== undefined) process.env.TRUST_PROXY = origTrust;
        else delete process.env.TRUST_PROXY;
      }
    });

    // -------------------------------------------------------------------------
    // GROUP 7: Database Invariant & Phase 3 Protection
    // -------------------------------------------------------------------------
    console.log("\n▶ GROUP 7: Database Invariant & Phase 3 Protection");

    await test("Phase 3 Enterprise seeded records remain 100% untouched", async () => {
      const productCount = await prisma.loanProduct.count();
      const ruleCount = await prisma.eligibilityRule.count();
      const docCount = await prisma.documentRequirement.count();
      const demoApplicants = await prisma.applicant.findMany({
        where: { id: { startsWith: "demo-app-" } },
      });

      assert.strictEqual(productCount, 4, "loan_products must have exactly 4 records");
      assert.strictEqual(ruleCount, 24, "eligibility_rules must have exactly 24 records");
      assert.strictEqual(docCount, 21, "document_requirements must have exactly 21 records");
      assert.strictEqual(demoApplicants.length, 14, "demo applicants must have exactly 14 records");

      for (const demo of demoApplicants) {
        assert.strictEqual(demo.userId, null, `Demo applicant ${demo.id} userId must remain null`);
      }
    });

  } finally {
    await cleanupTestData();
    await prisma.$disconnect();
  }

  console.log("\n================================================================================");
  console.log(`📊 Test Results: ${passedCount} Passed | ${failedCount} Failed`);
  console.log("================================================================================");

  if (failedCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

void runResetVerificationTestSuite();
