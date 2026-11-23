import { test, expect } from "@playwright/test";
import {
  provisionE2EUserForTest,
  cleanupE2EUser,
  fetchEmailActionLink,
  createPasswordResetTokenForTest,
  countActiveSessionsForUser,
  E2E_TEST_DOMAIN,
} from "./fixtures/test-environment";

test.describe("Password Reset & Recovery Workflows (E2E)", () => {
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
  // PART 1: FORGOT-PASSWORD WORKFLOWS
  // =========================================================================

  test("1. loads forgot-password page with all required UI elements and links", async ({ page }) => {
    await page.goto("/auth/forgot-password");

    // Header & Description
    await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
    await expect(
      page.getByText("Enter your registered email address to receive password reset instructions")
    ).toBeVisible();

    // Input fields & submit
    await expect(page.locator("#email")).toBeVisible();
    const submitBtn = page.locator("button[type='submit']");
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toHaveText("Send Reset Link");

    // Sign in navigation link
    const signInLink = page.getByRole("link", { name: "Sign in here" });
    await expect(signInLink).toBeVisible();
    await expect(signInLink).toHaveAttribute("href", "/auth/login");
  });

  test("2. valid registered applicant receives password reset instructions via dev bridge", async ({ page }) => {
    const applicant = await provisionE2EUserForTest({
      role: "LOAN_APPLICANT",
      isEmailVerified: true,
    });
    createdTestEmails.push(applicant.email);

    await page.goto("/auth/forgot-password");
    await page.fill("#email", applicant.email);
    await page.click("button[type='submit']");

    // Post-submission confirmation screen
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("paragraph").filter({ hasText: "Instructions Sent" })).toBeVisible();
    await expect(page.getByText("Security Expiration Notice")).toBeVisible();
    await expect(page.getByText("The reset link remains active for 15 minutes")).toBeVisible();
    await expect(page.locator(`strong:has-text("${applicant.email}")`)).toBeVisible();

    // Retrieve reset link from dev email bridge
    const resetUrl = await fetchEmailActionLink(applicant.email, "PASSWORD_RESET");
    expect(resetUrl).toBeDefined();
    expect(resetUrl).toContain("/auth/reset-password?token=");
  });

  test("3. unknown email produces identical confirmation screen (anti-enumeration)", async ({ page }) => {
    const unknownEmail = `nonexistent.${Date.now()}${E2E_TEST_DOMAIN}`;

    await page.goto("/auth/forgot-password");
    await page.fill("#email", unknownEmail);
    await page.click("button[type='submit']");

    // Must show the exact same confirmation view without revealing account non-existence
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("paragraph").filter({ hasText: "Instructions Sent" })).toBeVisible();
    await expect(page.getByText("Security Expiration Notice")).toBeVisible();
    await expect(page.locator(`strong:has-text("${unknownEmail}")`)).toBeVisible();
  });

  test("4. client-side validation handles empty and malformed email inputs", async ({ page }) => {
    await page.goto("/auth/forgot-password");

    // Empty submission
    await page.click("button[type='submit']");
    const emptyError = page.locator("#email-error");
    await expect(emptyError).toBeVisible();
    await expect(emptyError).toHaveText("Email address is required.");

    // Malformed email
    await page.fill("#email", "not-a-valid-email");
    await page.click("button[type='submit']");
    const formatError = page.locator("#email-error");
    await expect(formatError).toBeVisible();
    await expect(formatError).toHaveText("Please enter a valid email address.");
  });

  test("5. forgot-password API response never leaks raw token, tokenHash, or user details", async ({ page }) => {
    const applicant = await provisionE2EUserForTest({
      role: "LOAN_APPLICANT",
      isEmailVerified: true,
    });
    createdTestEmails.push(applicant.email);

    await page.goto("/auth/forgot-password");

    const apiResponse = await page.evaluate(async (email) => {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Origin: window.location.origin,
        },
        body: JSON.stringify({ email }),
      });
      return { status: res.status, body: await res.json() };
    }, applicant.email);

    expect(apiResponse.status).toBe(200);
    expect(apiResponse.body.success).toBe(true);
    expect(apiResponse.body.message).toBeDefined();

    // Strict zero-leakage assertions
    const keys = Object.keys(apiResponse.body);
    expect(keys).not.toContain("token");
    expect(keys).not.toContain("rawToken");
    expect(keys).not.toContain("tokenHash");
    expect(keys).not.toContain("actionUrl");
    expect(keys).not.toContain("user");
    expect(keys).not.toContain("userId");
  });

  // =========================================================================
  // PART 2: PASSWORD RESET WORKFLOWS
  // =========================================================================

  test("6. valid reset token displays password reset form and strength meter", async ({ page }) => {
    const applicant = await provisionE2EUserForTest({
      role: "LOAN_APPLICANT",
      isEmailVerified: true,
    });
    createdTestEmails.push(applicant.email);

    // Create a deterministic reset token in crediguide_e2e_db
    const rawToken = await createPasswordResetTokenForTest(applicant.email);
    await page.goto(`/auth/reset-password?token=${rawToken}`);

    // Form elements
    await expect(page.getByRole("heading", { name: "Set new password" })).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator("#confirmPassword")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset Password" })).toBeVisible();

    // Password strength / complexity indicator
    await expect(page.getByText("Password complexity")).toBeVisible();
  });

  test("7. successful password reset updates password and scrubs token from browser address bar", async ({ page }) => {
    const applicant = await provisionE2EUserForTest({
      role: "LOAN_APPLICANT",
      isEmailVerified: true,
    });
    createdTestEmails.push(applicant.email);

    const rawToken = await createPasswordResetTokenForTest(applicant.email);
    await page.goto(`/auth/reset-password?token=${rawToken}`);

    const newPassword = "NewSecurePassword456!Updated";
    await page.fill("#password", newPassword);
    await page.fill("#confirmPassword", newPassword);
    await page.click("button[type='submit']");

    // Success confirmation screen
    await expect(page.getByRole("heading", { name: "Password reset complete" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Password Successfully Updated")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign In with New Password" })).toBeVisible();

    // Verify token parameter was scrubbed from URL bar for security
    expect(page.url()).not.toContain("token=");
    expect(page.url()).toMatch(/\/auth\/reset-password$/);
  });

  test("8. user can authenticate with the new password, and previous password is fully rejected", async ({ page }) => {
    const applicant = await provisionE2EUserForTest({
      role: "LOAN_APPLICANT",
      isEmailVerified: true,
    });
    createdTestEmails.push(applicant.email);

    const rawToken = await createPasswordResetTokenForTest(applicant.email);
    await page.goto(`/auth/reset-password?token=${rawToken}`);

    const newPassword = "BrandNewPassword789!Valid";
    await page.fill("#password", newPassword);
    await page.fill("#confirmPassword", newPassword);
    await page.click("button[type='submit']");
    await expect(page.getByRole("heading", { name: "Password reset complete" })).toBeVisible({ timeout: 15000 });

    // 1. Attempt login with old password -> must be rejected
    await page.goto("/auth/login");
    await page.fill("#email", applicant.email);
    await page.fill("#password", applicant.password);
    await page.click("button[type='submit']");

    const alert = page.locator("div[role='alert']").filter({ hasText: "Invalid email or password" });
    await expect(alert).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/auth\/login/);

    // 2. Attempt login with new password -> must succeed and redirect to /dashboard
    await page.fill("#password", newPassword);
    await page.click("button[type='submit']");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  });

  test("9. previous active sessions are automatically revoked upon password reset", async ({ page, browser }) => {
    const applicant = await provisionE2EUserForTest({
      role: "LOAN_APPLICANT",
      isEmailVerified: true,
    });
    createdTestEmails.push(applicant.email);

    // 1. Establish an active session on Device 1 (page) by logging in
    await page.goto("/auth/login");
    await page.fill("#email", applicant.email);
    await page.fill("#password", applicant.password);
    await page.click("button[type='submit']");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });

    // Verify session count in database is at least 1
    const activeCountBefore = await countActiveSessionsForUser(applicant.email);
    expect(activeCountBefore).toBeGreaterThanOrEqual(1);

    // 2. On Device 2 (separate isolated browser context), complete a password reset
    const device2Context = await browser.newContext();
    const device2Page = await device2Context.newPage();
    try {
      const rawToken = await createPasswordResetTokenForTest(applicant.email);
      await device2Page.goto(`/auth/reset-password?token=${rawToken}`);

      const newPassword = "SessionRevocationPassword123!Safe";
      await device2Page.fill("#password", newPassword);
      await device2Page.fill("#confirmPassword", newPassword);
      await device2Page.click("button[type='submit']");
      await expect(device2Page.getByRole("heading", { name: "Password reset complete" })).toBeVisible({ timeout: 15000 });
    } finally {
      await device2Context.close();
    }

    // 3. Confirm all active sessions for this user in crediguide_e2e_db are now 0
    const activeCountAfter = await countActiveSessionsForUser(applicant.email);
    expect(activeCountAfter).toBe(0);

    // 4. Calling /api/auth/me from Device 1 with the prior session cookie returns 401 UNAUTHENTICATED
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

  test("10. direct navigation to reset-password without token shows invalid link screen", async ({ page }) => {
    // Visit reset password page directly without token query param
    await page.goto("/auth/reset-password");

    // Missing token guard view
    await expect(page.getByRole("heading", { name: "Invalid Reset Link" })).toBeVisible();
    await expect(page.getByText("Security Link Expired or Incomplete")).toBeVisible();
    const requestNewLink = page.getByRole("link", { name: "Request New Reset Link" });
    await expect(requestNewLink).toBeVisible();
    await expect(requestNewLink).toHaveAttribute("href", "/auth/forgot-password");
  });

  test("11. invalid reset token is rejected upon submission", async ({ page }) => {
    const bogusToken = "bogus_invalid_token_which_does_not_exist_in_db_12345";
    await page.goto(`/auth/reset-password?token=${bogusToken}`);

    await expect(page.getByRole("heading", { name: "Set new password" })).toBeVisible();

    const candidatePassword = "ValidCandidatePassword123!Secure";
    await page.fill("#password", candidatePassword);
    await page.fill("#confirmPassword", candidatePassword);
    await page.click("button[type='submit']");

    const alert = page.locator("div[role='alert']").filter({
      hasText: "This password reset link is invalid, expired, or has already been used",
    });
    await expect(alert).toBeVisible({ timeout: 10000 });
  });

  test("12. expired reset token is safely rejected", async ({ page }) => {
    const applicant = await provisionE2EUserForTest({
      role: "LOAN_APPLICANT",
      isEmailVerified: true,
    });
    createdTestEmails.push(applicant.email);

    // Create an expired token directly in crediguide_e2e_db (expiresAt = NOW() - 48h)
    const expiredToken = await createPasswordResetTokenForTest(applicant.email, {
      expiresAt: new Date(Date.now() - 48 * 3600 * 1000),
    });

    await page.goto(`/auth/reset-password?token=${expiredToken}`);

    const candidatePassword = "ValidCandidatePassword123!Secure";
    await page.fill("#password", candidatePassword);
    await page.fill("#confirmPassword", candidatePassword);
    await page.click("button[type='submit']");

    const alert = page.locator("div[role='alert']").filter({
      hasText: "This password reset link is invalid, expired, or has already been used",
    });
    await expect(alert).toBeVisible({ timeout: 10000 });
  });

  test("13. previously used reset token cannot be reused (single-use enforcement)", async ({ page }) => {
    const applicant = await provisionE2EUserForTest({
      role: "LOAN_APPLICANT",
      isEmailVerified: true,
    });
    createdTestEmails.push(applicant.email);

    // Create a valid token in crediguide_e2e_db
    const rawToken = await createPasswordResetTokenForTest(applicant.email);
    await page.goto(`/auth/reset-password?token=${rawToken}`);

    const firstNewPassword = "FirstNewPassword123!Secure";
    await page.fill("#password", firstNewPassword);
    await page.fill("#confirmPassword", firstNewPassword);
    await page.click("button[type='submit']");
    await expect(page.getByRole("heading", { name: "Password reset complete" })).toBeVisible({ timeout: 15000 });

    // Attempt to navigate back with the exact same token and reset again
    await page.goto(`/auth/reset-password?token=${rawToken}`);
    const secondNewPassword = "SecondNewPassword456!Secure";
    await page.fill("#password", secondNewPassword);
    await page.fill("#confirmPassword", secondNewPassword);
    await page.click("button[type='submit']");

    const alert = page.locator("div[role='alert']").filter({
      hasText: "This password reset link is invalid, expired, or has already been used",
    });
    await expect(alert).toBeVisible({ timeout: 10000 });
  });

  test("14. validates password complexity and password matching client-side", async ({ page }) => {
    const dummyToken = "arbitrary_token_string_for_validation_testing_12345";
    await page.goto(`/auth/reset-password?token=${dummyToken}`);

    // Short password (< 8 chars)
    await page.fill("#password", "short");
    await page.fill("#confirmPassword", "short");
    await page.click("button[type='submit']");

    const passError = page.locator("#password-error");
    await expect(passError).toBeVisible();
    await expect(passError).toHaveText("Password must be between 8 and 128 characters long.");

    // Mismatched confirmation password
    await page.fill("#password", "ValidComplexityPassword123!Secure");
    await page.fill("#confirmPassword", "DifferentPassword123!Mismatch");
    await page.click("button[type='submit']");

    const matchError = page.locator("#confirmPassword-error");
    await expect(matchError).toBeVisible();
    await expect(matchError).toHaveText("Passwords do not match.");
  });

  test("15. cross-user token safety: reset token for User A cannot modify User B credentials", async ({ page }) => {
    // Provision User A and User B
    const userA = await provisionE2EUserForTest({
      role: "LOAN_APPLICANT",
      isEmailVerified: true,
    });
    createdTestEmails.push(userA.email);

    const userB = await provisionE2EUserForTest({
      role: "LOAN_APPLICANT",
      isEmailVerified: true,
    });
    createdTestEmails.push(userB.email);

    // Create reset token for User A
    const resetTokenA = await createPasswordResetTokenForTest(userA.email);
    await page.goto(`/auth/reset-password?token=${resetTokenA}`);

    const newPasswordForA = "UserANewPassword123!Updated";
    await page.fill("#password", newPasswordForA);
    await page.fill("#confirmPassword", newPasswordForA);
    await page.click("button[type='submit']");
    await expect(page.getByRole("heading", { name: "Password reset complete" })).toBeVisible({ timeout: 15000 });

    // Verify User A can log in with new password
    await page.goto("/auth/login");
    await page.fill("#email", userA.email);
    await page.fill("#password", newPasswordForA);
    await page.click("button[type='submit']");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });

    // Clear session cookies so User B can test login from a clean browser state
    await page.context().clearCookies();

    // Verify User B is completely unaffected and can STILL log in with their original password
    await page.goto("/auth/login");
    await page.fill("#email", userB.email);
    await page.fill("#password", userB.password);
    await page.click("button[type='submit']");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  });

  // =========================================================================
  // PART 3: RATE LIMITING (PLACED AT END TO PRESERVE IP BUDGET FOR EARLIER TESTS)
  // =========================================================================

  test("16. dual-bucket rate limiting enforces maximum request threshold on forgot-password", async ({ page }) => {
    const applicant = await provisionE2EUserForTest({
      role: "LOAN_APPLICANT",
      isEmailVerified: true,
    });
    createdTestEmails.push(applicant.email);

    await page.goto("/auth/forgot-password");

    // Account limit is 3 requests per 15 minutes, IP limit is 5 requests per 15 minutes.
    // Repeatedly submit until rate limit alert or 429 appears.
    let rateLimited = false;
    for (let attempt = 1; attempt <= 5; attempt++) {
      await page.fill("#email", applicant.email);
      await page.click("button[type='submit']");

      const outcome = await Promise.race([
        page
          .locator("div[role='alert']")
          .filter({ hasText: "Too many password reset requests" })
          .waitFor({ state: "visible", timeout: 15000 })
          .then(() => "RATE_LIMITED" as const),
        page
          .getByRole("heading", { name: "Check your email" })
          .waitFor({ state: "visible", timeout: 15000 })
          .then(() => "DISPATCHED" as const),
      ]);

      if (outcome === "RATE_LIMITED") {
        rateLimited = true;
        break;
      }

      await page.getByRole("button", { name: "Try another email address" }).click();
    }

    expect(rateLimited).toBe(true);
  });
});
