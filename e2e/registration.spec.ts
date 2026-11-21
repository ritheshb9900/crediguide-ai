import { test, expect } from "@playwright/test";
import {
  generateTestApplicantCredentials,
  cleanupE2EUser,
  getUserRecordFromE2EDB,
} from "./fixtures/test-environment";

test.describe("Applicant Registration Flow (E2E)", () => {
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

  test("1. loads registration page with all required UI elements", async ({ page }) => {
    await page.goto("/auth/register");

    // Header & Description from AuthCard
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await expect(
      page.getByText("Register for your enterprise lending intelligence portal")
    ).toBeVisible();

    // Input fields
    await expect(page.locator("#firstName")).toBeVisible();
    await expect(page.locator("#lastName")).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#phone")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator("#confirmPassword")).toBeVisible();

    // Submit button
    await expect(page.getByRole("button", { name: "Create Account" })).toBeVisible();

    // Sign in link
    const signInLink = page.getByRole("link", { name: "Sign in here" });
    await expect(signInLink).toBeVisible();
    await expect(signInLink).toHaveAttribute("href", "/auth/login");
  });

  test("2. successfully registers a valid applicant with all fields", async ({ page }) => {
    const applicant = generateTestApplicantCredentials("reg-full");
    createdTestEmails.push(applicant.email);

    await page.goto("/auth/register");

    await page.fill("#firstName", applicant.firstName);
    await page.fill("#lastName", applicant.lastName);
    await page.fill("#email", applicant.email);
    await page.fill("#phone", applicant.phone);
    await page.fill("#password", applicant.password);
    await page.fill("#confirmPassword", applicant.password);

    await page.click("button[type='submit']");

    // Post-registration confirmation
    await expect(
      page.getByRole("heading", { name: "Registration Successful" })
    ).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=Verification Email Dispatched")).toBeVisible();
    await expect(page.locator(`strong:has-text("${applicant.email}")`)).toBeVisible();

    // Database verification: user exists in crediguide_e2e_db with role LOAN_APPLICANT and unverified
    const dbUser = await getUserRecordFromE2EDB(applicant.email);
    expect(dbUser).not.toBeNull();
    expect(dbUser?.email).toBe(applicant.email.toLowerCase());
    expect(dbUser?.role).toBe("LOAN_APPLICANT");
    expect(dbUser?.isEmailVerified).toBe(false);
  });

  test("3. successfully registers without optional phone number", async ({ page }) => {
    const applicant = generateTestApplicantCredentials("reg-nophone");
    createdTestEmails.push(applicant.email);

    await page.goto("/auth/register");

    await page.fill("#firstName", applicant.firstName);
    await page.fill("#lastName", applicant.lastName);
    await page.fill("#email", applicant.email);
    // Leave phone empty
    await page.fill("#password", applicant.password);
    await page.fill("#confirmPassword", applicant.password);

    await page.click("button[type='submit']");

    await expect(
      page.getByRole("heading", { name: "Registration Successful" })
    ).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=Verification Email Dispatched")).toBeVisible();

    const dbUser = await getUserRecordFromE2EDB(applicant.email);
    expect(dbUser).not.toBeNull();
    expect(dbUser?.role).toBe("LOAN_APPLICANT");
  });

  test("4. public registration cannot select BANK_OFFICER or BANK_ADMIN roles", async ({ page }) => {
    await page.goto("/auth/register");

    // Verify form DOM contains zero role selection inputs
    const roleSelectors = page.locator('select[name="role"], input[name="role"], [data-testid="role-selector"]');
    await expect(roleSelectors).toHaveCount(0);

    const bankRoleInputs = page.locator('input[value="BANK_OFFICER"], input[value="BANK_ADMIN"]');
    await expect(bankRoleInputs).toHaveCount(0);

    // Verify that any registered applicant is strictly LOAN_APPLICANT
    const applicant = generateTestApplicantCredentials("reg-role");
    createdTestEmails.push(applicant.email);

    await page.fill("#firstName", applicant.firstName);
    await page.fill("#lastName", applicant.lastName);
    await page.fill("#email", applicant.email);
    await page.fill("#password", applicant.password);
    await page.fill("#confirmPassword", applicant.password);
    await page.click("button[type='submit']");

    await expect(
      page.getByRole("heading", { name: "Registration Successful" })
    ).toBeVisible({ timeout: 15000 });

    const dbUser = await getUserRecordFromE2EDB(applicant.email);
    expect(dbUser?.role).toBe("LOAN_APPLICANT");
  });

  test("5. rejects duplicate email registration gracefully", async ({ page }) => {
    const applicant = generateTestApplicantCredentials("reg-dup");
    createdTestEmails.push(applicant.email);

    // First registration
    await page.goto("/auth/register");
    await page.fill("#firstName", applicant.firstName);
    await page.fill("#lastName", applicant.lastName);
    await page.fill("#email", applicant.email);
    await page.fill("#password", applicant.password);
    await page.fill("#confirmPassword", applicant.password);
    await page.click("button[type='submit']");

    await expect(
      page.getByRole("heading", { name: "Registration Successful" })
    ).toBeVisible({ timeout: 15000 });

    // Attempt second registration with identical email
    await page.goto("/auth/register");
    await page.fill("#firstName", "Another");
    await page.fill("#lastName", "Applicant");
    await page.fill("#email", applicant.email);
    await page.fill("#password", "DifferentPass123!Secure");
    await page.fill("#confirmPassword", "DifferentPass123!Secure");
    await page.click("button[type='submit']");

    // Displays clear duplicate email error alert (filtering out Next.js route announcer)
    const alert = page.getByRole("alert").filter({
      hasText: "An account with this email address already exists.",
    });
    await expect(alert).toBeVisible();
  });

  test("6. rejects invalid email and weak/mismatched passwords", async ({ page }) => {
    await page.goto("/auth/register");

    // Invalid email format
    await page.fill("#firstName", "Valid");
    await page.fill("#lastName", "User");
    await page.fill("#email", "not-an-email");
    await page.fill("#password", "ValidPass123!Secure");
    await page.fill("#confirmPassword", "ValidPass123!Secure");
    await page.click("button[type='submit']");

    await expect(page.locator("#email-error")).toContainText("Please enter a valid email address.");

    // Weak password
    await page.fill("#email", "valid.user@cg-test-domain.org");
    await page.fill("#password", "weak");
    await page.fill("#confirmPassword", "weak");
    await page.click("button[type='submit']");

    await expect(page.locator("#password-error")).toBeVisible();

    // Password mismatch
    await page.fill("#password", "ValidPass123!Secure");
    await page.fill("#confirmPassword", "MismatchPass123!Secure");
    await page.click("button[type='submit']");

    await expect(page.locator("#confirmPassword-error")).toContainText("Passwords do not match.");
  });

  test("7. validates required fields when submitting empty form", async ({ page }) => {
    await page.goto("/auth/register");
    await page.click("button[type='submit']");

    await expect(page.locator("#firstName-error")).toContainText("First name is required.");
    await expect(page.locator("#lastName-error")).toContainText("Last name is required.");
    await expect(page.locator("#email-error")).toContainText("Email address is required.");
    await expect(page.locator("#password-error")).toContainText("Password is required.");
    await expect(page.locator("#confirmPassword-error")).toContainText("Please confirm your password.");
  });

  test("8. does not create an authenticated session on registration", async ({ page }) => {
    const applicant = generateTestApplicantCredentials("reg-nosession");
    createdTestEmails.push(applicant.email);

    await page.goto("/auth/register");
    await page.fill("#firstName", applicant.firstName);
    await page.fill("#lastName", applicant.lastName);
    await page.fill("#email", applicant.email);
    await page.fill("#password", applicant.password);
    await page.fill("#confirmPassword", applicant.password);
    await page.click("button[type='submit']");

    await expect(
      page.getByRole("heading", { name: "Registration Successful" })
    ).toBeVisible({ timeout: 15000 });

    // Verify browser session cookie is completely absent
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((c) => c.name === "crediguide_session");
    expect(sessionCookie).toBeUndefined();

    // Verify /api/auth/me returns 401 UNAUTHENTICATED
    const meRes = await page.request.get("/api/auth/me");
    expect(meRes.status()).toBe(401);
  });

  test("9. directs user to the email verification experience with resend link", async ({ page }) => {
    const applicant = generateTestApplicantCredentials("reg-verifyview");
    createdTestEmails.push(applicant.email);

    await page.goto("/auth/register");
    await page.fill("#firstName", applicant.firstName);
    await page.fill("#lastName", applicant.lastName);
    await page.fill("#email", applicant.email);
    await page.fill("#password", applicant.password);
    await page.fill("#confirmPassword", applicant.password);
    await page.click("button[type='submit']");

    await expect(
      page.getByRole("heading", { name: "Registration Successful" })
    ).toBeVisible({ timeout: 15000 });

    // Link to resend verification
    const resendLink = page.getByRole("link", { name: "Resend verification" });
    await expect(resendLink).toBeVisible();

    // Clicking resend verification navigates to /auth/verify-email
    await resendLink.click();
    await expect(page).toHaveURL(/\/auth\/verify-email/);

    // Verify the email field is pre-filled with the registered applicant email
    await expect(page.locator("#resend-email")).toHaveValue(applicant.email);

    // Verify that the query parameter was safely scrubbed from the address bar
    const currentSearch = await page.evaluate(() => window.location.search);
    expect(currentSearch).toBe("");
  });
});
