import "dotenv/config";
import assert from "node:assert";
import { prisma } from "../src/lib/prisma";
import { POST as registerHandler } from "../src/app/api/auth/register/route";
import { POST as loginHandler } from "../src/app/api/auth/login/route";
import { DevEmailSink } from "../src/lib/auth/email-provider";
import { resetRateLimiterInstance } from "../src/lib/auth/rate-limiter";

const TEST_DOMAIN = "cg-test-domain.org";
const TEST_EMAIL = `test.borrower.subphaseb@${TEST_DOMAIN}`;
const TEST_PASSWORD = "StrongPassword@2026!";

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

// Clean up any test records in cg-test-domain.org
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
    await prisma.emailVerificationToken.deleteMany({
      where: { userId: { in: testUserIds } },
    });
    await prisma.passwordResetToken.deleteMany({
      where: { userId: { in: testUserIds } },
    });
    await prisma.applicant.deleteMany({
      where: { userId: { in: testUserIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: testUserIds } },
    });
  }

  // Also clean up any orphan test applicants
  await prisma.applicant.deleteMany({
    where: { email: { endsWith: `@${TEST_DOMAIN}` } },
  });
}

async function runRegisterLoginTests() {
  console.log("\n================================================================================");
  console.log("🔐 CREDIGUIDE AI — SUB-PHASE B: REGISTRATION & LOGIN APIS TARGETED TEST SUITE");
  console.log("================================================================================\n");

  // Ensure clean starting baseline
  await cleanupTestData();

  console.log("▶ SUITE 1: Synthetic Applicant Protection & Reserved Domain Rejection");

  await test("Reject registration using @example.com reserved demonstration domain", async () => {
    const req = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "Test",
        lastName: "User",
        email: "someone.new@example.com",
        password: TEST_PASSWORD,
      }),
    });

    const res = await registerHandler(req);
    const data = await res.json();

    assert.strictEqual(res.status, 400);
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error, "RESERVED_DOMAIN");
  });

  await test("Reject registration matching an existing synthetic applicant (demo-app-rohit-sharma)", async () => {
    const req = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "Rohit",
        lastName: "Sharma",
        email: "rohit.sharma@example.com",
        password: TEST_PASSWORD,
      }),
    });

    const res = await registerHandler(req);
    const data = await res.json();

    assert.strictEqual(res.status, 400);
    assert.strictEqual(data.success, false);

    // Verify demo-app-rohit-sharma in DB remains completely untouched
    const demoRecord = await prisma.applicant.findUnique({
      where: { id: "demo-app-rohit-sharma" },
    });
    assert.ok(demoRecord);
    assert.strictEqual(demoRecord.userId, null);
  });

  await test("Reject registration payloads attempting role escalation (BANK_ADMIN / BANK_OFFICER)", async () => {
    const req = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "Malicious",
        lastName: "Actor",
        email: `attacker@${TEST_DOMAIN}`,
        password: TEST_PASSWORD,
        role: "BANK_ADMIN", // Attempted privilege escalation
      }),
    });

    const res = await registerHandler(req);
    const data = await res.json();

    assert.strictEqual(res.status, 400);
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error, "VALIDATION_FAILED");
  });

  console.log("\n▶ SUITE 2: Valid Applicant Registration & Atomic Transaction");

  let createdUserId = "";
  await test("Successfully register a new applicant atomically (User + Applicant + VerificationToken)", async () => {
    DevEmailSink.clear();

    const req = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "Vikram",
        lastName: "Mehta",
        email: TEST_EMAIL,
        phone: "9876543210",
        password: TEST_PASSWORD,
      }),
    });

    const res = await registerHandler(req);
    const data = await res.json();

    assert.strictEqual(res.status, 201);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.email, TEST_EMAIL);
    assert.strictEqual(data.user.role, "LOAN_APPLICANT");
    assert.strictEqual(data.user.isEmailVerified, false);
    assert.strictEqual(data.user.passwordHash, undefined); // Zero credential leakage
    assert.ok(data.applicantId);

    createdUserId = data.user.id;

    // Verify database state
    const dbUser = await prisma.user.findUnique({
      where: { id: createdUserId },
    });
    assert.ok(dbUser);
    assert.strictEqual(dbUser.email, TEST_EMAIL);
    assert.strictEqual(dbUser.role, "LOAN_APPLICANT");
    assert.strictEqual(dbUser.isEmailVerified, false);

    const dbApplicant = await prisma.applicant.findUnique({
      where: { userId: createdUserId },
    });
    assert.ok(dbApplicant);
    assert.strictEqual(dbApplicant.email, TEST_EMAIL);
    assert.strictEqual(dbApplicant.employmentType, "UNSPECIFIED");
    assert.strictEqual(Number(dbApplicant.monthlyNetIncome), 0);

    const dbToken = await prisma.emailVerificationToken.findFirst({
      where: { userId: createdUserId },
    });
    assert.ok(dbToken);
    assert.strictEqual(dbToken.tokenHash.length, 64);
    assert.strictEqual(dbToken.usedAt, null);

    // Verify DevEmailSink recorded verification email without leaking in stdout
    const sentEmail = DevEmailSink.findLatestFor(TEST_EMAIL);
    assert.ok(sentEmail);
    assert.strictEqual(sentEmail.type, "EMAIL_VERIFICATION");
    assert.ok(sentEmail.actionUrl.includes("token="));
  });

  await test("Reject duplicate registration with identical email (HTTP 409 Conflict)", async () => {
    const req = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "Vikram",
        lastName: "Mehta",
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      }),
    });

    const res = await registerHandler(req);
    const data = await res.json();

    assert.strictEqual(res.status, 409);
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error, "EMAIL_ALREADY_EXISTS");
  });

  console.log("\n▶ SUITE 3: User Authentication & Session Issuance");

  await test("Authenticate successfully with valid credentials and issue session cookie", async () => {
    const req = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "user-agent": "AutomatedTestAgent/1.0",
      },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      }),
    });

    const res = await loginHandler(req);
    const data = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.email, TEST_EMAIL);
    assert.strictEqual(data.user.passwordHash, undefined); // No password hash returned
    assert.ok(data.sessionId);

    // Verify Set-Cookie header contains crediguide_session with HttpOnly and SameSite=Lax
    const setCookie = res.headers.get("set-cookie");
    assert.ok(setCookie);
    assert.ok(setCookie.includes("crediguide_session="));
    assert.ok(setCookie.toLowerCase().includes("httponly"));
    assert.ok(setCookie.toLowerCase().includes("samesite=lax"));

    // Verify session record in PostgreSQL
    const sessionInDb = await prisma.userSession.findUnique({
      where: { id: data.sessionId },
    });
    assert.ok(sessionInDb);
    assert.strictEqual(sessionInDb.userId, createdUserId);
    assert.strictEqual(sessionInDb.revokedAt, null);
    assert.strictEqual(sessionInDb.tokenHash.length, 64);
  });

  await test("Return generic 401 error for incorrect password and increment failed attempts", async () => {
    const req = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: "IncorrectPassword999!",
      }),
    });

    const res = await loginHandler(req);
    const data = await res.json();

    assert.strictEqual(res.status, 401);
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error, "INVALID_CREDENTIALS");
    assert.strictEqual(data.message, "Invalid email or password.");

    const dbUser = await prisma.user.findUnique({
      where: { id: createdUserId },
      select: { failedLoginAttempts: true },
    });
    assert.strictEqual(dbUser?.failedLoginAttempts, 1);
  });

  await test("Return identical generic 401 error for nonexistent user (anti-enumeration)", async () => {
    const req = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `nonexistent.${Date.now()}@${TEST_DOMAIN}`,
        password: "SomePassword123!",
      }),
    });

    const res = await loginHandler(req);
    const data = await res.json();

    assert.strictEqual(res.status, 401);
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error, "INVALID_CREDENTIALS");
    assert.strictEqual(data.message, "Invalid email or password.");
  });

  await test("Return identical generic 401 error for inactive user account", async () => {
    // Set user to inactive
    await prisma.user.update({
      where: { id: createdUserId },
      data: { isActive: false },
    });

    const req = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      }),
    });

    const res = await loginHandler(req);
    const data = await res.json();

    assert.strictEqual(res.status, 401);
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error, "INVALID_CREDENTIALS");
    assert.strictEqual(data.message, "Invalid email or password.");

    // Restore user to active
    await prisma.user.update({
      where: { id: createdUserId },
      data: { isActive: true },
    });
  });

  console.log("\n▶ SUITE 4: Account Lockout & Concurrency Safety");

  await test("Enforce 15-minute account lockout after 5 consecutive failed attempts", async () => {
    // User already has 1 failed attempt. Execute 4 more failures:
    for (let i = 2; i <= 5; i++) {
      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: TEST_EMAIL,
          password: `BadAttempt${i}!`,
        }),
      });
      const res = await loginHandler(req);
      assert.strictEqual(res.status, 401);
    }

    // Verify database state: 5 failures, lockedUntil is set ~15 mins into the future
    const dbUser = await prisma.user.findUnique({
      where: { id: createdUserId },
    });
    assert.strictEqual(dbUser?.failedLoginAttempts, 5);
    assert.ok(dbUser?.lockedUntil);
    const diffMs = dbUser!.lockedUntil!.getTime() - Date.now();
    assert.ok(diffMs > 14 * 60 * 1000 && diffMs <= 15 * 60 * 1000);

    // Attempting login with CORRECT password while locked must be REJECTED with generic 401
    const lockedReq = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      }),
    });
    const lockedRes = await loginHandler(lockedReq);
    const lockedData = await lockedRes.json();
    assert.strictEqual(lockedRes.status, 401);
    assert.strictEqual(lockedData.error, "INVALID_CREDENTIALS");
    assert.strictEqual(lockedData.message, "Invalid email or password.");
  });

  await test("Account lockout auto-expires after duration and valid login resets counters", async () => {
    // Simulate passage of 15 minutes by adjusting lockedUntil into the past
    await prisma.user.update({
      where: { id: createdUserId },
      data: { lockedUntil: new Date(Date.now() - 5000) },
    });

    // Logging in with correct password now succeeds
    const req = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      }),
    });

    const res = await loginHandler(req);
    assert.strictEqual(res.status, 200);

    // Verify lockout counters have been completely reset
    const dbUser = await prisma.user.findUnique({
      where: { id: createdUserId },
    });
    assert.strictEqual(dbUser?.failedLoginAttempts, 0);
    assert.strictEqual(dbUser?.lockedUntil, null);
    assert.ok(dbUser?.lastLoginAt);
  });

  await test("Concurrency-safe handling of multiple concurrent failed login requests", async () => {
    resetRateLimiterInstance(); // Ensure rate limiter allows test attempts

    // Fire 3 concurrent failed login attempts simultaneously
    const attempts = [1, 2, 3].map((num) =>
      loginHandler(
        new Request("http://localhost:3000/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: TEST_EMAIL,
            password: `ConcurrentFail${num}!`,
          }),
        })
      )
    );

    const responses = await Promise.all(attempts);
    for (const res of responses) {
      assert.strictEqual(res.status, 401);
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: createdUserId },
      select: { failedLoginAttempts: true },
    });
    // Atomic increment guarantees 3 attempts recorded without lost updates
    assert.strictEqual(dbUser?.failedLoginAttempts, 3);
  });

  await test("High-concurrency burst: 10 simultaneous failed login requests enforce atomic increments and lockout without lost updates", async () => {
    // 1. Setup a dedicated test account starting with failedLoginAttempts = 0
    const BURST_EMAIL = `test.burst.subphaseb@${TEST_DOMAIN}`;
    const regReq = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "Burst",
        lastName: "Tester",
        email: BURST_EMAIL,
        password: TEST_PASSWORD,
      }),
    });
    const regRes = await registerHandler(regReq);
    assert.strictEqual(regRes.status, 201);

    const initialUser = await prisma.user.findUnique({
      where: { email: BURST_EMAIL },
    });
    assert.strictEqual(initialUser?.failedLoginAttempts, 0);
    assert.strictEqual(initialUser?.lockedUntil, null);

    // 2. Reset rate limiter and fire 10 simultaneous incorrect login requests with no artificial delay
    resetRateLimiterInstance();

    const burstCount = 10;
    const burstAttempts = Array.from({ length: burstCount }, (_, i) =>
      loginHandler(
        new Request("http://localhost:3000/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": "192.168.100.1",
          },
          body: JSON.stringify({
            email: BURST_EMAIL,
            password: `BadBurstPassword${i}!`,
          }),
        })
      )
    );

    // 3. Wait for all requests to finish
    const responses = await Promise.all(burstAttempts);
    for (const res of responses) {
      assert.strictEqual(res.status, 401);
    }

    // 4. Read the actual PostgreSQL user record
    const postBurstUser = await prisma.user.findUnique({
      where: { email: BURST_EMAIL },
    });

    // 5. Verify failedLoginAttempts reflects all 10 committed failed attempts (zero lost updates)
    assert.strictEqual(postBurstUser?.failedLoginAttempts, burstCount);

    // 6. Verify lockedUntil is set and the account is actively locked
    assert.ok(postBurstUser?.lockedUntil);
    const now = Date.now();
    const lockedUntilMs = postBurstUser!.lockedUntil!.getTime();
    assert.ok(lockedUntilMs > now, "Account should be locked in the future");
    const diffMinutes = (lockedUntilMs - now) / (60 * 1000);
    assert.ok(diffMinutes >= 14 && diffMinutes <= 16, `Lockout duration should be ~15 min, got ${diffMinutes} min`);

    // 7. Verify that further login attempts during lockout CANNOT create a session even with correct credentials
    resetRateLimiterInstance();
    const lockedAttempt = await loginHandler(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "192.168.100.2",
        },
        body: JSON.stringify({
          email: BURST_EMAIL,
          password: TEST_PASSWORD, // Correct password
        }),
      })
    );
    const lockedData = await lockedAttempt.json();

    assert.strictEqual(lockedAttempt.status, 401);
    assert.strictEqual(lockedData.success, false);
    assert.strictEqual(lockedData.error, "INVALID_CREDENTIALS");
    assert.strictEqual(lockedData.message, "Invalid email or password.");
    assert.strictEqual(lockedData.sessionId, undefined);
    assert.strictEqual(lockedAttempt.headers.get("set-cookie"), null);

    // Verify in database that zero sessions were issued
    const dbSessions = await prisma.userSession.findMany({
      where: { userId: initialUser!.id },
    });
    assert.strictEqual(dbSessions.length, 0);

    // 8. Clean up burst test records safely
    await prisma.userSession.deleteMany({ where: { userId: initialUser!.id } });
    await prisma.emailVerificationToken.deleteMany({ where: { userId: initialUser!.id } });
    await prisma.applicant.deleteMany({ where: { userId: initialUser!.id } });
    await prisma.user.deleteMany({ where: { id: initialUser!.id } });
  });

  console.log("\n▶ SUITE 5: Rate Limiter Fail-Closed in Production");

  await test("Production login fails closed (503) when shared rate-limiter store is unconfigured", async () => {
    const origEnv = process.env.NODE_ENV;
    const origRedis = process.env.REDIS_URL;
    const envObj = process.env as Record<string, string | undefined>;
    try {
      envObj.NODE_ENV = "production";
      delete process.env.REDIS_URL;
      delete process.env.RATE_LIMIT_STORE;
      resetRateLimiterInstance();

      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        }),
      });

      const res = await loginHandler(req);
      const data = await res.json();

      assert.strictEqual(res.status, 503);
      assert.strictEqual(data.error, "SERVICE_UNAVAILABLE");
    } finally {
      envObj.NODE_ENV = origEnv;
      if (origRedis) process.env.REDIS_URL = origRedis;
      resetRateLimiterInstance();
    }
  });

  console.log("\n▶ SUITE 6: Database Isolation & Demonstration Data Invariant Check");

  await test("Verify synthetic applicants (14) remain 100% untouched and clean up test records", async () => {
    await cleanupTestData();

    // Verify all 14 synthetic applicants remain present and untouched
    const applicants = await prisma.applicant.findMany({
      where: { id: { startsWith: "demo-app-" } },
    });
    assert.strictEqual(applicants.length, 14);

    for (const app of applicants) {
      assert.strictEqual(app.userId, null);
      assert.ok(app.email.endsWith("@example.com"));
    }

    // Verify products, rules, documents counts
    const productsCount = await prisma.loanProduct.count();
    const rulesCount = await prisma.eligibilityRule.count();
    const docsCount = await prisma.documentRequirement.count();
    const usersCount = await prisma.user.count();

    assert.strictEqual(productsCount, 4);
    assert.strictEqual(rulesCount, 24);
    assert.strictEqual(docsCount, 21);
    assert.strictEqual(usersCount, 0); // No test users left in DB
  });

  console.log("\n================================================================================");
  console.log(`🏁 SUB-PHASE B TEST RESULTS: ${passedCount} Passed | ${failedCount} Failed`);
  console.log("================================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runRegisterLoginTests()
  .catch((err) => {
    console.error("Unhandled test execution error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await cleanupTestData();
  });
