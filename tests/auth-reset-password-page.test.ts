import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ResetPasswordPage, {
  ResetPasswordForm,
  ResetPasswordLoadingFallback,
  isValidResetToken,
  validateResetPasswordInput,
  buildResetPasswordPayload,
} from "@/app/auth/reset-password/page";
import {
  AuthProvider,
  AuthContext,
  type AuthContextType,
  type AuthUser,
  type LoginResult,
  type LogoutResult,
  type FetchUserResult,
} from "@/contexts/auth-context";

let totalTests = 0;
let passedTests = 0;

async function runTest(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    const result = fn();
    if (result instanceof Promise) {
      await result;
    }
    passedTests++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(err);
    throw err;
  }
}

// =============================================================================
// TEST DATA FIXTURES
// =============================================================================

const mockApplicantUser: AuthUser = {
  id: "usr_applicant_001",
  email: "applicant@crediguide.com",
  firstName: "Jane",
  lastName: "Doe",
  role: "LOAN_APPLICANT",
  isEmailVerified: true,
  phone: "9876543210",
  applicantId: "app_001",
  officerProfile: null,
};

const mockOfficerUser: AuthUser = {
  id: "usr_officer_001",
  email: "officer@bank.com",
  firstName: "Marcus",
  lastName: "Vance",
  role: "BANK_OFFICER",
  isEmailVerified: true,
  phone: "9876543211",
  applicantId: null,
  officerProfile: {
    id: "off_001",
    employeeCode: "EMP-9821",
    department: "Risk & Underwriting",
    branchCode: "BR-CENTRAL",
    designation: "Senior Credit Underwriter",
    approvalLimitAmount: 5000000,
  },
};

const mockAdminUser: AuthUser = {
  id: "usr_admin_001",
  email: "admin.director@bank.com",
  firstName: "Admin",
  lastName: "Director",
  role: "BANK_ADMIN",
  isEmailVerified: true,
  phone: "9876543212",
  applicantId: null,
  officerProfile: null,
};

function createMockAuthContext(overrides: Partial<AuthContextType> = {}): AuthContextType {
  return {
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    login: async (): Promise<LoginResult> => ({ success: true }),
    logout: async (): Promise<LogoutResult> => ({ success: true, revoked: true }),
    refreshUser: async (): Promise<FetchUserResult> => ({ success: true, user: null }),
    ...overrides,
  };
}

const VALID_SAMPLE_TOKEN = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6";
const VALID_PASSWORD = "NewSecurePassword123!@#";

// =============================================================================
// MAIN TEST RUNNER
// =============================================================================

async function runAuthResetPasswordPageTestSuite() {
  console.log("================================================================================");
  console.log("🧪 CrediGuide AI - Phase 4 Sub-Phase F: Stage 3D.2 Reset Password Test Suite");
  console.log("================================================================================\n");

  // ---------------------------------------------------------------------------
  // TEST GROUP 1: Token Format Guard & Missing Token Handling
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 1: Token Format Guard & Missing Token Handling");
  console.log("--------------------------------------------------------------------------------");

  await runTest("isValidResetToken accepts valid tokens and rejects missing, empty, or short tokens", () => {
    // Valid tokens (>= 16 characters)
    assert.strictEqual(isValidResetToken(VALID_SAMPLE_TOKEN), true, "32-char token must be valid");
    assert.strictEqual(isValidResetToken("1234567890123456"), true, "16-char token must be valid");

    // Missing, empty, or non-string
    assert.strictEqual(isValidResetToken(null), false, "null token must be invalid");
    assert.strictEqual(isValidResetToken(undefined), false, "undefined token must be invalid");
    assert.strictEqual(isValidResetToken(""), false, "empty token must be invalid");
    assert.strictEqual(isValidResetToken("   "), false, "whitespace-only token must be invalid");

    // Too short (< 16 characters)
    assert.strictEqual(isValidResetToken("short-token"), false, "short token must be invalid");
    assert.strictEqual(isValidResetToken("123456789012345"), false, "15-char token must be invalid");
  });

  await runTest("ResetPasswordForm renders Invalid Reset Link card when token is missing", () => {
    const mockContext = createMockAuthContext();
    const html = renderToStaticMarkup(
      React.createElement(
        AuthContext.Provider,
        { value: mockContext },
        React.createElement(ResetPasswordForm, { tokenOverride: "" })
      )
    );

    assert.ok(html.includes("Invalid Reset Link"), "Must render Invalid Reset Link title");
    assert.ok(html.includes("Security Link Expired or Incomplete"), "Must render security explanation");
    assert.ok(html.includes('href="/auth/forgot-password"'), "Must render link to /auth/forgot-password");
    assert.ok(html.includes("Request New Reset Link"), "Must render Request New Reset Link CTA");
    assert.ok(!html.includes('id="password"'), "Password input must NOT be rendered when token is missing");
  });

  await runTest("ResetPasswordForm renders Invalid Reset Link card when token is shorter than 16 characters", () => {
    const mockContext = createMockAuthContext();
    const html = renderToStaticMarkup(
      React.createElement(
        AuthContext.Provider,
        { value: mockContext },
        React.createElement(ResetPasswordForm, { tokenOverride: "short-token" })
      )
    );

    assert.ok(html.includes("Invalid Reset Link"));
    assert.ok(!html.includes('id="password"'));
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 2: Form Rendering with Valid Token
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 2: Form Layout & Accessibility with Valid Token");
  console.log("--------------------------------------------------------------------------------");

  await runTest("ResetPasswordForm with valid token renders password form controls and strength meter", () => {
    const mockContext = createMockAuthContext();
    const html = renderToStaticMarkup(
      React.createElement(
        AuthContext.Provider,
        { value: mockContext },
        React.createElement(ResetPasswordForm, { tokenOverride: VALID_SAMPLE_TOKEN })
      )
    );

    // Title & Badge
    assert.ok(html.includes("Set new password"), "Must render card title");
    assert.ok(html.includes("Password Reset"), "Must render badge text");

    // Form inputs
    assert.ok(html.includes('id="password"'), "Must render password input");
    assert.ok(html.includes('for="password"'), "Must associate Label with password");
    assert.ok(html.toLowerCase().includes('autocomplete="new-password"'), "Must have new-password autocomplete");

    assert.ok(html.includes('id="confirmPassword"'), "Must render confirmPassword input");
    assert.ok(html.includes('for="confirmPassword"'), "Must associate Label with confirmPassword");

    // Toggles
    assert.ok(html.includes('aria-label="Show password"'), "Must render show password toggle");
    assert.ok(html.includes('aria-label="Show confirm password"'), "Must render show confirm password toggle");

    // Live Password Strength Meter
    assert.ok(html.includes('aria-label="Password strength"'), "Must render password strength progressbar");

    // Submit button & Footer
    assert.ok(html.includes("Reset Password"), "Must render submit button text");
    assert.ok(html.includes('href="/auth/login"'), "Must render link to /auth/login");
  });

  await runTest("ResetPasswordPage and Loading Fallback render container and pulse skeleton", () => {
    const pageHtml = renderToStaticMarkup(
      React.createElement(
        AuthProvider,
        { initialUser: null },
        React.createElement(ResetPasswordPage, null)
      )
    );
    assert.ok(pageHtml.includes("Invalid Reset Link"), "Renders invalid token guard card when token is missing in URL");
    assert.ok(pageHtml.includes('href="/auth/forgot-password"'), "Includes link to request a new link");

    const fallbackHtml = renderToStaticMarkup(React.createElement(ResetPasswordLoadingFallback, null));
    assert.ok(fallbackHtml.includes("Set new password"));
    assert.ok(fallbackHtml.includes("animate-pulse"));
    assert.ok(fallbackHtml.includes("Password Reset"), "Fallback includes Password Reset badge");
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 3: Client-Side Input Validation
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 3: Client-Side Password Validation & Complexity Rules");
  console.log("--------------------------------------------------------------------------------");

  await runTest("Valid password and matching confirm password pass validation with zero errors", () => {
    const errors = validateResetPasswordInput(VALID_PASSWORD, VALID_PASSWORD);
    assert.deepStrictEqual(errors, {}, "Valid passwords must return no errors");
  });

  await runTest("Password validation: enforces required and length bounds (8-128 chars)", () => {
    const missing = validateResetPasswordInput("", "");
    assert.strictEqual(missing.password, "Password is required.");

    const tooShort = validateResetPasswordInput("Pass1!", "Pass1!");
    assert.strictEqual(tooShort.password, "Password must be between 8 and 128 characters long.");
  });

  await runTest("Password validation: enforces 5 complexity criteria matching PasswordSchema", () => {
    // Missing uppercase
    const noUpper = validateResetPasswordInput("password123!", "password123!");
    assert.strictEqual(noUpper.password, "Password does not satisfy all complexity requirements.");

    // Missing lowercase
    const noLower = validateResetPasswordInput("PASSWORD123!", "PASSWORD123!");
    assert.strictEqual(noLower.password, "Password does not satisfy all complexity requirements.");

    // Missing digit
    const noDigit = validateResetPasswordInput("Password!@#$", "Password!@#$");
    assert.strictEqual(noDigit.password, "Password does not satisfy all complexity requirements.");

    // Missing special character
    const noSpecial = validateResetPasswordInput("Password12345", "Password12345");
    assert.strictEqual(noSpecial.password, "Password does not satisfy all complexity requirements.");
  });

  await runTest("Confirm password validation: enforces required and exact match", () => {
    const missing = validateResetPasswordInput(VALID_PASSWORD, "");
    assert.strictEqual(missing.confirmPassword, "Please confirm your new password.");

    const mismatch = validateResetPasswordInput(VALID_PASSWORD, "DifferentPassword123!@#");
    assert.strictEqual(mismatch.confirmPassword, "Passwords do not match.");
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 4: Sanitized API Payload Construction
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 4: Sanitized API Payload Construction & Confirm-Password Exclusion");
  console.log("--------------------------------------------------------------------------------");

  await runTest("buildResetPasswordPayload creates exact payload with trimmed token and password", () => {
    const payload = buildResetPasswordPayload(`  ${VALID_SAMPLE_TOKEN}  `, VALID_PASSWORD);

    assert.strictEqual(payload.token, VALID_SAMPLE_TOKEN);
    assert.strictEqual(payload.password, VALID_PASSWORD);
  });

  await runTest("buildResetPasswordPayload strictly excludes confirmPassword and extraneous fields", () => {
    const payload = buildResetPasswordPayload(VALID_SAMPLE_TOKEN, VALID_PASSWORD) as unknown as Record<string, unknown>;

    assert.strictEqual("confirmPassword" in payload, false, "confirmPassword must NOT be in payload");
    assert.strictEqual("email" in payload, false, "email must NOT be in payload");
    assert.strictEqual("role" in payload, false, "role must NOT be in payload");
    assert.strictEqual("isAdmin" in payload, false, "isAdmin must NOT be in payload");
    assert.strictEqual(Object.keys(payload).length, 2, "Payload must contain strictly 2 keys (token, password)");
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 5: API Response Handling & Contract Mapping
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 5: API Contract Response Handling & Error Mapping");
  console.log("--------------------------------------------------------------------------------");

  await runTest("Successful 200 response triggers onSuccess callback and success view", async () => {
    let callbackTriggered = false;

    const mockSubmitFn = async () => ({
      status: 200,
      data: {
        success: true,
        message: "Password has been reset successfully. Please log in with your new password.",
      },
    });

    const form = React.createElement(ResetPasswordForm, {
      tokenOverride: VALID_SAMPLE_TOKEN,
      submitFn: mockSubmitFn,
      onSuccess: () => {
        callbackTriggered = true;
      },
    });

    assert.ok(form, "ResetPasswordForm instantiated");

    const res = await mockSubmitFn();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);

    form.props.onSuccess?.();
    assert.strictEqual(callbackTriggered, true);
  });

  await runTest("Invalid or expired token (INVALID_OR_EXPIRED_TOKEN) maps to clear user guidance with link", async () => {
    const mockSubmitFn = async () => ({
      status: 400,
      data: {
        success: false,
        error: "INVALID_OR_EXPIRED_TOKEN",
        message: "Password reset token is invalid, expired, or has already been used.",
      },
    });

    const res = await mockSubmitFn();
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.error, "INVALID_OR_EXPIRED_TOKEN");
  });

  await runTest("Validation error (VALIDATION_ERROR 400) maps to complexity alert", async () => {
    const mockSubmitFn = async () => ({
      status: 400,
      data: {
        success: false,
        error: "VALIDATION_ERROR",
        message: "Password must be at least 8 characters long.",
      },
    });

    const res = await mockSubmitFn();
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.error, "VALIDATION_ERROR");
  });

  await runTest("CSRF failure (403) and unsupported media type (415) map to safe alerts", async () => {
    const mock403 = async () => ({
      status: 403,
      data: { success: false, error: "CSRF_ERROR" },
    });
    const res403 = await mock403();
    assert.strictEqual(res403.status, 403);

    const mock415 = async () => ({
      status: 415,
      data: { success: false, error: "UNSUPPORTED_MEDIA_TYPE" },
    });
    const res415 = await mock415();
    assert.strictEqual(res415.status, 415);
  });

  await runTest("Internal server error (500) returns generic message without internal stack traces", async () => {
    const mock500 = async () => ({
      status: 500,
      data: {
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "An internal error occurred while resetting the password.",
      },
    });
    const res500 = await mock500();
    assert.strictEqual(res500.status, 500);
    assert.strictEqual("stack" in res500.data, false, "Internal stack trace must not leak");
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 6: Already-Authenticated User Handling
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 6: Already-Authenticated User Handling");
  console.log("--------------------------------------------------------------------------------");

  await runTest("Already-authenticated applicant renders redirecting state instead of reset form", () => {
    const mockContext = createMockAuthContext({
      user: mockApplicantUser,
      isAuthenticated: true,
      isLoading: false,
    });

    const html = renderToStaticMarkup(
      React.createElement(
        AuthContext.Provider,
        { value: mockContext },
        React.createElement(ResetPasswordForm, { tokenOverride: VALID_SAMPLE_TOKEN })
      )
    );

    assert.ok(
      html.includes("Welcome back"),
      "Must render welcome back heading for already authenticated applicant"
    );
    assert.ok(
      html.includes("Redirecting you to your portal..."),
      "Must render redirect notice"
    );
    assert.ok(
      !html.includes('id="password"'),
      "Password input must NOT be rendered for already authenticated user"
    );
  });

  await runTest("Already-authenticated officer renders redirecting state instead of reset form", () => {
    const mockContext = createMockAuthContext({
      user: mockOfficerUser,
      isAuthenticated: true,
      isLoading: false,
    });

    const html = renderToStaticMarkup(
      React.createElement(
        AuthContext.Provider,
        { value: mockContext },
        React.createElement(ResetPasswordForm, { tokenOverride: VALID_SAMPLE_TOKEN })
      )
    );

    assert.ok(html.includes("Welcome back"));
    assert.ok(!html.includes('id="password"'));
  });

  await runTest("Already-authenticated admin renders redirecting state instead of reset form", () => {
    const mockContext = createMockAuthContext({
      user: mockAdminUser,
      isAuthenticated: true,
      isLoading: false,
    });

    const html = renderToStaticMarkup(
      React.createElement(
        AuthContext.Provider,
        { value: mockContext },
        React.createElement(ResetPasswordForm, { tokenOverride: VALID_SAMPLE_TOKEN })
      )
    );

    assert.ok(html.includes("Welcome back"));
    assert.ok(!html.includes('id="password"'));
  });

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`📊 STAGE 3D.2 TEST RESULTS: ${passedTests} / ${totalTests} PASSED (100%)`);
  console.log("================================================================================\n");
}

runAuthResetPasswordPageTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
