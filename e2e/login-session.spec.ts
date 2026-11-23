import { test, expect } from "@playwright/test";
import {
  provisionE2EUserForTest,
  cleanupE2EUser,
  expireSessionTokenForTest,
  revokeSessionTokenForTest,
  getLatestSessionRecordForUser,
  getUserRecordFromE2EDB,
} from "./fixtures/test-environment";

test.describe("Login, Session Management & Logout Flow (E2E)", () => {
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
  // TASK 2: LOGIN BROWSER TESTS
  // =========================================================================

  test("1. loads login page with all required UI elements and functional links", async ({ page }) => {
    await page.goto("/auth/login");

    // Header & Description from AuthCard
    await expect(page.getByRole("heading", { name: "Sign in to CrediGuide" })).toBeVisible();
    await expect(
      page.getByText("Access your enterprise lending intelligence portal")
    ).toBeVisible();

    // Input fields & labels
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator("#password")).toHaveAttribute("type", "password");

    // Show/Hide password toggle button
    const toggleBtn = page.getByLabel("Show password");
    await expect(toggleBtn).toBeVisible();
    await toggleBtn.click();
    await expect(page.locator("#password")).toHaveAttribute("type", "text");
    await expect(page.getByLabel("Hide password")).toBeVisible();
    await page.getByLabel("Hide password").click();
    await expect(page.locator("#password")).toHaveAttribute("type", "password");

    // Submit button
    const submitBtn = page.locator("button[type='submit']");
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toHaveText("Sign In");

    // Navigation links in footer
    const forgotPasswordLink = page.getByRole("link", { name: "Forgot password?" });
    await expect(forgotPasswordLink).toBeVisible();
    await expect(forgotPasswordLink).toHaveAttribute("href", "/auth/forgot-password");

    const registerLink = page.getByRole("link", { name: "Register here" });
    await expect(registerLink).toBeVisible();
    await expect(registerLink).toHaveAttribute("href", "/auth/register");
  });

  test("2. successfully authenticates verified applicant and redirects to /dashboard", async ({ page }) => {
    const applicant = await provisionE2EUserForTest({
      role: "LOAN_APPLICANT",
      isEmailVerified: true,
    });
    createdTestEmails.push(applicant.email);

    await page.goto("/auth/login");
    await page.fill("#email", applicant.email);
    await page.fill("#password", applicant.password);
    await page.click("button[type='submit']");

    // Should redirect away from login to dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  });

  test("3. establishes secure HttpOnly session cookie without exposing token to JavaScript", async ({ page, context }) => {
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

    // Inspect browser cookies from Playwright context
    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => c.name === "crediguide_session");

    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.sameSite).toBe("Lax");
    expect(sessionCookie?.path).toBe("/");
    expect(sessionCookie?.value.length).toBeGreaterThan(20);

    // Verify token is NOT accessible to browser JavaScript via document.cookie
    const clientCookie = await page.evaluate(() => document.cookie);
    expect(clientCookie).not.toContain("crediguide_session");

    // Verify token is NOT stored in localStorage or sessionStorage
    const storage = await page.evaluate(() => ({
      localStorageKeys: Object.keys(localStorage),
      sessionStorageKeys: Object.keys(sessionStorage),
      localDumps: JSON.stringify(localStorage),
      sessionDumps: JSON.stringify(sessionStorage),
    }));

    expect(storage.localDumps).not.toContain(sessionCookie!.value);
    expect(storage.sessionDumps).not.toContain(sessionCookie!.value);
    expect(storage.localDumps).not.toContain(applicant.password);
  });

  test("4. rejects incorrect password with generic error message", async ({ page }) => {
    const applicant = await provisionE2EUserForTest({
      role: "LOAN_APPLICANT",
      isEmailVerified: true,
    });
    createdTestEmails.push(applicant.email);

    await page.goto("/auth/login");
    await page.fill("#email", applicant.email);
    await page.fill("#password", "WrongPassword999!Invalid");
    await page.click("button[type='submit']");

    // Must stay on login page
    await expect(page).toHaveURL(/\/auth\/login/);

    // Generic error alert must be visible (avoid Next.js route-announcer collision by targeting div[role='alert'])
    const alert = page.locator("div[role='alert']").filter({ hasText: "Invalid email or password" });
    await expect(alert).toBeVisible({ timeout: 10000 });
  });

  test("5. rejects unknown email address with identical generic error message (anti-enumeration)", async ({ page }) => {
    const unknownEmail = `unknown.${Date.now()}@cg-test-domain.org`;

    await page.goto("/auth/login");
    await page.fill("#email", unknownEmail);
    await page.fill("#password", "SomeArbitraryPassword123!");
    await page.click("button[type='submit']");

    await expect(page).toHaveURL(/\/auth\/login/);

    const alert = page.locator("div[role='alert']").filter({ hasText: "Invalid email or password" });
    await expect(alert).toBeVisible({ timeout: 10000 });
  });

  test("6. verifies unverified applicant login reflects application verification state", async ({ page }) => {
    const applicant = await provisionE2EUserForTest({
      role: "LOAN_APPLICANT",
      isEmailVerified: false,
    });
    createdTestEmails.push(applicant.email);

    // Confirm DB record has isEmailVerified = false
    const dbRecord = await getUserRecordFromE2EDB(applicant.email);
    expect(dbRecord?.isEmailVerified).toBe(false);

    await page.goto("/auth/login");
    await page.fill("#email", applicant.email);
    await page.fill("#password", applicant.password);
    await page.click("button[type='submit']");

    // Verify session response accurately returns user verification state
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });

    const meResponse = await page.evaluate(async () => {
      const res = await fetch("/api/auth/me", {
        headers: { Accept: "application/json" },
        credentials: "include",
      });
      return { status: res.status, body: await res.json() };
    });

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.success).toBe(true);
    expect(meResponse.body.user.isEmailVerified).toBe(false);
  });

  // =========================================================================
  // TASK 3: SESSION MANAGEMENT TESTS
  // =========================================================================

  test("7. session persists across page reloads and refreshes", async ({ page }) => {
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

    // Reload the page
    await page.reload();

    // Verify authenticated session is active after reload
    const meResponse = await page.evaluate(async () => {
      const res = await fetch("/api/auth/me", {
        headers: { Accept: "application/json" },
        credentials: "include",
      });
      return { status: res.status, body: await res.json() };
    });

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.success).toBe(true);
    expect(meResponse.body.user.email.toLowerCase()).toBe(applicant.email.toLowerCase());
  });

  test("8. /api/auth/me returns complete safe user profile and session metadata without secret leakage", async ({ page }) => {
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

    const profileData = await page.evaluate(async () => {
      const res = await fetch("/api/auth/me", {
        headers: { Accept: "application/json" },
        credentials: "include",
      });
      return await res.json();
    });

    expect(profileData.success).toBe(true);
    expect(profileData.user).toBeDefined();
    expect(profileData.user.id).toBe(applicant.id);
    expect(profileData.user.email.toLowerCase()).toBe(applicant.email.toLowerCase());
    expect(profileData.user.role).toBe("LOAN_APPLICANT");
    expect(profileData.user.isEmailVerified).toBe(true);
    expect(profileData.user.applicantId).toBe(applicant.applicantId);
    expect(profileData.session).toBeDefined();
    expect(profileData.session.id).toBeDefined();
    expect(profileData.session.expiresAt).toBeDefined();

    // Strict zero-leakage assertions: no sensitive hashes or counters exposed
    const userKeys = Object.keys(profileData.user);
    expect(userKeys).not.toContain("passwordHash");
    expect(userKeys).not.toContain("password");
    expect(userKeys).not.toContain("tokenHash");
    expect(userKeys).not.toContain("failedLoginAttempts");
    expect(userKeys).not.toContain("lockedUntil");
  });

  test("9. revoked database session is rejected by /api/auth/me with HTTP 401", async ({ page }) => {
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

    // Revoke the active session in crediguide_e2e_db
    await revokeSessionTokenForTest(applicant.email);

    // Call /api/auth/me from browser context
    const checkResponse = await page.evaluate(async () => {
      const res = await fetch("/api/auth/me", {
        headers: { Accept: "application/json" },
        credentials: "include",
      });
      return { status: res.status, body: await res.json() };
    });

    expect(checkResponse.status).toBe(401);
    expect(checkResponse.body.success).toBe(false);
    expect(checkResponse.body.error).toBe("UNAUTHENTICATED");
  });

  test("10. expired database session is rejected by /api/auth/me with HTTP 401", async ({ page }) => {
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

    // Expire the active session in crediguide_e2e_db (setting expiresAt = NOW() - 48h)
    await expireSessionTokenForTest(applicant.email);

    // Call /api/auth/me from browser context
    const checkResponse = await page.evaluate(async () => {
      const res = await fetch("/api/auth/me", {
        headers: { Accept: "application/json" },
        credentials: "include",
      });
      return { status: res.status, body: await res.json() };
    });

    expect(checkResponse.status).toBe(401);
    expect(checkResponse.body.success).toBe(false);
    expect(checkResponse.body.error).toBe("UNAUTHENTICATED");
  });

  test("11. unauthenticated requests to protected API routes return HTTP 401", async ({ request }) => {
    // Direct request without session cookie
    const res = await request.post("/api/admin/officers", {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: "http://localhost:3000",
      },
      data: {
        email: `officer.unauth@cg-test-domain.org`,
      },
    });

    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("UNAUTHENTICATED");
  });

  // =========================================================================
  // TASK 5: LOGOUT BROWSER TESTS
  // =========================================================================

  test("12. authenticated applicant logs out, session cookie is cleared, and session record is revoked", async ({ page, context }) => {
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

    // Trigger logout via authenticated POST /api/auth/logout with CSRF protection
    const logoutResult = await page.evaluate(async () => {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Origin: window.location.origin,
        },
        credentials: "include",
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(logoutResult.status).toBe(200);
    expect(logoutResult.body.success).toBe(true);
    expect(logoutResult.body.revoked).toBe(true);

    // Verify session record in crediguide_e2e_db has revokedAt timestamp populated
    const sessionRecord = await getLatestSessionRecordForUser(applicant.email);
    expect(sessionRecord).not.toBeNull();
    expect(sessionRecord?.revokedAt).not.toBeNull();

    // Verify cookie in browser is expired / cleared
    const cookiesAfterLogout = await context.cookies();
    const cookie = cookiesAfterLogout.find((c) => c.name === "crediguide_session");
    // Either cookie is removed or its expires is in the past
    if (cookie) {
      expect(cookie.expires <= Date.now() / 1000 || cookie.value === "").toBe(true);
    }

    // Subsequent call to /api/auth/me returns 401
    const meAfterLogout = await page.evaluate(async () => {
      const res = await fetch("/api/auth/me", {
        headers: { Accept: "application/json" },
        credentials: "include",
      });
      return { status: res.status, body: await res.json() };
    });

    expect(meAfterLogout.status).toBe(401);
    expect(meAfterLogout.body.success).toBe(false);
  });

  test("13. page refresh after logout does not restore session, and logout is idempotent", async ({ page }) => {
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

    // 1st Logout
    const logout1 = await page.evaluate(async () => {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Origin: window.location.origin,
        },
        credentials: "include",
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(logout1.status).toBe(200);
    expect(logout1.body.revoked).toBe(true);

    // 2nd Logout (Idempotence: repeated logout without valid active session succeeds safely)
    const logout2 = await page.evaluate(async () => {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Origin: window.location.origin,
        },
        credentials: "include",
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(logout2.status).toBe(200);
    expect(logout2.body.success).toBe(true);
    expect(logout2.body.revoked).toBe(false);

    // Refresh page and confirm user remains unauthenticated
    await page.reload();
    const meResponse = await page.evaluate(async () => {
      const res = await fetch("/api/auth/me", {
        headers: { Accept: "application/json" },
        credentials: "include",
      });
      return { status: res.status, body: await res.json() };
    });
    expect(meResponse.status).toBe(401);
  });

  // =========================================================================
  // TASK 2 (CONTINUED): RATE LIMITING & LOCKOUT (PLACED AT END TO PREVENT CROSS-TEST IP BUDGET EXHAUSTION)
  // =========================================================================

  test("14. five consecutive invalid password attempts trigger account lockout in database", async ({ page }) => {
    const applicant = await provisionE2EUserForTest({
      role: "LOAN_APPLICANT",
      isEmailVerified: true,
    });
    createdTestEmails.push(applicant.email);

    await page.goto("/auth/login");

    // Perform 5 failed attempts
    for (let attempt = 1; attempt <= 5; attempt++) {
      await page.fill("#email", applicant.email);
      await page.fill("#password", `WrongPass#${attempt}!`);

      const responsePromise = page.waitForResponse(
        (res) => res.url().includes("/api/auth/login") && res.request().method() === "POST"
      );
      await page.click("button[type='submit']");
      const response = await responsePromise;
      expect(response.status()).toBe(401);

      const alert = page.locator("div[role='alert']").filter({ hasText: "Invalid email or password" });
      await expect(alert).toBeVisible({ timeout: 10000 });
    }

    // Verify in crediguide_e2e_db that failedLoginAttempts >= 5 and lockedUntil is in the future
    const e2eDbUrl = process.env.E2E_DATABASE_URL!;
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: e2eDbUrl });
    try {
      const res = await pool.query(
        `SELECT "failedLoginAttempts", "lockedUntil", ("lockedUntil" > (NOW() AT TIME ZONE 'UTC')) as "isLocked"
         FROM "users"
         WHERE lower("email") = lower($1);`,
        [applicant.email.toLowerCase()]
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].failedLoginAttempts).toBeGreaterThanOrEqual(5);
      expect(res.rows[0].lockedUntil).not.toBeNull();
      expect(res.rows[0].isLocked).toBe(true);
    } finally {
      await pool.end();
    }

    // Even with the correct password, a locked account is rejected with generic error (no lock status disclosure)
    await page.fill("#email", applicant.email);
    await page.fill("#password", applicant.password);

    const lockResponsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/auth/login") && res.request().method() === "POST"
    );
    await page.click("button[type='submit']");
    const lockResponse = await lockResponsePromise;
    expect(lockResponse.status()).toBe(401);

    const alertAfterLock = page.locator("div[role='alert']").filter({ hasText: "Invalid email or password" });
    await expect(alertAfterLock).toBeVisible({ timeout: 10000 });
  });
});
