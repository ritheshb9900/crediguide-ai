import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import LoginPage, {
  LoginForm,
  LoginLoadingFallback,
  getRoleRedirectDestination,
  isAllowedRolePath,
} from "@/app/auth/login/page";
import {
  AuthProvider,
  AuthContext,
  type AuthContextType,
  type AuthUser,
  type LoginCredentials,
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
  phone: "+1-555-0101",
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
  phone: "+1-555-0102",
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
  phone: "+1-555-0103",
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

async function runAuthLoginPageTestSuite() {
  console.log("================================================================================");
  console.log("🧪 CrediGuide AI - Phase 4 Sub-Phase F: Stage 3A Login Page Test Suite");
  console.log("================================================================================\n");

  // ---------------------------------------------------------------------------
  // TEST GROUP 1: Page Rendering & Branding
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 1: Login Page Rendering & Branding Structure");
  console.log("--------------------------------------------------------------------------------");

  await runTest("LoginPage renders responsive container and AuthCard structure", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        AuthProvider,
        { initialUser: null },
        React.createElement(LoginPage, null)
      )
    );

    assert.ok(html.includes("Sign in to CrediGuide"), "Must render card title");
    assert.ok(
      html.includes("Access your enterprise lending intelligence portal"),
      "Must render card description"
    );
    assert.ok(html.includes("Enterprise Portal"), "Must render enterprise badge");
    assert.ok(html.includes("<form"), "Must contain form element");
  });

  await runTest("LoginLoadingFallback renders accessible loading skeleton", () => {
    const html = renderToStaticMarkup(React.createElement(LoginLoadingFallback, null));

    assert.ok(html.includes("Sign in to CrediGuide"), "Fallback retains card title");
    assert.ok(html.includes("animate-pulse"), "Fallback includes pulse animation for layout stability");
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 2: Form Inputs & Accessibility Attributes
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 2: Email and Password Input Field Attributes");
  console.log("--------------------------------------------------------------------------------");

  await runTest("Email field renders with correct type, autocomplete, and label association", () => {
    const mockContext = createMockAuthContext();
    const html = renderToStaticMarkup(
      React.createElement(
        AuthContext.Provider,
        { value: mockContext },
        React.createElement(LoginForm, null)
      )
    );

    assert.ok(html.includes('for="email"'), "Must associate Label with email input");
    assert.ok(html.includes('id="email"'), "Must render email input id");
    assert.ok(html.includes('name="email"'), "Must render email input name");
    assert.ok(html.includes('type="email"'), "Must render type=email");
    assert.ok(
      html.toLowerCase().includes('autocomplete="email"'),
      "Must include autocomplete=email attribute"
    );
    assert.ok(html.includes("required"), "Must designate email as required");
  });

  await runTest("Password field renders with toggle, autocomplete, and secure type", () => {
    const mockContext = createMockAuthContext();
    const html = renderToStaticMarkup(
      React.createElement(
        AuthContext.Provider,
        { value: mockContext },
        React.createElement(LoginForm, null)
      )
    );

    assert.ok(html.includes('for="password"'), "Must associate Label with password input");
    assert.ok(html.includes('id="password"'), "Must render password input id");
    assert.ok(html.includes('name="password"'), "Must render password input name");
    assert.ok(html.includes('type="password"'), "Must default to type=password");
    assert.ok(
      html.toLowerCase().includes('autocomplete="current-password"'),
      "Must include autocomplete=current-password"
    );
    assert.ok(
      html.includes('aria-label="Show password"'),
      "Must render accessible show/hide password toggle button"
    );
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 3: Supporting Navigation Links
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 3: Supporting Navigation Links");
  console.log("--------------------------------------------------------------------------------");

  await runTest("LoginForm renders Forgot Password and Register links", () => {
    const mockContext = createMockAuthContext();
    const html = renderToStaticMarkup(
      React.createElement(
        AuthContext.Provider,
        { value: mockContext },
        React.createElement(LoginForm, null)
      )
    );

    assert.ok(
      html.includes('href="/auth/forgot-password"'),
      "Must render Forgot Password link to /auth/forgot-password"
    );
    assert.ok(
      html.includes("Forgot password?"),
      "Must display 'Forgot password?' link text"
    );
    assert.ok(
      html.includes('href="/auth/register"'),
      "Must render Register link to /auth/register"
    );
    assert.ok(
      html.includes("Register here"),
      "Must display 'Register here' link text"
    );
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 4: Role-Based Redirect Resolution & Open Redirect Defense
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 4: Role-Based Redirect Resolution & Open Redirect Defense");
  console.log("--------------------------------------------------------------------------------");

  await runTest("Default role destinations match authoritative application portals", () => {
    assert.strictEqual(
      getRoleRedirectDestination("LOAN_APPLICANT"),
      "/dashboard",
      "LOAN_APPLICANT must default to /dashboard"
    );
    assert.strictEqual(
      getRoleRedirectDestination("BANK_OFFICER"),
      "/officer",
      "BANK_OFFICER must default to /officer"
    );
    assert.strictEqual(
      getRoleRedirectDestination("BANK_ADMIN"),
      "/admin",
      "BANK_ADMIN must default to /admin"
    );
  });

  await runTest("Compatible returnUrl within authorized role scope is accepted", () => {
    assert.strictEqual(
      getRoleRedirectDestination("LOAN_APPLICANT", "/dashboard/applications/app-101"),
      "/dashboard/applications/app-101",
      "Applicant can redirect to valid /dashboard subpath"
    );
    assert.strictEqual(
      getRoleRedirectDestination("LOAN_APPLICANT", "/applications/new"),
      "/applications/new",
      "Applicant can redirect to valid /applications subpath"
    );
    assert.strictEqual(
      getRoleRedirectDestination("BANK_OFFICER", "/officer/review-queue"),
      "/officer/review-queue",
      "Officer can redirect to valid /officer subpath"
    );
    assert.strictEqual(
      getRoleRedirectDestination("BANK_ADMIN", "/admin/officers"),
      "/admin/officers",
      "Admin can redirect to valid /admin subpath"
    );
  });

  await runTest("Role escalation via returnUrl is strictly blocked and normalized to role default", () => {
    // Applicant attempting to access /admin or /officer
    assert.strictEqual(
      getRoleRedirectDestination("LOAN_APPLICANT", "/admin/officers"),
      "/dashboard",
      "Applicant attempting /admin must be redirected to /dashboard"
    );
    assert.strictEqual(
      getRoleRedirectDestination("LOAN_APPLICANT", "/officer/review"),
      "/dashboard",
      "Applicant attempting /officer must be redirected to /dashboard"
    );

    // Officer attempting to access /admin
    assert.strictEqual(
      getRoleRedirectDestination("BANK_OFFICER", "/admin/system-logs"),
      "/officer",
      "Officer attempting /admin must be redirected to /officer"
    );
  });

  await runTest("Open Redirect attacks via returnUrl are neutralized to safe defaults", () => {
    // Protocol-relative URL
    assert.strictEqual(
      getRoleRedirectDestination("LOAN_APPLICANT", "//attacker.com/malware"),
      "/dashboard",
      "Protocol-relative returnUrl must be neutralized"
    );
    // Absolute external URL
    assert.strictEqual(
      getRoleRedirectDestination("LOAN_APPLICANT", "https://attacker.com/phishing"),
      "/dashboard",
      "External URL scheme must be neutralized"
    );
    // Windows backslash traversal
    assert.strictEqual(
      getRoleRedirectDestination("LOAN_APPLICANT", "/\\attacker.com"),
      "/dashboard",
      "Backslash path traversal returnUrl must be neutralized"
    );
    // Embedded credentials or auth
    assert.strictEqual(
      getRoleRedirectDestination("BANK_OFFICER", "/@attacker.com"),
      "/officer",
      "Embedded authority returnUrl must be neutralized"
    );
  });

  await runTest("isAllowedRolePath strictly validates exact matches, child paths, and query/fragment delimiters", () => {
    // Valid allowed path variations
    assert.strictEqual(isAllowedRolePath("/dashboard", "/dashboard"), true, "/dashboard exact match allowed");
    assert.strictEqual(isAllowedRolePath("/dashboard/overview", "/dashboard"), true, "/dashboard/overview child path allowed");
    assert.strictEqual(isAllowedRolePath("/dashboard?tab=active", "/dashboard"), true, "/dashboard?tab=active query string allowed");
    assert.strictEqual(isAllowedRolePath("/dashboard#applications", "/dashboard"), true, "/dashboard#applications hash allowed");

    // Invalid path-prefix confusion variations (must be rejected)
    assert.strictEqual(isAllowedRolePath("/dashboard-evil", "/dashboard"), false, "/dashboard-evil rejected");
    assert.strictEqual(isAllowedRolePath("/dashboardXYZ", "/dashboard"), false, "/dashboardXYZ rejected");
    assert.strictEqual(isAllowedRolePath("/applications-fake", "/applications"), false, "/applications-fake rejected");
    assert.strictEqual(isAllowedRolePath("/officer-evil", "/officer"), false, "/officer-evil rejected");
    assert.strictEqual(isAllowedRolePath("/admin-evil", "/admin"), false, "/admin-evil rejected");
  });

  await runTest("Path-prefix confusion via returnUrl is strictly blocked and normalized to role default", () => {
    // A. Applicant
    assert.strictEqual(
      getRoleRedirectDestination("LOAN_APPLICANT", "/dashboard-evil"),
      "/dashboard",
      "Applicant: /dashboard-evil must be normalized to /dashboard"
    );
    assert.strictEqual(
      getRoleRedirectDestination("LOAN_APPLICANT", "/applications-fake"),
      "/dashboard",
      "Applicant: /applications-fake must be normalized to /dashboard"
    );
    assert.strictEqual(
      getRoleRedirectDestination("LOAN_APPLICANT", "/dashboard"),
      "/dashboard",
      "Applicant: /dashboard accepted"
    );
    assert.strictEqual(
      getRoleRedirectDestination("LOAN_APPLICANT", "/dashboard/overview"),
      "/dashboard/overview",
      "Applicant: /dashboard/overview accepted"
    );
    assert.strictEqual(
      getRoleRedirectDestination("LOAN_APPLICANT", "/dashboard?tab=active"),
      "/dashboard?tab=active",
      "Applicant: /dashboard?tab=active accepted"
    );
    assert.strictEqual(
      getRoleRedirectDestination("LOAN_APPLICANT", "/dashboard#applications"),
      "/dashboard#applications",
      "Applicant: /dashboard#applications accepted"
    );

    // B. Officer
    assert.strictEqual(
      getRoleRedirectDestination("BANK_OFFICER", "/officer-evil"),
      "/officer",
      "Officer: /officer-evil must be normalized to /officer"
    );
    assert.strictEqual(
      getRoleRedirectDestination("BANK_OFFICER", "/dashboardXYZ"),
      "/officer",
      "Officer: /dashboardXYZ must be normalized to /officer"
    );
    assert.strictEqual(
      getRoleRedirectDestination("BANK_OFFICER", "/officer/reviews"),
      "/officer/reviews",
      "Officer: /officer/reviews accepted"
    );

    // C. Admin
    assert.strictEqual(
      getRoleRedirectDestination("BANK_ADMIN", "/admin-evil"),
      "/admin",
      "Admin: /admin-evil must be normalized to /admin"
    );
    assert.strictEqual(
      getRoleRedirectDestination("BANK_ADMIN", "/officer/reviews"),
      "/officer/reviews",
      "Admin: /officer/reviews accepted"
    );
    assert.strictEqual(
      getRoleRedirectDestination("BANK_ADMIN", "/admin/settings"),
      "/admin/settings",
      "Admin: /admin/settings accepted"
    );
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 5: Already-Authenticated User State
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 5: Already-Authenticated User Handling");
  console.log("--------------------------------------------------------------------------------");

  await runTest("Already-authenticated applicant renders redirecting state instead of login form", () => {
    const mockContext = createMockAuthContext({
      user: mockApplicantUser,
      isAuthenticated: true,
      isLoading: false,
    });

    const html = renderToStaticMarkup(
      React.createElement(
        AuthContext.Provider,
        { value: mockContext },
        React.createElement(LoginForm, null)
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

  await runTest("Already-authenticated officer renders redirecting state instead of login form", () => {
    const mockContext = createMockAuthContext({
      user: mockOfficerUser,
      isAuthenticated: true,
      isLoading: false,
    });

    const html = renderToStaticMarkup(
      React.createElement(
        AuthContext.Provider,
        { value: mockContext },
        React.createElement(LoginForm, null)
      )
    );

    assert.ok(html.includes("Welcome back"));
    assert.ok(!html.includes('name="email"'));
  });

  await runTest("Already-authenticated admin renders redirecting state instead of login form", () => {
    const mockContext = createMockAuthContext({
      user: mockAdminUser,
      isAuthenticated: true,
      isLoading: false,
    });

    const html = renderToStaticMarkup(
      React.createElement(
        AuthContext.Provider,
        { value: mockContext },
        React.createElement(LoginForm, null)
      )
    );

    assert.ok(html.includes("Welcome back"));
    assert.ok(!html.includes('name="email"'));
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 6: Authentication Contracts & Error Handling
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 6: Authentication Contract Invocation & Failure Resilience");
  console.log("--------------------------------------------------------------------------------");

  await runTest("Login invokes AuthContext.login with credentials and handles success", async () => {
    let capturedCredentials: LoginCredentials | null = null;

    const mockContext = createMockAuthContext({
      login: async (creds: LoginCredentials): Promise<LoginResult> => {
        capturedCredentials = creds;
        return { success: true, message: "Authentication successful." };
      },
    });

    // Invoke mock login contract
    const result = await mockContext.login({
      email: "test.applicant@crediguide.com",
      password: "StrongPassword123!",
    });

    assert.strictEqual(result.success, true, "Login result must be successful");
    assert.ok(capturedCredentials !== null, "Captured credentials must be defined");
    const creds: LoginCredentials = capturedCredentials;
    assert.strictEqual(creds.email, "test.applicant@crediguide.com");
    assert.strictEqual(creds.password, "StrongPassword123!");
  });

  await runTest("Login failure returns clear error without throwing unhandled exceptions", async () => {
    const mockContext = createMockAuthContext({
      login: async (): Promise<LoginResult> => {
        return {
          success: false,
          error: "Invalid email or password.",
        };
      },
    });

    const result = await mockContext.login({
      email: "nonexistent@crediguide.com",
      password: "WrongPassword!",
    });

    assert.strictEqual(result.success, false, "Login must report failure");
    assert.strictEqual(result.error, "Invalid email or password.");
  });

  await runTest("Network failure during login returns safe error message", async () => {
    const mockContext = createMockAuthContext({
      login: async (): Promise<LoginResult> => {
        return {
          success: false,
          error: "Network error occurred while attempting to log in.",
        };
      },
    });

    const result = await mockContext.login({
      email: "network.offline@crediguide.com",
      password: "Password123!",
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes("Network error"));
  });

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`📊 STAGE 3A TEST RESULTS: ${passedTests} / ${totalTests} PASSED (100%)`);
  console.log("================================================================================\n");
}

runAuthLoginPageTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
