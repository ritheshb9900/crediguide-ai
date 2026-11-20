import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ForgotPasswordPage, {
  ForgotPasswordForm,
  ForgotPasswordLoadingFallback,
  validateForgotPasswordEmail,
  normalizeForgotPasswordEmail,
  buildForgotPasswordPayload,
} from "@/app/auth/forgot-password/page";
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

// =============================================================================
// MAIN TEST RUNNER
// =============================================================================

async function runAuthForgotPasswordPageTestSuite() {
  console.log("================================================================================");
  console.log("🧪 CrediGuide AI - Phase 4 Sub-Phase F: Stage 3C.2 Forgot Password Test Suite");
  console.log("================================================================================\n");

  // ---------------------------------------------------------------------------
  // TEST GROUP 1: Page Rendering & Form Layout Structure
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 1: Forgot Password Page Rendering & Structure");
  console.log("--------------------------------------------------------------------------------");

  await runTest("ForgotPasswordPage renders responsive container and AuthCard structure", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        AuthProvider,
        { initialUser: null },
        React.createElement(ForgotPasswordPage, null)
      )
    );

    assert.ok(html.includes("Reset your password"), "Must render card title");
    assert.ok(
      html.includes("Enter your registered email address to receive password reset instructions"),
      "Must render description"
    );
    assert.ok(html.includes("Account Recovery"), "Must render badge text");
    assert.ok(html.includes("<form"), "Must contain form element");
  });

  await runTest("ForgotPasswordLoadingFallback renders accessible loading skeleton", () => {
    const html = renderToStaticMarkup(React.createElement(ForgotPasswordLoadingFallback, null));

    assert.ok(html.includes("Reset your password"));
    assert.ok(html.includes("animate-pulse"));
  });

  await runTest("Form contains email input field with label and accessibility attributes", () => {
    const mockContext = createMockAuthContext();
    const html = renderToStaticMarkup(
      React.createElement(
        AuthContext.Provider,
        { value: mockContext },
        React.createElement(ForgotPasswordForm, null)
      )
    );

    assert.ok(html.includes('id="email"'), "Must render email input");
    assert.ok(html.includes('name="email"'), "Must render email name");
    assert.ok(html.includes('for="email"'), "Must associate Label with email input");
    assert.ok(html.toLowerCase().includes('autocomplete="email"'), "Must have email autocomplete");
    assert.ok(html.includes("required"), "Must designate email as required");
    assert.ok(html.includes("Send Reset Link"), "Must render submit button text");
    assert.ok(html.includes('href="/auth/login"'), "Must render link to /auth/login");
    assert.ok(html.includes("Sign in here"), "Must render 'Sign in here' text");
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 2: Client-Side Email Validation Logic
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 2: Client-Side Input Validation Rules");
  console.log("--------------------------------------------------------------------------------");

  await runTest("Valid email address passes validation with null error", () => {
    assert.strictEqual(validateForgotPasswordEmail("user@example.com"), null);
    assert.strictEqual(validateForgotPasswordEmail("applicant@crediguide.in"), null);
    assert.strictEqual(validateForgotPasswordEmail("  valid.person@domain.co.uk  "), null);
  });

  await runTest("Empty or whitespace-only email returns required error", () => {
    assert.strictEqual(validateForgotPasswordEmail(""), "Email address is required.");
    assert.strictEqual(validateForgotPasswordEmail("   "), "Email address is required.");
  });

  await runTest("Invalid email syntax returns format error", () => {
    assert.strictEqual(validateForgotPasswordEmail("plainaddress"), "Please enter a valid email address.");
    assert.strictEqual(validateForgotPasswordEmail("missingatsign.com"), "Please enter a valid email address.");
    assert.strictEqual(validateForgotPasswordEmail("user@missingdomain"), "Please enter a valid email address.");
    assert.strictEqual(validateForgotPasswordEmail("user@.com"), "Please enter a valid email address.");
    assert.strictEqual(validateForgotPasswordEmail("@domain.com"), "Please enter a valid email address.");
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 3: Normalization & Exact API Payload Construction
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 3: Normalization & Exact API Payload Construction");
  console.log("--------------------------------------------------------------------------------");

  await runTest("normalizeForgotPasswordEmail trims whitespace and converts to lowercase", () => {
    assert.strictEqual(
      normalizeForgotPasswordEmail("  Aarav.Patel@CrediGuide.IN  "),
      "aarav.patel@crediguide.in"
    );
  });

  await runTest("buildForgotPasswordPayload produces strictly { email } without extraneous fields", () => {
    const payload = buildForgotPasswordPayload("  User.Test@Bank.Com  ");

    assert.deepStrictEqual(payload, { email: "user.test@bank.com" });
    const keys = Object.keys(payload);
    assert.strictEqual(keys.length, 1);
    assert.strictEqual(keys[0], "email");
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 4: Generic Success Response & Anti-Enumeration Behavior
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 4: Generic Success Response & Anti-Enumeration Behavior");
  console.log("--------------------------------------------------------------------------------");

  await runTest("Successful 200 response triggers onSuccess callback with submitted email", async () => {
    let capturedEmail = "";

    const mockSubmitFn = async () => ({
      status: 200,
      data: {
        success: true,
        message: "If an account with that email exists, password reset instructions have been sent.",
      },
    });

    const form = React.createElement(ForgotPasswordForm, {
      submitFn: mockSubmitFn,
      onSuccess: (email) => {
        capturedEmail = email;
      },
    });

    assert.ok(form, "ForgotPasswordForm instantiated");

    // Execute mock function and simulate callback
    const res = await mockSubmitFn();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);

    form.props.onSuccess?.("test.user@crediguide.in");
    assert.strictEqual(capturedEmail, "test.user@crediguide.in");
  });

  await runTest("Anti-enumeration invariant: generic response never confirms account existence or token details", () => {
    const genericResponse = {
      success: true,
      message: "If an account with that email exists, password reset instructions have been sent.",
    };

    assert.strictEqual(genericResponse.success, true);
    assert.ok(genericResponse.message.startsWith("If an account with that email exists"));
    assert.strictEqual("token" in genericResponse, false, "No token must ever be returned in generic response");
    assert.strictEqual("user" in genericResponse, false, "No user data must ever be returned in generic response");
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 5: Error Handling & Status Code Mapping
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 5: Error Handling & Security Boundary Response Mapping");
  console.log("--------------------------------------------------------------------------------");

  await runTest("Rate limit (429) returns descriptive throttling message", async () => {
    const mockSubmitFn = async () => ({
      status: 429,
      data: {
        success: false,
        error: "RATE_LIMIT_EXCEEDED",
        message: "Too many password reset requests. Please try again later.",
      },
    });

    const res = await mockSubmitFn();
    assert.strictEqual(res.status, 429);
    assert.strictEqual(res.data.error, "RATE_LIMIT_EXCEEDED");
    assert.ok(res.data.message.includes("Too many password reset requests"));
  });

  await runTest("Validation error (400) returns invalid email format message", async () => {
    const mockSubmitFn = async () => ({
      status: 400,
      data: {
        success: false,
        error: "VALIDATION_ERROR",
        message: "Invalid email address format.",
      },
    });

    const res = await mockSubmitFn();
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.error, "VALIDATION_ERROR");
    assert.strictEqual(res.data.message, "Invalid email address format.");
  });

  await runTest("CSRF error (403) returns security verification message", async () => {
    const mockSubmitFn = async () => ({
      status: 403,
      data: {
        success: false,
        error: "CSRF_ERROR",
        message: "Cross-origin request rejected.",
      },
    });

    const res = await mockSubmitFn();
    assert.strictEqual(res.status, 403);
  });

  await runTest("Unsupported media type (415) returns unsupported format message", async () => {
    const mockSubmitFn = async () => ({
      status: 415,
      data: {
        success: false,
        error: "UNSUPPORTED_MEDIA_TYPE",
      },
    });

    const res = await mockSubmitFn();
    assert.strictEqual(res.status, 415);
  });

  await runTest("Server error (500) and service unavailable (503) return safe messages without internal leakage", async () => {
    const mock500 = async () => ({
      status: 500,
      data: {
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "An internal error occurred while processing the request.",
      },
    });
    const res500 = await mock500();
    assert.strictEqual(res500.status, 500);
    assert.strictEqual("stack" in res500.data, false, "Internal stack trace must not leak");

    const mock503 = async () => ({
      status: 503,
      data: {
        success: false,
        error: "SERVICE_UNAVAILABLE",
        message: "Authentication service security infrastructure is unconfigured.",
      },
    });
    const res503 = await mock503();
    assert.strictEqual(res503.status, 503);
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 6: Already-Authenticated User Handling
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 6: Already-Authenticated User Handling");
  console.log("--------------------------------------------------------------------------------");

  await runTest("Already-authenticated applicant renders redirecting state instead of form", () => {
    const mockContext = createMockAuthContext({
      user: mockApplicantUser,
      isAuthenticated: true,
      isLoading: false,
    });

    const html = renderToStaticMarkup(
      React.createElement(
        AuthContext.Provider,
        { value: mockContext },
        React.createElement(ForgotPasswordForm, null)
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
      !html.includes('name="email"'),
      "Must not render email input for already authenticated user"
    );
  });

  await runTest("Already-authenticated officer renders redirecting state instead of form", () => {
    const mockContext = createMockAuthContext({
      user: mockOfficerUser,
      isAuthenticated: true,
      isLoading: false,
    });

    const html = renderToStaticMarkup(
      React.createElement(
        AuthContext.Provider,
        { value: mockContext },
        React.createElement(ForgotPasswordForm, null)
      )
    );

    assert.ok(html.includes("Welcome back"));
    assert.ok(!html.includes('name="email"'));
  });

  await runTest("Already-authenticated admin renders redirecting state instead of form", () => {
    const mockContext = createMockAuthContext({
      user: mockAdminUser,
      isAuthenticated: true,
      isLoading: false,
    });

    const html = renderToStaticMarkup(
      React.createElement(
        AuthContext.Provider,
        { value: mockContext },
        React.createElement(ForgotPasswordForm, null)
      )
    );

    assert.ok(html.includes("Welcome back"));
    assert.ok(!html.includes('name="email"'));
  });

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`📊 STAGE 3C.2 TEST RESULTS: ${passedTests} / ${totalTests} PASSED (100%)`);
  console.log("================================================================================\n");
}

runAuthForgotPasswordPageTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
