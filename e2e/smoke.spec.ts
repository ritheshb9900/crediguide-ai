import { test, expect } from "@playwright/test";

test.describe("E2E Smoke Tests", () => {
  test("loads the Login page and displays all required elements", async ({ page }) => {
    await page.goto("/auth/login");

    // Verify page content
    await expect(page.getByRole("heading", { name: "Sign in to CrediGuide" })).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator("button[type='submit']")).toContainText("Sign In");
    await expect(page.locator("a[href='/auth/forgot-password']")).toBeVisible();
    await expect(page.locator("a[href='/auth/register']")).toBeVisible();
  });

  test("loads the Registration page and displays all form inputs", async ({ page }) => {
    await page.goto("/auth/register");

    // Verify page content
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await expect(page.locator("#firstName")).toBeVisible();
    await expect(page.locator("#lastName")).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator("#confirmPassword")).toBeVisible();
    await expect(page.locator("button[type='submit']")).toContainText("Create Account");
    await expect(page.locator("a[href='/auth/login']")).toBeVisible();
  });
});
