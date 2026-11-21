import { test, expect } from "@playwright/test";
import {
  generateTestApplicantCredentials,
  fetchEmailActionLink,
  cleanupE2EUser,
} from "./fixtures/test-environment";

test.describe("E2E Authentication Journey", () => {
  const applicant = generateTestApplicantCredentials();

  test.afterAll(async () => {
    await cleanupE2EUser(applicant.email);
  });

  test("completes registration, email verification, and login flow", async ({ page }) => {
    // 1. Visit registration page
    await page.goto("/auth/register");
    await expect(
      page.getByRole("heading", { name: "Create your account" })
    ).toBeVisible();

    // 2. Fill registration form
    await page.fill("#firstName", applicant.firstName);
    await page.fill("#lastName", applicant.lastName);
    await page.fill("#email", applicant.email);
    await page.fill("#phone", applicant.phone);
    await page.fill("#password", applicant.password);
    await page.fill("#confirmPassword", applicant.password);

    // 3. Submit registration
    await page.click("button[type='submit']");

    // 4. Verify post-registration confirmation screen
    await expect(page.locator("text=Verification Email Dispatched")).toBeVisible({
      timeout: 15000,
    });

    // 5. Retrieve verification link from isolated dev bridge
    const verificationUrl = await fetchEmailActionLink(applicant.email, "EMAIL_VERIFICATION");
    expect(verificationUrl).toContain("/auth/verify-email?token=");

    // Extract path relative to base or navigate directly
    const urlObj = new URL(verificationUrl);
    const relativeVerificationPath = urlObj.pathname + urlObj.search;

    // 6. Navigate to verification URL
    await page.goto(relativeVerificationPath);

    // 7. Verify email verified state
    await expect(
      page.getByRole("heading", { name: "Email Verified Successfully" })
    ).toBeVisible({
      timeout: 15000,
    });

    // 8. Proceed to login
    await page.getByRole("link", { name: "Proceed to Sign In" }).click();
    await expect(page).toHaveURL(/\/auth\/login/);

    // 9. Login with verified account
    await page.fill("#email", applicant.email);
    await page.fill("#password", applicant.password);
    await page.click("button[type='submit']");

    // 10. Verify successful authentication and redirection away from /auth/login
    await expect(page).not.toHaveURL(/\/auth\/login/, { timeout: 15000 });
  });
});
