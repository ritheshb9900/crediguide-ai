import { test, expect } from "@playwright/test";
import {
  provisionE2EUserForTest,
  cleanupE2EUser,
  E2E_TEST_DOMAIN,
} from "./fixtures/test-environment";

test.describe("Role-Based Access Control (RBAC) Flow (E2E)", () => {
  const createdTestEmails: string[] = [];

  test.beforeEach(async ({ page }) => {
    // Isolate client IP per test to avoid rate-limit budget collisions across tests
    const o1 = Math.floor(Math.random() * 200) + 10;
    const o2 = Math.floor(Math.random() * 200) + 10;
    const o3 = Math.floor(Math.random() * 200) + 10;
    await page.setExtraHTTPHeaders({
      "x-forwarded-for": `10.${o1}.${o2}.${o3}`,
    });
  });

  test.afterEach(async () => {
    while (createdTestEmails.length > 0) {
      const email = createdTestEmails.pop();
      if (email) {
        await cleanupE2EUser(email).catch(() => {
          // Best effort cleanup
        });
      }
    }
  });

  // =========================================================================
  // TASK 4: ROLE-BASED ACCESS CONTROL (RBAC) BROWSER TESTS
  // =========================================================================

  test("1. LOAN_APPLICANT login redirects to applicant dashboard (/dashboard)", async ({ page }) => {
    const applicant = await provisionE2EUserForTest({
      role: "LOAN_APPLICANT",
      isEmailVerified: true,
    });
    createdTestEmails.push(applicant.email);

    await page.goto("/auth/login");
    await page.fill("#email", applicant.email);
    await page.fill("#password", applicant.password);
    await page.click("button[type='submit']");

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });

    // Verify /api/auth/me confirms LOAN_APPLICANT role
    const profile = await page.evaluate(async () => {
      const res = await fetch("/api/auth/me", {
        headers: { Accept: "application/json" },
        credentials: "include",
      });
      return await res.json();
    });

    expect(profile.success).toBe(true);
    expect(profile.user.role).toBe("LOAN_APPLICANT");
    expect(profile.user.applicantId).toBe(applicant.applicantId);
  });

  test("2. BANK_OFFICER login redirects to officer portal (/officer)", async ({ page }) => {
    const officer = await provisionE2EUserForTest({
      role: "BANK_OFFICER",
      isEmailVerified: true,
    });
    createdTestEmails.push(officer.email);

    await page.goto("/auth/login");
    await page.fill("#email", officer.email);
    await page.fill("#password", officer.password);
    await page.click("button[type='submit']");

    await expect(page).toHaveURL(/\/officer/, { timeout: 15000 });

    // Verify /api/auth/me confirms BANK_OFFICER role and contains officerProfile
    const profile = await page.evaluate(async () => {
      const res = await fetch("/api/auth/me", {
        headers: { Accept: "application/json" },
        credentials: "include",
      });
      return await res.json();
    });

    expect(profile.success).toBe(true);
    expect(profile.user.role).toBe("BANK_OFFICER");
    expect(profile.user.officerProfile).not.toBeNull();
    expect(profile.user.officerProfile.designation).toBe("Senior Underwriter");
    expect(profile.user.officerProfile.department).toBe("Retail Lending");
  });

  test("3. BANK_ADMIN login redirects to admin portal (/admin)", async ({ page }) => {
    const admin = await provisionE2EUserForTest({
      role: "BANK_ADMIN",
      isEmailVerified: true,
    });
    createdTestEmails.push(admin.email);

    await page.goto("/auth/login");
    await page.fill("#email", admin.email);
    await page.fill("#password", admin.password);
    await page.click("button[type='submit']");

    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });

    // Verify /api/auth/me confirms BANK_ADMIN role
    const profile = await page.evaluate(async () => {
      const res = await fetch("/api/auth/me", {
        headers: { Accept: "application/json" },
        credentials: "include",
      });
      return await res.json();
    });

    expect(profile.success).toBe(true);
    expect(profile.user.role).toBe("BANK_ADMIN");
  });

  test("4. LOAN_APPLICANT cannot access administrative API endpoints (HTTP 403 Forbidden)", async ({ page }) => {
    const applicant = await provisionE2EUserForTest({
      role: "LOAN_APPLICANT",
      isEmailVerified: true,
    });
    createdTestEmails.push(applicant.email);

    await page.goto("/auth/login");
    await page.fill("#email", applicant.email);
    await page.fill("#password", applicant.password);
    await page.click("button[type='submit']");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });

    // Attempt to invoke admin provisioning endpoint as LOAN_APPLICANT
    const res = await page.evaluate(async () => {
      const response = await fetch("/api/admin/officers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Origin: window.location.origin,
        },
        credentials: "include",
        body: JSON.stringify({
          email: "escalation@cg-test-domain.org",
        }),
      });
      return { status: response.status, body: await response.json() };
    });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("FORBIDDEN");
  });

  test("5. BANK_OFFICER cannot access administrative API endpoints (HTTP 403 Forbidden)", async ({ page }) => {
    const officer = await provisionE2EUserForTest({
      role: "BANK_OFFICER",
      isEmailVerified: true,
    });
    createdTestEmails.push(officer.email);

    await page.goto("/auth/login");
    await page.fill("#email", officer.email);
    await page.fill("#password", officer.password);
    await page.click("button[type='submit']");
    await expect(page).toHaveURL(/\/officer/, { timeout: 15000 });

    // Attempt to invoke admin provisioning endpoint as BANK_OFFICER
    const res = await page.evaluate(async () => {
      const response = await fetch("/api/admin/officers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Origin: window.location.origin,
        },
        credentials: "include",
        body: JSON.stringify({
          email: "escalation@cg-test-domain.org",
        }),
      });
      return { status: response.status, body: await response.json() };
    });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("FORBIDDEN");
  });

  test("6. BANK_ADMIN can provision new officer via /api/admin/officers (HTTP 201 Created)", async ({ page }) => {
    const admin = await provisionE2EUserForTest({
      role: "BANK_ADMIN",
      isEmailVerified: true,
    });
    createdTestEmails.push(admin.email);

    await page.goto("/auth/login");
    await page.fill("#email", admin.email);
    await page.fill("#password", admin.password);
    await page.click("button[type='submit']");
    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });

    const newOfficerEmail = `provisioned.officer.${Date.now()}${E2E_TEST_DOMAIN}`;
    createdTestEmails.push(newOfficerEmail);

    const empCode = `OFF-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;

    const res = await page.evaluate(async ({ targetEmail, code }) => {
      const response = await fetch("/api/admin/officers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Origin: window.location.origin,
        },
        credentials: "include",
        body: JSON.stringify({
          email: targetEmail,
          temporaryPassword: "InitialOfficerPassword123!Secure",
          firstName: "Authorized",
          lastName: "Officer",
          phone: "9876543210",
          employeeCode: code,
          department: "Retail Lending",
          designation: "Credit Officer",
          approvalLimitAmount: 500000,
          branchCode: "MUM01",
        }),
      });
      return { status: response.status, body: await response.json() };
    }, { targetEmail: newOfficerEmail, code: empCode });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.officer).toBeDefined();
    expect(res.body.officer.email.toLowerCase()).toBe(newOfficerEmail.toLowerCase());
    expect(res.body.officer.employeeCode).toBe(empCode);
  });

  test("7. LOAN_APPLICANT returnUrl cannot redirect to /admin or /officer", async ({ page }) => {
    const applicant = await provisionE2EUserForTest({
      role: "LOAN_APPLICANT",
      isEmailVerified: true,
    });
    createdTestEmails.push(applicant.email);

    // Attempt login with returnUrl pointing to admin portal
    await page.goto("/auth/login?returnUrl=%2Fadmin%2Fportal");
    await page.fill("#email", applicant.email);
    await page.fill("#password", applicant.password);
    await page.click("button[type='submit']");

    // Must be sanitized and fallback to applicant landing (/dashboard), NOT /admin
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  });

  test("8. BANK_OFFICER returnUrl cannot redirect to /admin", async ({ page }) => {
    const officer = await provisionE2EUserForTest({
      role: "BANK_OFFICER",
      isEmailVerified: true,
    });
    createdTestEmails.push(officer.email);

    // Attempt officer login with returnUrl pointing to admin
    await page.goto("/auth/login?returnUrl=%2Fadmin%2Fportal");
    await page.fill("#email", officer.email);
    await page.fill("#password", officer.password);
    await page.click("button[type='submit']");

    // Must fallback to officer landing (/officer), NOT /admin
    await expect(page).toHaveURL(/\/officer/, { timeout: 15000 });
  });

  test("9. unauthenticated requests to protected portals redirect to login with returnUrl", async ({ page }) => {
    // Navigate directly to protected admin area while unauthenticated
    await page.goto("/admin/dashboard");

    // Proxy guard intercepts and redirects to /auth/login with returnUrl
    await expect(page).toHaveURL(/\/auth\/login\?returnUrl=%2Fadmin%2Fdashboard/);

    // Navigate directly to protected officer area while unauthenticated
    await page.goto("/officer/queue");
    await expect(page).toHaveURL(/\/auth\/login\?returnUrl=%2Fofficer%2Fqueue/);
  });
});
