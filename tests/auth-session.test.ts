import "dotenv/config";
import assert from "node:assert";
import { prisma } from "../src/lib/prisma";
import { POST as registerHandler } from "../src/app/api/auth/register/route";
import { POST as loginHandler } from "../src/app/api/auth/login/route";
import { POST as logoutHandler } from "../src/app/api/auth/logout/route";
import { GET as meHandler } from "../src/app/api/auth/me/route";
import {
  createDatabaseSession,
  SESSION_COOKIE_NAME,
  resetRateLimiterInstance,
  hashToken,
} from "../src/lib/auth";

const TEST_DOMAIN = "cg-test-domain.org";
const USER_A_EMAIL = `test.session.user.a@${TEST_DOMAIN}`;
const USER_B_EMAIL = `test.session.user.b@${TEST_DOMAIN}`;
const TEST_PASSWORD = "StrongSessionPassword@2026!";
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

/**
 * Extracts a cookie value from a Set-Cookie header.
 */
function extractCookieValue(setCookieHeader: string | null, cookieName: string): string | null {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(new RegExp(`${cookieName}=([^;]+)`));
  return match ? match[1] : null;
}

async function runSessionTests() {
  console.log("\n================================================================================");
  console.log("🔐 CREDIGUIDE AI — SUB-PHASE C: SESSION LIFECYCLE & CURRENT USER APIS TEST SUITE");
  console.log("================================================================================\n");

  await cleanupTestData();

  let userAId = "";
  let userBId = "";
  let userARawToken = "";
  let userBRawToken = "";

  // ---------------------------------------------------------------------------
  // Setup: Register User A and User B and log them in
  // ---------------------------------------------------------------------------
  console.log("▶ SETUP: Provision Test Users and Active Sessions");

  await test("Register User A and establish active session", async () => {
    resetRateLimiterInstance();
    const regReq = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: TEST_ORIGIN },
      body: JSON.stringify({
        firstName: "Session",
        lastName: "Alpha",
        email: USER_A_EMAIL,
        password: TEST_PASSWORD,
        employmentType: "Salaried",
        monthlyNetIncome: 75000,
      }),
    });
    const regRes = await registerHandler(regReq);
    assert.strictEqual(regRes.status, 201);

    const loginReq = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "10.10.1.1",
        origin: TEST_ORIGIN,
      },
      body: JSON.stringify({
        email: USER_A_EMAIL,
        password: TEST_PASSWORD,
      }),
    });
    const loginRes = await loginHandler(loginReq);
    assert.strictEqual(loginRes.status, 200);

    const setCookie = loginRes.headers.get("set-cookie");
    assert.ok(setCookie);
    userARawToken = extractCookieValue(setCookie, SESSION_COOKIE_NAME)!;
    assert.ok(userARawToken);

    const loginData = await loginRes.json();
    userAId = loginData.user.id;
    assert.ok(userAId);
  });

  await test("Register User B and establish independent active session", async () => {
    resetRateLimiterInstance();
    const regReq = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: TEST_ORIGIN },
      body: JSON.stringify({
        firstName: "Session",
        lastName: "Beta",
        email: USER_B_EMAIL,
        password: TEST_PASSWORD,
        employmentType: "Self-employed",
        monthlyNetIncome: 90000,
      }),
    });
    const regRes = await registerHandler(regReq);
    assert.strictEqual(regRes.status, 201);

    const loginReq = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "10.10.1.2",
        origin: TEST_ORIGIN,
      },
      body: JSON.stringify({
        email: USER_B_EMAIL,
        password: TEST_PASSWORD,
      }),
    });
    const loginRes = await loginHandler(loginReq);
    assert.strictEqual(loginRes.status, 200);

    const setCookie = loginRes.headers.get("set-cookie");
    assert.ok(setCookie);
    userBRawToken = extractCookieValue(setCookie, SESSION_COOKIE_NAME)!;
    assert.ok(userBRawToken);

    const loginData = await loginRes.json();
    userBId = loginData.user.id;
    assert.ok(userBId);
  });

  // ---------------------------------------------------------------------------
  // Suite 1: Current User API (GET /api/auth/me)
  // ---------------------------------------------------------------------------
  console.log("\n▶ SUITE 1: Current User API (GET /api/auth/me)");

  await test("GET /me with valid session cookie returns safe user profile", async () => {
    const req = new Request("http://localhost:3000/api/auth/me", {
      method: "GET",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${userARawToken}`,
      },
    });

    const res = await meHandler(req);
    const data = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.id, userAId);
    assert.strictEqual(data.user.email, USER_A_EMAIL);
    assert.strictEqual(data.user.firstName, "Session");
    assert.strictEqual(data.user.lastName, "Alpha");
    assert.strictEqual(data.user.role, "LOAN_APPLICANT");
    assert.strictEqual(data.user.isEmailVerified, false);
    assert.ok(data.user.applicantId);
    assert.ok(data.session.id);
    assert.ok(data.session.expiresAt);

    // Verify sensitive secrets are NEVER returned
    assert.strictEqual(data.user.passwordHash, undefined);
    assert.strictEqual(data.user.tokenHash, undefined);
    assert.strictEqual(data.session.tokenHash, undefined);
    assert.strictEqual(data.user.failedLoginAttempts, undefined);
    assert.strictEqual(data.user.lockedUntil, undefined);
  });

  await test("GET /me without a cookie returns HTTP 401 UNAUTHENTICATED", async () => {
    const req = new Request("http://localhost:3000/api/auth/me", {
      method: "GET",
    });

    const res = await meHandler(req);
    const data = await res.json();

    assert.strictEqual(res.status, 401);
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error, "UNAUTHENTICATED");
  });

  await test("GET /me with an invalid / forged token returns HTTP 401 UNAUTHENTICATED", async () => {
    const req = new Request("http://localhost:3000/api/auth/me", {
      method: "GET",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=forged-token-value-that-does-not-exist`,
      },
    });

    const res = await meHandler(req);
    const data = await res.json();

    assert.strictEqual(res.status, 401);
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error, "UNAUTHENTICATED");
  });

  await test("GET /me with an expired session returns HTTP 401 UNAUTHENTICATED", async () => {
    // Create an explicitly expired session for User A in PostgreSQL
    const { rawToken } = await createDatabaseSession(userAId);
    // Rewind expiresAt into the past
    await prisma.userSession.updateMany({
      where: { userId: userAId, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date(Date.now() - 60 * 1000) },
    });

    const req = new Request("http://localhost:3000/api/auth/me", {
      method: "GET",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${rawToken}`,
      },
    });

    const res = await meHandler(req);
    const data = await res.json();

    assert.strictEqual(res.status, 401);
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error, "UNAUTHENTICATED");

    // Re-establish a fresh valid session for User A for subsequent tests
    const freshSession = await createDatabaseSession(userAId);
    userARawToken = freshSession.rawToken;
  });

  await test("GET /me with a deactivated / inactive user returns HTTP 401 UNAUTHENTICATED", async () => {
    // Temporarily deactivate User A
    await prisma.user.update({
      where: { id: userAId },
      data: { isActive: false },
    });

    const req = new Request("http://localhost:3000/api/auth/me", {
      method: "GET",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${userARawToken}`,
      },
    });

    const res = await meHandler(req);
    const data = await res.json();

    assert.strictEqual(res.status, 401);
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error, "UNAUTHENTICATED");

    // Reactivate User A
    await prisma.user.update({
      where: { id: userAId },
      data: { isActive: true },
    });
  });

  // ---------------------------------------------------------------------------
  // Suite 2: Logout API (POST /api/auth/logout)
  // ---------------------------------------------------------------------------
  console.log("\n▶ SUITE 2: Logout API (POST /api/auth/logout)");

  await test("POST /api/auth/logout with valid session revokes session and clears cookie", async () => {
    const req = new Request("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${userARawToken}`,
        origin: TEST_ORIGIN,
      },
    });

    const res = await logoutHandler(req);
    const data = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.revoked, true);

    // Verify Set-Cookie header clears the session cookie with Max-Age=0
    const setCookie = res.headers.get("set-cookie");
    assert.ok(setCookie);
    assert.ok(setCookie.includes(`${SESSION_COOKIE_NAME}=`));
    assert.ok(setCookie.includes("Max-Age=0") || setCookie.includes("max-age=0"));

    // Verify specific database record has revokedAt set
    const tokenHash = hashToken(userARawToken);
    const session = await prisma.userSession.findUnique({
      where: { tokenHash },
    });
    assert.ok(session);
    assert.ok(session.revokedAt !== null, "User A session should be revoked in DB");

    // Verify User account was NOT deleted
    const userA = await prisma.user.findUnique({ where: { id: userAId } });
    assert.ok(userA);
    assert.strictEqual(userA.id, userAId);
  });

  await test("Verify database failures are not falsely reported as successful revocations", async () => {
    // Simulate database failure by temporarily replacing updateMany
    const originalUpdateMany = prisma.userSession.updateMany;
    try {
      prisma.userSession.updateMany = (async () => {
        throw new Error("Simulated PostgreSQL connection failure");
      }) as unknown as typeof prisma.userSession.updateMany;

      const req = new Request("http://localhost:3000/api/auth/logout", {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${userARawToken}`,
          origin: TEST_ORIGIN,
        },
      });

      const res = await logoutHandler(req);
      const data = await res.json();

      // Must return HTTP 500 and NOT report successful revocation
      assert.strictEqual(res.status, 500);
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.error, "INTERNAL_SERVER_ERROR");
      assert.strictEqual(data.revoked, undefined);
    } finally {
      prisma.userSession.updateMany = originalUpdateMany;
    }
  });

  await test("Repeated POST /logout with already-revoked token is safe and idempotent", async () => {
    const req = new Request("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${userARawToken}`,
        origin: TEST_ORIGIN,
      },
    });

    const res = await logoutHandler(req);
    const data = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.revoked, false); // Already revoked, not revoked again

    // Clears cookie again
    const setCookie = res.headers.get("set-cookie");
    assert.ok(setCookie);
    assert.ok(setCookie.includes("Max-Age=0") || setCookie.includes("max-age=0"));
  });

  await test("POST /logout without cookie succeeds safely and attaches cookie clearing header", async () => {
    const req = new Request("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: {
        origin: TEST_ORIGIN,
      },
    });

    const res = await logoutHandler(req);
    const data = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.revoked, false);

    const setCookie = res.headers.get("set-cookie");
    assert.ok(setCookie);
    assert.ok(setCookie.includes("Max-Age=0") || setCookie.includes("max-age=0"));
  });

  await test("POST /logout with invalid cookie succeeds safely without crashing", async () => {
    const req = new Request("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=malformed-random-value-12345`,
        origin: TEST_ORIGIN,
      },
    });

    const res = await logoutHandler(req);
    const data = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.revoked, false);
  });

  // ---------------------------------------------------------------------------
  // Suite 3: Session Lifecycle & Cross-User Isolation
  // ---------------------------------------------------------------------------
  console.log("\n▶ SUITE 3: Session Lifecycle & Cross-User Isolation");

  await test("Logging out User A strictly preserves User B's active session", async () => {
    // User B's session was created in Setup and has NOT been logged out
    const userBSessionReq = new Request("http://localhost:3000/api/auth/me", {
      method: "GET",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${userBRawToken}`,
      },
    });

    const res = await meHandler(userBSessionReq);
    const data = await res.json();

    // User B must remain fully authenticated
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.id, userBId);
    assert.strictEqual(data.user.email, USER_B_EMAIL);
  });

  await test("A revoked session CANNOT be reused to access GET /me", async () => {
    // User A's token was revoked in Suite 2
    const req = new Request("http://localhost:3000/api/auth/me", {
      method: "GET",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${userARawToken}`,
      },
    });

    const res = await meHandler(req);
    const data = await res.json();

    assert.strictEqual(res.status, 401);
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error, "UNAUTHENTICATED");
  });

  await test("Session belonging to User B cannot authenticate as User A", async () => {
    const req = new Request("http://localhost:3000/api/auth/me", {
      method: "GET",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${userBRawToken}`,
      },
    });

    const res = await meHandler(req);
    const data = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.user.id, userBId);
    assert.notStrictEqual(data.user.id, userAId);
    assert.strictEqual(data.user.email, USER_B_EMAIL);
    assert.notStrictEqual(data.user.email, USER_A_EMAIL);
  });

  // ---------------------------------------------------------------------------
  // Suite 4: Database Isolation & Demonstration Data Check
  // ---------------------------------------------------------------------------
  console.log("\n▶ SUITE 4: Database Isolation & Demonstration Data Check");

  await test("Clean up all temporary test accounts and verify demonstration invariants", async () => {
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

    // Verify products, rules, documents, and zero residual users
    const productsCount = await prisma.loanProduct.count();
    const rulesCount = await prisma.eligibilityRule.count();
    const docsCount = await prisma.documentRequirement.count();
    const usersCount = await prisma.user.count();
    const sessionsCount = await prisma.userSession.count();

    assert.strictEqual(productsCount, 4);
    assert.strictEqual(rulesCount, 24);
    assert.strictEqual(docsCount, 21);
    assert.strictEqual(usersCount, 0);
    assert.strictEqual(sessionsCount, 0);
  });

  console.log("\n================================================================================");
  console.log(`🏁 SUB-PHASE C TEST RESULTS: ${passedCount} Passed | ${failedCount} Failed`);
  console.log("================================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runSessionTests()
  .catch((err) => {
    console.error("Unhandled test execution error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
    process.exit(0);
  });
