import { test, expect, Page } from "@playwright/test";
import {
  generateTestApplicantCredentials,
  fetchEmailActionLink,
  cleanupE2EUser,
  expireVerificationTokenForTest,
  getUserRecordFromE2EDB,
  TestApplicantCredentials,
} from "./fixtures/test-environment";

test.describe("Email Verification and Resend Workflows (E2E)", () => {
  const createdTestEmails: string[] = [];

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

  // Helper to register an applicant via UI
  async function registerApplicantViaUI(page: Page, applicant: TestApplicantCredentials) {
    await page.goto("/auth/register");
    await page.fill("#firstName", applicant.firstName);
    await page.fill("#lastName", applicant.lastName);
    await page.fill("#email", applicant.email);
    await page.fill("#phone", applicant.phone);
    await page.fill("#password", applicant.password);
    await page.fill("#confirmPassword", applicant.password);
    await page.click("button[type='submit']");
    await expect(
      page.getByRole("heading", { name: "Registration Successful" })
    ).toBeVisible({ timeout: 15000 });
  }

  // ===========================================================================
  // TASK 3: EMAIL VERIFICATION BROWSER TESTS
  // ===========================================================================

  test("1. newly registered applicant receives verification link via dev bridge", async ({ page }) => {
    const applicant = generateTestApplicantCredentials("ver-link");
    createdTestEmails.push(applicant.email);

    await registerApplicantViaUI(page, applicant);

    // Retrieve verification link from sink via dev bridge
    const link = await fetchEmailActionLink(applicant.email, "EMAIL_VERIFICATION");
    expect(link).toBeDefined();
    expect(link).toContain("/auth/verify-email?token=");
  });

  test("2. opening verification link successfully verifies the applicant", async ({ page }) => {
    const applicant = generateTestApplicantCredentials("ver-success");
    createdTestEmails.push(applicant.email);

    await registerApplicantViaUI(page, applicant);

    const verificationUrl = await fetchEmailActionLink(applicant.email, "EMAIL_VERIFICATION");
    const parsed = new URL(verificationUrl);

    // Navigate to verification URL
    await page.goto(parsed.pathname + parsed.search);

    // Verify success state
    await expect(
      page.getByRole("heading", { name: "Email Verified Successfully" })
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Verification Successful")).toBeVisible();
    await expect(
      page.getByText("Your applicant email address has been confirmed.")
    ).toBeVisible();

    // Verify database record has isEmailVerified = true
    const dbUser = await getUserRecordFromE2EDB(applicant.email);
    expect(dbUser?.isEmailVerified).toBe(true);
  });

  test("3. verified applicant can proceed to sign in and authenticate", async ({ page }) => {
    const applicant = generateTestApplicantCredentials("ver-login");
    createdTestEmails.push(applicant.email);

    await registerApplicantViaUI(page, applicant);

    const verificationUrl = await fetchEmailActionLink(applicant.email, "EMAIL_VERIFICATION");
    const parsed = new URL(verificationUrl);
    await page.goto(parsed.pathname + parsed.search);

    await expect(
      page.getByRole("heading", { name: "Email Verified Successfully" })
    ).toBeVisible({ timeout: 15000 });

    // Click Proceed to Sign In CTA
    await page.getByRole("link", { name: "Proceed to Sign In" }).click();
    await expect(page).toHaveURL(/\/auth\/login/);

    // Log in with verified credentials
    await page.fill("#email", applicant.email);
    await page.fill("#password", applicant.password);
    await page.click("button[type='submit']");

    // Successfully navigates away from /auth/login
    await expect(page).not.toHaveURL(/\/auth\/login/, { timeout: 15000 });
  });

  test("4. invalid verification token is safely rejected", async ({ page }) => {
    // Navigate with non-existent token (min 16 chars)
    await page.goto("/auth/verify-email?token=invalid_dummy_token_0123456789abcdef");

    // UI displays link inactive / expired view
    await expect(
      page.getByRole("heading", { name: "Verification Link Expired or Used" })
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Link Already Consumed or Expired")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Request New Verification Link" })
    ).toBeVisible();
  });

  test("5. expired verification token is safely rejected", async ({ page }) => {
    const applicant = generateTestApplicantCredentials("ver-expired");
    createdTestEmails.push(applicant.email);

    await registerApplicantViaUI(page, applicant);

    const verificationUrl = await fetchEmailActionLink(applicant.email, "EMAIL_VERIFICATION");
    const parsed = new URL(verificationUrl);

    // Expire the token directly in crediguide_e2e_db (48 hours in past)
    await expireVerificationTokenForTest(applicant.email);

    // Navigate to the verification URL with the now-expired token
    await page.goto(parsed.pathname + parsed.search);

    // UI displays expired state
    await expect(
      page.getByRole("heading", { name: "Verification Link Expired or Used" })
    ).toBeVisible({ timeout: 15000 });

    // Database record remains unverified
    const dbUser = await getUserRecordFromE2EDB(applicant.email);
    expect(dbUser?.isEmailVerified).toBe(false);
  });

  test("6. previously used token cannot verify the account again", async ({ page }) => {
    const applicant = generateTestApplicantCredentials("ver-reused");
    createdTestEmails.push(applicant.email);

    await registerApplicantViaUI(page, applicant);

    const verificationUrl = await fetchEmailActionLink(applicant.email, "EMAIL_VERIFICATION");
    const parsed = new URL(verificationUrl);

    // 1st consumption: succeeds
    await page.goto(parsed.pathname + parsed.search);
    await expect(
      page.getByRole("heading", { name: "Email Verified Successfully" })
    ).toBeVisible({ timeout: 15000 });

    // 2nd consumption attempt: fails
    await page.goto(parsed.pathname + parsed.search);
    await expect(
      page.getByRole("heading", { name: "Verification Link Expired or Used" })
    ).toBeVisible({ timeout: 15000 });
  });

  test("7. verification does not leak raw token in logs or browser storage", async ({ page }) => {
    const applicant = generateTestApplicantCredentials("ver-storage");
    createdTestEmails.push(applicant.email);

    await registerApplicantViaUI(page, applicant);

    const verificationUrl = await fetchEmailActionLink(applicant.email, "EMAIL_VERIFICATION");
    const parsed = new URL(verificationUrl);
    const rawToken = parsed.searchParams.get("token") || "";
    expect(rawToken.length).toBeGreaterThanOrEqual(16);

    const capturedLogs: string[] = [];
    page.on("console", (msg) => capturedLogs.push(msg.text()));

    await page.goto(parsed.pathname + parsed.search);
    await expect(
      page.getByRole("heading", { name: "Email Verified Successfully" })
    ).toBeVisible({ timeout: 15000 });

    // Verify raw token is not stored in localStorage or sessionStorage
    const storageCheck = await page.evaluate(() => {
      const localKeys = Object.keys(localStorage);
      const sessionKeys = Object.keys(sessionStorage);
      const localValues = localKeys.map((k) => localStorage.getItem(k));
      const sessionValues = sessionKeys.map((k) => sessionStorage.getItem(k));
      return { localValues, sessionValues };
    });

    for (const val of [...storageCheck.localValues, ...storageCheck.sessionValues]) {
      if (val) {
        expect(val).not.toContain(rawToken);
      }
    }

    // Verify console logs do not contain raw token
    for (const log of capturedLogs) {
      expect(log).not.toContain(rawToken);
    }
  });

  test("8. URL is scrubbed immediately to remove token parameter from address bar", async ({ page }) => {
    const applicant = generateTestApplicantCredentials("ver-scrub");
    createdTestEmails.push(applicant.email);

    await registerApplicantViaUI(page, applicant);

    const verificationUrl = await fetchEmailActionLink(applicant.email, "EMAIL_VERIFICATION");
    const parsed = new URL(verificationUrl);

    await page.goto(parsed.pathname + parsed.search);
    await expect(
      page.getByRole("heading", { name: "Email Verified Successfully" })
    ).toBeVisible({ timeout: 15000 });

    // Check that window.location.search is now empty (token scrubbed)
    const currentSearch = await page.evaluate(() => window.location.search);
    expect(currentSearch).toBe("");
    expect(page.url()).not.toContain("token=");
  });

  // ===========================================================================
  // TASK 4: RESEND VERIFICATION BROWSER TESTS
  // ===========================================================================

  test("9. unverified applicant can request a new verification email", async ({ page }) => {
    const applicant = generateTestApplicantCredentials("resend-req");
    createdTestEmails.push(applicant.email);

    await registerApplicantViaUI(page, applicant);

    // Navigate to resend verification form
    await page.goto("/auth/verify-email");
    await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();

    await page.fill("#resend-email", applicant.email);
    await page.click("button[type='submit']");

    // Displays dispatch confirmation
    await expect(
      page.getByRole("heading", { name: "Verification Email Dispatched" })
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Request Received")).toBeVisible();
    await expect(page.locator(`strong:has-text("${applicant.email}")`)).toBeVisible();
  });

  test("10. new verification link from resend verifies the applicant successfully", async ({ page }) => {
    const applicant = generateTestApplicantCredentials("resend-verify");
    createdTestEmails.push(applicant.email);

    await registerApplicantViaUI(page, applicant);

    // Clear initial email from sink so we uniquely wait for the resend link
    await fetch(
      `http://localhost:3000/api/dev/e2e/email-link?email=${encodeURIComponent(applicant.email)}`,
      {
        method: "DELETE",
        headers: { "x-e2e-bridge-secret": process.env.E2E_BRIDGE_SECRET || "" },
      }
    );

    // Request resend via UI
    await page.goto("/auth/verify-email");
    await page.fill("#resend-email", applicant.email);
    await page.click("button[type='submit']");
    await expect(
      page.getByRole("heading", { name: "Verification Email Dispatched" })
    ).toBeVisible({ timeout: 15000 });

    // Retrieve new link
    const newVerificationUrl = await fetchEmailActionLink(applicant.email, "EMAIL_VERIFICATION");
    const parsed = new URL(newVerificationUrl);

    // Navigate to new link
    await page.goto(parsed.pathname + parsed.search);
    await expect(
      page.getByRole("heading", { name: "Email Verified Successfully" })
    ).toBeVisible({ timeout: 15000 });

    const dbUser = await getUserRecordFromE2EDB(applicant.email);
    expect(dbUser?.isEmailVerified).toBe(true);
  });

  test("11. resend verification invalidates previous verification token", async ({ page }) => {
    const applicant = generateTestApplicantCredentials("resend-inval");
    createdTestEmails.push(applicant.email);

    await registerApplicantViaUI(page, applicant);

    // Capture initial token 1 URL
    const token1Url = await fetchEmailActionLink(applicant.email, "EMAIL_VERIFICATION");
    const parsed1 = new URL(token1Url);

    // Request resend via UI (which invalidates token 1)
    await page.goto("/auth/verify-email");
    await page.fill("#resend-email", applicant.email);
    await page.click("button[type='submit']");
    await expect(
      page.getByRole("heading", { name: "Verification Email Dispatched" })
    ).toBeVisible({ timeout: 15000 });

    // Attempt to verify with token 1: must be rejected
    await page.goto(parsed1.pathname + parsed1.search);
    await expect(
      page.getByRole("heading", { name: "Verification Link Expired or Used" })
    ).toBeVisible({ timeout: 15000 });

    // User remains unverified after trying invalidated token
    const dbUser = await getUserRecordFromE2EDB(applicant.email);
    expect(dbUser?.isEmailVerified).toBe(false);
  });

  test("12. resend form validates required and malformed email inputs", async ({ page }) => {
    await page.goto("/auth/verify-email");

    // Empty submission
    await page.click("button[type='submit']");
    await expect(page.locator("#resend-email-error")).toContainText("Email address is required.");

    // Malformed email
    await page.fill("#resend-email", "not-a-valid-email");
    await page.click("button[type='submit']");
    await expect(page.locator("#resend-email-error")).toContainText("Please enter a valid email address.");
  });

  test("13. resend preserves anti-enumeration for non-existent accounts", async ({ page }) => {
    const nonExistentEmail = `unknown.user.${Date.now()}@cg-test-domain.org`;

    await page.goto("/auth/verify-email");
    await page.fill("#resend-email", nonExistentEmail);
    await page.click("button[type='submit']");

    // Returns identical generic success UI without revealing that the account does not exist
    await expect(
      page.getByRole("heading", { name: "Verification Email Dispatched" })
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Request Received")).toBeVisible();
    await expect(page.locator(`strong:has-text("${nonExistentEmail}")`)).toBeVisible();
  });

  test("14. resend rate limiting is enforced and displays user alert", async ({ page }) => {
    const applicant = generateTestApplicantCredentials("resend-ratelimit");
    createdTestEmails.push(applicant.email);

    await registerApplicantViaUI(page, applicant);
    await page.goto("/auth/verify-email");

    // Submit resend requests until rate limit threshold is triggered
    let rateLimited = false;
    for (let attempt = 1; attempt <= 4; attempt++) {
      await page.fill("#resend-email", applicant.email);
      await page.click("button[type='submit']");

      // Wait for either rate limit alert or dispatch success heading to appear
      const outcome = await Promise.race([
        page
          .locator('[role="alert"]')
          .filter({ hasText: "Too many verification requests" })
          .waitFor({ state: "visible", timeout: 15000 })
          .then(() => "RATE_LIMITED" as const),
        page
          .getByRole("heading", { name: "Verification Email Dispatched" })
          .waitFor({ state: "visible", timeout: 15000 })
          .then(() => "DISPATCHED" as const),
      ]);

      if (outcome === "RATE_LIMITED") {
        rateLimited = true;
        break;
      }

      // If dispatched, return to form for next attempt
      await page.getByRole("button", { name: "Send to a different email address" }).click();
      await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
    }

    expect(rateLimited).toBe(true);
    await expect(
      page.locator('[role="alert"]').filter({
        hasText: "Too many verification requests",
      })
    ).toBeVisible();
  });
});
