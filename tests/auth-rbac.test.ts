import "dotenv/config";
import assert from "node:assert";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import { UserRole } from "../src/generated/prisma/enums";
import {
  hasPermission,
  requireAuth,
  requireRole,
  requireAnyRole,
  requireApplicantOwnership,
  canOfficerAccessApplication,
  ROLE_PERMISSIONS,
} from "../src/lib/auth/rbac";
import {
  createDatabaseSession,
  SESSION_COOKIE_NAME,
  validateDatabaseSession,
} from "../src/lib/auth/session";
import { hashPassword } from "../src/lib/auth/password";
import { runAdminBootstrap } from "../scripts/auth-bootstrap";
import { POST as officerProvisionHandler } from "../src/app/api/admin/officers/route";
import { POST as loginHandler } from "../src/app/api/auth/login/route";
import { proxy, sanitizeReturnUrl } from "../src/proxy";

const TEST_DOMAIN = "cg-test-domain.org";
const ADMIN_EMAIL = `test.admin.rbac@${TEST_DOMAIN}`;
const OFFICER_A_EMAIL = `test.officer.a@${TEST_DOMAIN}`;
const OFFICER_B_EMAIL = `test.officer.b@${TEST_DOMAIN}`;
const APPLICANT_A_EMAIL = `test.applicant.a@${TEST_DOMAIN}`;
const APPLICANT_B_EMAIL = `test.applicant.b@${TEST_DOMAIN}`;
const BOOTSTRAP_TEST_EMAIL = `test.bootstrap.admin@${TEST_DOMAIN}`;

const TEST_PASSWORD = "StrongRBACPassword@2026!";
const OFFICER_TEMP_PASSWORD = "OfficerTempPass#2026!";
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

// Cleanup helper to purge only test data
async function cleanupTestData() {
  const testUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { endsWith: `@${TEST_DOMAIN}` } },
        { email: "admin@crediguide.internal" },
      ],
    },
    select: { id: true },
  });

  const testUserIds = testUsers.map((u) => u.id);

  if (testUserIds.length > 0) {
    // Delete any test loan applications created for tests
    await prisma.loanApplication.deleteMany({
      where: {
        OR: [
          { assignedOfficerId: { in: testUserIds } },
          { applicationNumber: { startsWith: "CG-APP-TEST-" } },
        ],
      },
    });

    await prisma.userSession.deleteMany({
      where: { userId: { in: testUserIds } },
    });
    await prisma.officerProfile.deleteMany({
      where: {
        OR: [
          { userId: { in: testUserIds } },
          { employeeCode: { startsWith: "TEST-EMP-" } },
        ],
      },
    });
    await prisma.applicant.deleteMany({
      where: { userId: { in: testUserIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: testUserIds } },
    });
  }

  // Also clean up any test applications by number prefix
  await prisma.loanApplication.deleteMany({
    where: { applicationNumber: { startsWith: "CG-APP-TEST-" } },
  });
  // Clean up any stray test applicants by email domain
  await prisma.applicant.deleteMany({
    where: { email: { endsWith: `@${TEST_DOMAIN}` } },
  });
}

async function runRBACTestSuite() {
  console.log("================================================================================");
  console.log("🧪 CrediGuide AI — Phase 4 Sub-Phase D: RBAC, Bootstrap & Proxy Test Suite");
  console.log("================================================================================\n");

  await cleanupTestData();

  try {
    // -------------------------------------------------------------------------
    // GROUP 1: Role Permissions Matrix & Evaluation
    // -------------------------------------------------------------------------
    console.log("▶ GROUP 1: Role Permissions Matrix & Evaluation");

    await test("hasPermission returns true for authorized permissions across all roles", () => {
      assert.strictEqual(hasPermission(UserRole.LOAN_APPLICANT, "APPLICANT_READ_SELF"), true);
      assert.strictEqual(hasPermission(UserRole.LOAN_APPLICANT, "APPLICANT_SUBMIT_APPLICATION"), true);
      assert.strictEqual(hasPermission(UserRole.BANK_OFFICER, "OFFICER_REVIEW_APPLICATION"), true);
      assert.strictEqual(hasPermission(UserRole.BANK_OFFICER, "OFFICER_VERIFY_DOCUMENT"), true);
      assert.strictEqual(hasPermission(UserRole.BANK_ADMIN, "ADMIN_PROVISION_OFFICER"), true);
      assert.strictEqual(hasPermission(UserRole.BANK_ADMIN, "ADMIN_MANAGE_POLICY"), true);
      assert.strictEqual(hasPermission(UserRole.BANK_ADMIN, "ADMIN_VIEW_ALL"), true);
    });

    await test("LOAN_APPLICANT possesses zero underwriting or administrative permissions", () => {
      assert.strictEqual(hasPermission(UserRole.LOAN_APPLICANT, "OFFICER_REVIEW_APPLICATION"), false);
      assert.strictEqual(hasPermission(UserRole.LOAN_APPLICANT, "ADMIN_PROVISION_OFFICER"), false);
      assert.strictEqual(hasPermission(UserRole.LOAN_APPLICANT, "ADMIN_VIEW_ALL"), false);
    });

    await test("ROLE_PERMISSIONS matrix contains expected granular policy assignments", () => {
      assert.strictEqual(ROLE_PERMISSIONS[UserRole.LOAN_APPLICANT].includes("APPLICANT_READ_SELF"), true);
      assert.strictEqual(ROLE_PERMISSIONS[UserRole.BANK_OFFICER].includes("OFFICER_REVIEW_APPLICATION"), true);
      assert.strictEqual(ROLE_PERMISSIONS[UserRole.BANK_ADMIN].includes("ADMIN_PROVISION_OFFICER"), true);
    });

    await test("BANK_OFFICER possesses zero administrative permissions", () => {
      assert.strictEqual(hasPermission(UserRole.BANK_OFFICER, "ADMIN_PROVISION_OFFICER"), false);
      assert.strictEqual(hasPermission(UserRole.BANK_OFFICER, "ADMIN_MANAGE_POLICY"), false);
      assert.strictEqual(hasPermission(UserRole.BANK_OFFICER, "ADMIN_AUDIT_LOGS"), false);
    });

    // -------------------------------------------------------------------------
    // Setup test accounts for subsequent groups
    // -------------------------------------------------------------------------
    const hash = await hashPassword(TEST_PASSWORD);

    // 1. Admin user
    const adminUser = await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash: hash,
        role: UserRole.BANK_ADMIN,
        firstName: "Super",
        lastName: "Admin",
        isEmailVerified: true,
        isActive: true,
      },
    });

    // 2. Officer A & Officer B
    const officerAUser = await prisma.user.create({
      data: {
        email: OFFICER_A_EMAIL,
        passwordHash: hash,
        role: UserRole.BANK_OFFICER,
        firstName: "Officer",
        lastName: "Alpha",
        isEmailVerified: true,
        isActive: true,
        officerProfile: {
          create: {
            employeeCode: "TEST-EMP-001",
            department: "Retail Lending",
            designation: "Credit Underwriter",
            approvalLimitAmount: 500000,
          },
        },
      },
    });

    const officerBUser = await prisma.user.create({
      data: {
        email: OFFICER_B_EMAIL,
        passwordHash: hash,
        role: UserRole.BANK_OFFICER,
        firstName: "Officer",
        lastName: "Beta",
        isEmailVerified: true,
        isActive: true,
        officerProfile: {
          create: {
            employeeCode: "TEST-EMP-002",
            department: "Risk Management",
            designation: "Senior Risk Officer",
            approvalLimitAmount: 1000000,
          },
        },
      },
    });

    // 3. Applicant A & Applicant B
    const applicantAUser = await prisma.user.create({
      data: {
        email: APPLICANT_A_EMAIL,
        passwordHash: hash,
        role: UserRole.LOAN_APPLICANT,
        firstName: "Applicant",
        lastName: "One",
        isEmailVerified: true,
        isActive: true,
        applicantProfile: {
          create: {
            email: APPLICANT_A_EMAIL,
            firstName: "Applicant",
            lastName: "One",
            monthlyNetIncome: 75000,
            employmentType: "SALARIED",
          },
        },
      },
      include: { applicantProfile: true },
    });

    const applicantBUser = await prisma.user.create({
      data: {
        email: APPLICANT_B_EMAIL,
        passwordHash: hash,
        role: UserRole.LOAN_APPLICANT,
        firstName: "Applicant",
        lastName: "Two",
        isEmailVerified: true,
        isActive: true,
        applicantProfile: {
          create: {
            email: APPLICANT_B_EMAIL,
            firstName: "Applicant",
            lastName: "Two",
            monthlyNetIncome: 90000,
            employmentType: "SALARIED",
          },
        },
      },
      include: { applicantProfile: true },
    });

    const applicantAId = applicantAUser.applicantProfile!.id;
    const applicantBId = applicantBUser.applicantProfile!.id;

    // Create active sessions for each test user
    const adminSession = await createDatabaseSession(adminUser.id);
    const officerASession = await createDatabaseSession(officerAUser.id);
    const officerBSession = await createDatabaseSession(officerBUser.id);
    const applicantASession = await createDatabaseSession(applicantAUser.id);
    const applicantBSession = await createDatabaseSession(applicantBUser.id);

    // Validate sessions to obtain session contexts
    const adminCtxRes = await validateDatabaseSession(adminSession.rawToken);
    assert.strictEqual(adminCtxRes.isValid, true);
    const adminCtx = (adminCtxRes as { isValid: true; context: typeof adminCtxRes extends { isValid: true; context: infer C } ? C : never }).context;

    const officerACtxRes = await validateDatabaseSession(officerASession.rawToken);
    assert.strictEqual(officerACtxRes.isValid, true);
    const officerACtx = (officerACtxRes as { isValid: true; context: typeof officerACtxRes extends { isValid: true; context: infer C } ? C : never }).context;

    const officerBCtxRes = await validateDatabaseSession(officerBSession.rawToken);
    assert.strictEqual(officerBCtxRes.isValid, true);
    const officerBCtx = (officerBCtxRes as { isValid: true; context: typeof officerBCtxRes extends { isValid: true; context: infer C } ? C : never }).context;

    const applicantACtxRes = await validateDatabaseSession(applicantASession.rawToken);
    assert.strictEqual(applicantACtxRes.isValid, true);
    const applicantACtx = (applicantACtxRes as { isValid: true; context: typeof applicantACtxRes extends { isValid: true; context: infer C } ? C : never }).context;

    const applicantBCtxRes = await validateDatabaseSession(applicantBSession.rawToken);
    assert.strictEqual(applicantBCtxRes.isValid, true);
    const applicantBCtx = (applicantBCtxRes as { isValid: true; context: typeof applicantBCtxRes extends { isValid: true; context: infer C } ? C : never }).context;

    // -------------------------------------------------------------------------
    // GROUP 2: Applicant Ownership & Strict IDOR Defense
    // -------------------------------------------------------------------------
    console.log("\n▶ GROUP 2: Applicant Ownership & Strict IDOR Protection");

    await test("Applicant A can access their own applicant record", () => {
      const allowed = requireApplicantOwnership(applicantACtx, applicantAId);
      assert.strictEqual(allowed, true);
    });

    await test("Applicant A cannot access Applicant B's record (Horizontal IDOR rejected)", () => {
      const allowed = requireApplicantOwnership(applicantACtx, applicantBId);
      assert.strictEqual(allowed, false);
    });

    await test("Applicant B can access their own applicant record", () => {
      const allowed = requireApplicantOwnership(applicantBCtx, applicantBId);
      assert.strictEqual(allowed, true);
    });

    await test("requireApplicantOwnership returns false for BANK_OFFICER (No generic staff bypass)", () => {
      const allowedA = requireApplicantOwnership(officerACtx, applicantAId);
      const allowedB = requireApplicantOwnership(officerACtx, applicantBId);
      assert.strictEqual(allowedA, false);
      assert.strictEqual(allowedB, false);
    });

    await test("requireApplicantOwnership returns false for BANK_ADMIN (No generic admin bypass)", () => {
      const allowed = requireApplicantOwnership(adminCtx, applicantAId);
      assert.strictEqual(allowed, false);
    });

    // -------------------------------------------------------------------------
    // GROUP 3: Officer Operational Assignment Isolation
    // -------------------------------------------------------------------------
    console.log("\n▶ GROUP 3: Officer Operational Assignment Isolation");

    // Retrieve an existing seeded product
    const product = await prisma.loanProduct.findFirst({ select: { id: true } });
    assert.ok(product, "At least one product must exist");

    // Create a test loan application assigned to Officer A
    const testApp = await prisma.loanApplication.create({
      data: {
        applicationNumber: "CG-APP-TEST-OFFICER-01",
        applicantId: applicantAId,
        productId: product.id,
        assignedOfficerId: officerAUser.id,
        requestedAmount: 250000,
        requestedTenureMonths: 36,
      },
    });

    await test("Assigned Officer A can access assigned application", async () => {
      const canAccess = await canOfficerAccessApplication(officerACtx, testApp.id);
      assert.strictEqual(canAccess, true);
    });

    await test("Unassigned Officer B CANNOT access application assigned to Officer A", async () => {
      const canAccess = await canOfficerAccessApplication(officerBCtx, testApp.id);
      assert.strictEqual(canAccess, false);
    });

    await test("canOfficerAccessApplication returns false for LOAN_APPLICANT or BANK_ADMIN", async () => {
      const applicantAccess = await canOfficerAccessApplication(applicantACtx, testApp.id);
      const adminAccess = await canOfficerAccessApplication(adminCtx, testApp.id);
      assert.strictEqual(applicantAccess, false);
      assert.strictEqual(adminAccess, false);
    });

    await test("canOfficerAccessApplication returns false for non-existent application", async () => {
      const nonExistent = await canOfficerAccessApplication(officerACtx, "00000000-0000-0000-0000-000000000000");
      assert.strictEqual(nonExistent, false);
    });

    // -------------------------------------------------------------------------
    // GROUP 4: Reusable Route Authorization Helpers
    // -------------------------------------------------------------------------
    console.log("\n▶ GROUP 4: Reusable Authorization Helpers (requireAuth, requireRole, requireAnyRole)");

    await test("requireAuth returns 401 when no session cookie is provided", async () => {
      const req = new Request("http://localhost:3000/api/protected");
      const res = await requireAuth(req);
      assert.strictEqual(res.authorized, false);
      if (!res.authorized) {
        assert.strictEqual(res.response.status, 401);
      }
    });

    await test("requireAuth returns 401 when session cookie is revoked", async () => {
      const revoked = await createDatabaseSession(applicantAUser.id);
      await prisma.userSession.update({
        where: { id: revoked.session.id },
        data: { revokedAt: new Date() },
      });
      const req = new Request("http://localhost:3000/api/protected", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${revoked.rawToken}` },
      });
      const res = await requireAuth(req);
      assert.strictEqual(res.authorized, false);
      if (!res.authorized) {
        assert.strictEqual(res.response.status, 401);
      }
    });

    await test("requireAuth succeeds with valid active session context", async () => {
      const req = new Request("http://localhost:3000/api/protected", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${applicantASession.rawToken}` },
      });
      const res = await requireAuth(req);
      assert.strictEqual(res.authorized, true);
      if (res.authorized) {
        assert.strictEqual(res.context.user.email, APPLICANT_A_EMAIL);
      }
    });

    await test("requireRole permits user with exact required role", async () => {
      const req = new Request("http://localhost:3000/api/admin/resource", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminSession.rawToken}` },
      });
      const res = await requireRole(req, UserRole.BANK_ADMIN);
      assert.strictEqual(res.authorized, true);
    });

    await test("requireRole rejects user with 403 Forbidden on role mismatch", async () => {
      const req = new Request("http://localhost:3000/api/admin/resource", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${applicantASession.rawToken}` },
      });
      const res = await requireRole(req, UserRole.BANK_ADMIN);
      assert.strictEqual(res.authorized, false);
      if (!res.authorized) {
        assert.strictEqual(res.response.status, 403);
      }
    });

    await test("requireAnyRole permits member role and rejects non-member role with 403", async () => {
      const reqOfficer = new Request("http://localhost:3000/api/staff", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${officerASession.rawToken}` },
      });
      const resOfficer = await requireAnyRole(reqOfficer, [UserRole.BANK_OFFICER, UserRole.BANK_ADMIN]);
      assert.strictEqual(resOfficer.authorized, true);

      const reqApplicant = new Request("http://localhost:3000/api/staff", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${applicantASession.rawToken}` },
      });
      const resApplicant = await requireAnyRole(reqApplicant, [UserRole.BANK_OFFICER, UserRole.BANK_ADMIN]);
      assert.strictEqual(resApplicant.authorized, false);
      if (!resApplicant.authorized) {
        assert.strictEqual(resApplicant.response.status, 403);
      }
    });

    // -------------------------------------------------------------------------
    // GROUP 5: Initial Admin Bootstrap & Advisory Lock Concurrency
    // -------------------------------------------------------------------------
    console.log("\n▶ GROUP 5: Initial Admin Bootstrap & Advisory Lock Concurrency");

    await test("Bootstrap fails closed if ENABLE_ADMIN_BOOTSTRAP !== true", async () => {
      await assert.rejects(
        async () => {
          await runAdminBootstrap({
            email: BOOTSTRAP_TEST_EMAIL,
            password: TEST_PASSWORD,
            enableOverride: false,
          });
        },
        /BOOTSTRAP_DISABLED/
      );
    });

    await test("Bootstrap fails closed if password does not meet OWASP complexity", async () => {
      await assert.rejects(
        async () => {
          await runAdminBootstrap({
            email: BOOTSTRAP_TEST_EMAIL,
            password: "weak",
            enableOverride: true,
          });
        },
        /BOOTSTRAP_INVALID_PASSWORD/
      );
    });

    await test("Bootstrap refuses execution if email already belongs to an existing user", async () => {
      await assert.rejects(
        async () => {
          await runAdminBootstrap({
            email: APPLICANT_A_EMAIL, // already belongs to Applicant A
            password: TEST_PASSWORD,
            enableOverride: true,
          });
        },
        /EMAIL_CONFLICT/
      );
    });

    await test("Bootstrap fails closed if any BANK_ADMIN already exists in system", async () => {
      // adminUser already exists in PostgreSQL
      await assert.rejects(
        async () => {
          await runAdminBootstrap({
            email: BOOTSTRAP_TEST_EMAIL,
            password: TEST_PASSWORD,
            enableOverride: true,
          });
        },
        /ADMIN_ALREADY_EXISTS/
      );
    });

    await test("Advisory Lock Concurrency: Two simultaneous bootstrap attempts produce exactly ONE admin", async () => {
      // Temporarily remove existing adminUser to test fresh bootstrap
      await prisma.userSession.deleteMany({ where: { userId: adminUser.id } });
      await prisma.user.delete({ where: { id: adminUser.id } });

      // Run two bootstrap attempts concurrently using Promise.allSettled
      const [res1, res2] = await Promise.allSettled([
        runAdminBootstrap({
          email: BOOTSTRAP_TEST_EMAIL,
          password: TEST_PASSWORD,
          enableOverride: true,
        }),
        runAdminBootstrap({
          email: `test.bootstrap.admin2@${TEST_DOMAIN}`,
          password: TEST_PASSWORD,
          enableOverride: true,
        }),
      ]);

      // Exactly one should succeed, and one should fail with ADMIN_ALREADY_EXISTS
      const successes = [res1, res2].filter((r) => r.status === "fulfilled");
      const rejections = [res1, res2].filter((r) => r.status === "rejected");

      assert.strictEqual(successes.length, 1, "Exactly one concurrent bootstrap must succeed");
      assert.strictEqual(rejections.length, 1, "Exactly one concurrent bootstrap must be rejected");

      const rejectionReason = (rejections[0] as PromiseRejectedResult).reason;
      assert.ok(
        /ADMIN_ALREADY_EXISTS/.test(rejectionReason.message),
        `Rejection reason must be ADMIN_ALREADY_EXISTS, got: ${rejectionReason.message}`
      );

      // Verify in database: exactly 1 BANK_ADMIN exists in the whole table
      const adminCount = await prisma.user.count({
        where: { role: UserRole.BANK_ADMIN },
      });
      assert.strictEqual(adminCount, 1, "Database must contain exactly 1 BANK_ADMIN");
    });

    // Re-create standard admin session for subsequent tests using the created bootstrap admin
    const currentAdmin = await prisma.user.findFirstOrThrow({
      where: { role: UserRole.BANK_ADMIN },
    });
    const currentAdminSession = await createDatabaseSession(currentAdmin.id);

    // -------------------------------------------------------------------------
    // GROUP 6: Bank Officer Provisioning API (POST /api/admin/officers)
    // -------------------------------------------------------------------------
    console.log("\n▶ GROUP 6: Bank Officer Provisioning API");

    await test("POST /api/admin/officers rejects unauthenticated request with 401", async () => {
      const req = new Request("http://localhost:3000/api/admin/officers", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: TEST_ORIGIN },
        body: JSON.stringify({}),
      });
      const res = await officerProvisionHandler(req);
      assert.strictEqual(res.status, 401);
    });

    await test("POST /api/admin/officers rejects LOAN_APPLICANT with 403 Forbidden", async () => {
      const req = new Request("http://localhost:3000/api/admin/officers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${applicantASession.rawToken}`,
          origin: TEST_ORIGIN,
        },
        body: JSON.stringify({}),
      });
      const res = await officerProvisionHandler(req);
      assert.strictEqual(res.status, 403);
    });

    await test("POST /api/admin/officers rejects BANK_OFFICER with 403 Forbidden", async () => {
      const req = new Request("http://localhost:3000/api/admin/officers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${officerASession.rawToken}`,
          origin: TEST_ORIGIN,
        },
        body: JSON.stringify({}),
      });
      const res = await officerProvisionHandler(req);
      assert.strictEqual(res.status, 403);
    });

    await test("POST /api/admin/officers rejects invalid payload with 400 Bad Request", async () => {
      const req = new Request("http://localhost:3000/api/admin/officers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${currentAdminSession.rawToken}`,
          origin: TEST_ORIGIN,
        },
        body: JSON.stringify({
          firstName: "John",
          // missing lastName, email, etc.
        }),
      });
      const res = await officerProvisionHandler(req);
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error, "VALIDATION_ERROR");
    });

    await test("POST /api/admin/officers rejects duplicate email with 409 Conflict", async () => {
      const req = new Request("http://localhost:3000/api/admin/officers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${currentAdminSession.rawToken}`,
          origin: TEST_ORIGIN,
        },
        body: JSON.stringify({
          firstName: "Duplicate",
          lastName: "Officer",
          email: OFFICER_A_EMAIL, // already exists
          employeeCode: "TEST-EMP-999",
          department: "Retail Lending",
          designation: "Officer",
          approvalLimitAmount: 500000,
          temporaryPassword: OFFICER_TEMP_PASSWORD,
        }),
      });
      const res = await officerProvisionHandler(req);
      assert.strictEqual(res.status, 409);
      const data = await res.json();
      assert.strictEqual(data.error, "EMAIL_ALREADY_EXISTS");
    });

    await test("POST /api/admin/officers rejects duplicate employeeCode with 409 Conflict", async () => {
      const req = new Request("http://localhost:3000/api/admin/officers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${currentAdminSession.rawToken}`,
          origin: TEST_ORIGIN,
        },
        body: JSON.stringify({
          firstName: "Duplicate",
          lastName: "Officer",
          email: `test.unique.officer@${TEST_DOMAIN}`,
          employeeCode: "TEST-EMP-001", // already used by Officer A
          department: "Retail Lending",
          designation: "Officer",
          approvalLimitAmount: 500000,
          temporaryPassword: OFFICER_TEMP_PASSWORD,
        }),
      });
      const res = await officerProvisionHandler(req);
      assert.strictEqual(res.status, 409);
      const data = await res.json();
      assert.strictEqual(data.error, "EMPLOYEE_CODE_ALREADY_EXISTS");
    });

    const NEW_OFFICER_EMAIL = `test.provisioned.officer@${TEST_DOMAIN}`;
    const NEW_OFFICER_EMP_CODE = "TEST-EMP-777";

    await test("POST /api/admin/officers successfully provisions officer with isEmailVerified: false", async () => {
      const req = new Request("http://localhost:3000/api/admin/officers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${currentAdminSession.rawToken}`,
          origin: TEST_ORIGIN,
        },
        body: JSON.stringify({
          firstName: "Provisioned",
          lastName: "Officer",
          email: NEW_OFFICER_EMAIL,
          employeeCode: NEW_OFFICER_EMP_CODE,
          department: "Underwriting",
          branchCode: "MUMBAI-01",
          designation: "Senior Credit Underwriter",
          approvalLimitAmount: 750000,
          temporaryPassword: OFFICER_TEMP_PASSWORD,
        }),
      });
      const res = await officerProvisionHandler(req);
      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.officer.email, NEW_OFFICER_EMAIL);
      assert.strictEqual(data.officer.employeeCode, NEW_OFFICER_EMP_CODE);
      assert.strictEqual(data.officer.isEmailVerified, false); // MANDATORY: remains unverified

      // Check database
      const dbOfficer = await prisma.user.findUnique({
        where: { email: NEW_OFFICER_EMAIL },
        include: { officerProfile: true },
      });
      assert.ok(dbOfficer, "User must exist in database");
      assert.strictEqual(dbOfficer.role, UserRole.BANK_OFFICER);
      assert.strictEqual(dbOfficer.isEmailVerified, false);
      assert.strictEqual(dbOfficer.officerProfile?.employeeCode, NEW_OFFICER_EMP_CODE);

      // Verify zero password/hash in API response
      assert.strictEqual((data as Record<string, unknown>).passwordHash, undefined);
      assert.strictEqual((data as Record<string, unknown>).temporaryPassword, undefined);
    });

    await test("Newly provisioned officer can log in with temporary password", async () => {
      const loginReq = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: TEST_ORIGIN },
        body: JSON.stringify({
          email: NEW_OFFICER_EMAIL,
          password: OFFICER_TEMP_PASSWORD,
        }),
      });
      const loginRes = await loginHandler(loginReq);
      assert.strictEqual(loginRes.status, 200);
      const data = await loginRes.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.user.role, UserRole.BANK_OFFICER);
      assert.strictEqual(data.user.isEmailVerified, false);
    });

    // -------------------------------------------------------------------------
    // GROUP 7: Next.js 16 Proxy Routing Guard & Open Redirect Protection
    // -------------------------------------------------------------------------
    console.log("\n▶ GROUP 7: Next.js 16 Proxy Early Routing Guard");

    await test("Proxy redirects unauthenticated request for protected UI route to login with safe returnUrl", () => {
      const req = new NextRequest("http://localhost:3000/admin/dashboard");
      const res = proxy(req);
      assert.strictEqual(res.status, 307); // NextResponse.redirect defaults to 307
      const location = res.headers.get("location");
      assert.ok(location?.includes("/auth/login?returnUrl=%2Fadmin%2Fdashboard"));
    });

    await test("Proxy returns 401 for unauthenticated request targeting protected API route", async () => {
      const req = new NextRequest("http://localhost:3000/api/admin/officers");
      const res = proxy(req);
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.error, "UNAUTHENTICATED");
    });

    await test("Proxy passes through request when session cookie is present", () => {
      const req = new NextRequest("http://localhost:3000/admin/dashboard", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=some_token_value` },
      });
      const res = proxy(req);
      // NextResponse.next() produces 200 status with x-middleware-next header
      assert.strictEqual(res.status, 200);
    });

    await test("Forged/expired cookie passes Proxy but is authoritatively rejected downstream by requireAuth", async () => {
      const forgedToken = "completely_fake_forged_session_token_1234567890";

      // 1. Proxy check: allows through because a cookie is present
      const proxyReq = new NextRequest("http://localhost:3000/api/admin/officers", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${forgedToken}` },
      });
      const proxyRes = proxy(proxyReq);
      assert.strictEqual(proxyRes.status, 200); // Passed through early routing guard

      // 2. Downstream check: requireAuth authoritatively rejects with 401
      const downstreamReq = new Request("http://localhost:3000/api/admin/officers", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${forgedToken}` },
      });
      const authResult = await requireAuth(downstreamReq);
      assert.strictEqual(authResult.authorized, false);
      if (!authResult.authorized) {
        assert.strictEqual(authResult.response.status, 401);
      }
    });

    await test("sanitizeReturnUrl neutralizes open redirect attack vectors", () => {
      // Safe paths allowed
      assert.strictEqual(sanitizeReturnUrl("/dashboard"), "/dashboard");
      assert.strictEqual(sanitizeReturnUrl("/admin/users?sort=asc"), "/admin/users?sort=asc");

      // Protocol-relative attacks -> sanitized to "/"
      assert.strictEqual(sanitizeReturnUrl("//evil.com"), "/");
      assert.strictEqual(sanitizeReturnUrl("//attacker.com/leak"), "/");

      // Backslash scheme tricks -> sanitized to "/"
      assert.strictEqual(sanitizeReturnUrl("/\\evil.com"), "/");

      // Absolute URLs / External schemes -> sanitized to "/"
      assert.strictEqual(sanitizeReturnUrl("https://evil.com"), "/");
      assert.strictEqual(sanitizeReturnUrl("http://evil.com"), "/");
      assert.strictEqual(sanitizeReturnUrl("javascript:alert(1)"), "/");
      assert.strictEqual(sanitizeReturnUrl("data:text/html,..."), "/");

      // Null, undefined, empty -> sanitized to "/"
      assert.strictEqual(sanitizeReturnUrl(null), "/");
      assert.strictEqual(sanitizeReturnUrl(""), "/");
      assert.strictEqual(sanitizeReturnUrl("   "), "/");
    });

    // -------------------------------------------------------------------------
    // GROUP 8: Database Invariant & Phase 3 Protection
    // -------------------------------------------------------------------------
    console.log("\n▶ GROUP 8: Database Invariant & Phase 3 Protection");

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

      // All 14 demo applicants must still have userId = null
      for (const demo of demoApplicants) {
        assert.strictEqual(demo.userId, null, `Demo applicant ${demo.id} userId must remain null`);
      }
    });

  } finally {
    // Clean up all test users and test entities
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

void runRBACTestSuite();
