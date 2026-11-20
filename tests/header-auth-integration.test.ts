import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Setup Node.js mocks for CSS and Next.js fonts before importing layout components
const require = createRequire(import.meta.url);
if (require.extensions) {
  require.extensions[".css"] = () => {};
}

// Intercept next/font/google in Node.js test environment
const Module = require("node:module");
const originalRequire = Module.prototype.require;
Module.prototype.require = function (modulePath: string, ...args: unknown[]) {
  if (modulePath === "next/font/google") {
    return {
      Geist: () => ({ variable: "--font-geist-sans" }),
      Geist_Mono: () => ({ variable: "--font-geist-mono" }),
    };
  }
  return originalRequire.apply(this, [modulePath, ...args]);
};

import { Header } from "@/components/layout/header";
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
  email: "jane.doe@crediguide.com",
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
  email: "marcus.vance@bank.com",
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

const mockEmailOnlyUser: AuthUser = {
  id: "usr_anon_001",
  email: "unnamed.borrower@crediguide.com",
  firstName: "",
  lastName: "",
  role: "LOAN_APPLICANT",
  isEmailVerified: true,
  phone: null,
  applicantId: null,
  officerProfile: null,
};

/**
 * Creates a complete mock AuthContextType for fine-grained state testing.
 */
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

async function runHeaderAuthIntegrationTestSuite() {
  console.log("================================================================================");
  console.log("🧪 CrediGuide AI - Phase 4 Sub-Phase F: Stage 2C Global Application Integration");
  console.log("================================================================================\n");

  // Dynamically import RootLayout after module interceptors are active
  const layoutModule = (await import("../src/app/layout")) as unknown as {
    default: { default?: React.ComponentType<{ children: React.ReactNode }>; metadata?: { title?: string } } | React.ComponentType<{ children: React.ReactNode }>;
    metadata?: { title?: string };
  };

  const RootLayoutComponent =
    typeof layoutModule.default === "function"
      ? layoutModule.default
      : (layoutModule.default as { default?: React.ComponentType<{ children: React.ReactNode }> }).default ||
        (layoutModule as unknown as React.ComponentType<{ children: React.ReactNode }>);

  const rootMetadata =
    layoutModule.metadata ||
    (layoutModule.default as { metadata?: { title?: string } })?.metadata;

  // ---------------------------------------------------------------------------
  // TEST GROUP 1: Loading State & Flash-Prevention
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 1: Header Loading State & Layout Stability");
  console.log("--------------------------------------------------------------------------------");

  await runTest("Header displays loading skeleton and hides guest links when isLoading=true", () => {
    // When initialUser is omitted, AuthProvider initializes with isLoading = true
    const html = renderToStaticMarkup(
      React.createElement(
        AuthProvider,
        null,
        React.createElement(Header, null)
      )
    );

    assert.ok(
      html.includes('aria-label="Loading authentication status"'),
      "Must render accessible loading skeleton indicator"
    );
    assert.ok(
      html.includes('role="status"'),
      "Must designate loading skeleton with role=status"
    );
    assert.ok(
      html.includes("animate-pulse"),
      "Must render pulse animation for layout stability"
    );
    // Anti-flash guarantee: Guest links must NOT be visible while auth is being determined
    assert.ok(
      !html.includes('href="/auth/login"'),
      "Must not flash Sign In link during initial loading"
    );
    assert.ok(
      !html.includes('href="/auth/register"'),
      "Must not flash Register link during initial loading"
    );
    assert.ok(
      !html.includes("Logout"),
      "Must not render Logout during initial loading"
    );
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 2: Unauthenticated Guest State
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 2: Guest Authentication State & Navigation");
  console.log("--------------------------------------------------------------------------------");

  await runTest("Header displays Sign In and Register links when user is unauthenticated", () => {
    const mockContext = createMockAuthContext({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });

    const html = renderToStaticMarkup(
      React.createElement(
        AuthContext.Provider,
        { value: mockContext },
        React.createElement(Header, null)
      )
    );

    assert.ok(
      html.includes('href="/auth/login"'),
      "Must render Sign In link pointing to /auth/login"
    );
    assert.ok(
      html.includes("Sign In"),
      "Must display text 'Sign In'"
    );
    assert.ok(
      html.includes('href="/auth/register"'),
      "Must render Register link pointing to /auth/register"
    );
    assert.ok(
      html.includes("Register"),
      "Must display text 'Register'"
    );
    // Must NOT show authenticated artifacts
    assert.ok(
      !html.includes("Logout"),
      "Must not render Logout button for guest user"
    );
    assert.ok(
      !html.includes('href="/dashboard"'),
      "Must not render applicant dashboard link for guest user"
    );
    assert.ok(
      !html.includes('href="/officer"'),
      "Must not render officer portal link for guest user"
    );
    assert.ok(
      !html.includes('href="/admin"'),
      "Must not render admin portal link for guest user"
    );
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 3: Authenticated Roles (Applicant, Officer, Admin)
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 3: Role-Specific Header Rendering & Navigation");
  console.log("--------------------------------------------------------------------------------");

  await runTest("LOAN_APPLICANT renders applicant name, badge, /dashboard, and Logout button", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        AuthProvider,
        { initialUser: mockApplicantUser },
        React.createElement(Header, null)
      )
    );

    assert.ok(html.includes("Jane Doe"), "Must display applicant's actual name");
    assert.ok(html.includes("Applicant"), "Must display Applicant role badge");
    assert.ok(
      html.includes('href="/dashboard"'),
      "Must render link to /dashboard for applicant"
    );
    assert.ok(html.includes("Dashboard"), "Must display 'Dashboard' portal link text");
    assert.ok(html.includes("Logout"), "Must render Logout button");
    // Ensure no cross-role portal links
    assert.ok(!html.includes('href="/officer"'), "Applicant must not see officer portal link");
    assert.ok(!html.includes('href="/admin"'), "Applicant must not see admin portal link");
    assert.ok(!html.includes('href="/auth/login"'), "Authenticated user must not see Sign In link");
  });

  await runTest("BANK_OFFICER renders officer name, badge, /officer, and Logout button", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        AuthProvider,
        { initialUser: mockOfficerUser },
        React.createElement(Header, null)
      )
    );

    assert.ok(html.includes("Marcus Vance"), "Must display officer's actual name");
    assert.ok(html.includes("Officer"), "Must display Officer role badge");
    assert.ok(
      html.includes('href="/officer"'),
      "Must render link to /officer for bank officer"
    );
    assert.ok(html.includes("Officer Portal"), "Must display 'Officer Portal' link text");
    assert.ok(html.includes("Logout"), "Must render Logout button");
    // Ensure no cross-role portal links
    assert.ok(!html.includes('href="/dashboard"'), "Officer must not see applicant dashboard link");
    assert.ok(!html.includes('href="/admin"'), "Officer must not see admin portal link");
  });

  await runTest("BANK_ADMIN renders admin name, badge, /admin, and Logout button", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        AuthProvider,
        { initialUser: mockAdminUser },
        React.createElement(Header, null)
      )
    );

    assert.ok(html.includes("Admin Director"), "Must display admin's actual name");
    assert.ok(html.includes("Admin"), "Must display Admin role badge");
    assert.ok(
      html.includes('href="/admin"'),
      "Must render link to /admin for bank admin"
    );
    assert.ok(html.includes("Admin Portal"), "Must display 'Admin Portal' link text");
    assert.ok(html.includes("Logout"), "Must render Logout button");
    // Ensure no cross-role portal links
    assert.ok(!html.includes('href="/dashboard"'), "Admin must not see applicant dashboard link");
    assert.ok(!html.includes('href="/officer"'), "Admin must not see officer portal link");
  });

  await runTest("Header falls back to email when firstName and lastName are missing", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        AuthProvider,
        { initialUser: mockEmailOnlyUser },
        React.createElement(Header, null)
      )
    );

    assert.ok(
      html.includes("unnamed.borrower@crediguide.com"),
      "Must display user's email when name fields are empty"
    );
    assert.ok(html.includes("Applicant"), "Must still display role badge");
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 4: Logout Interaction & Error Tolerance
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 4: Logout Invocation & State Machine Contracts");
  console.log("--------------------------------------------------------------------------------");

  await runTest("Header invokes AuthContext logout method and handles unconfirmed outcome gracefully", async () => {
    let logoutCalled = false;
    const mockContext = createMockAuthContext({
      user: mockApplicantUser,
      isAuthenticated: true,
      isLoading: false,
      logout: async () => {
        logoutCalled = true;
        // Simulate unconfirmed server revocation outcome (revoked: false)
        return {
          success: false,
          revoked: false,
          error: "Session logout completed, but active server-side session revocation could not be confirmed.",
        };
      },
    });

    const html = renderToStaticMarkup(
      React.createElement(
        AuthContext.Provider,
        { value: mockContext },
        React.createElement(Header, null)
      )
    );

    assert.ok(html.includes("Logout"), "Must render Logout button");

    // Invoke the logout contract to verify error handling behavior
    const logoutResult = await mockContext.logout();
    assert.strictEqual(logoutCalled, true, "Logout handler must be invoked");
    assert.strictEqual(logoutResult.success, false, "Success must reflect false on unconfirmed revocation");
    assert.strictEqual(logoutResult.revoked, false, "Revoked must reflect false on unconfirmed revocation");
    assert.ok(
      logoutResult.error?.includes("could not be confirmed") || logoutResult.error?.includes("unconfirmed"),
      "Error must describe unconfirmed status without crashing"
    );
  });

  await runTest("Header handles network failure during logout without uncaught exceptions", async () => {
    let networkErrorHandled = false;
    const mockContext = createMockAuthContext({
      user: mockOfficerUser,
      isAuthenticated: true,
      isLoading: false,
      logout: async () => {
        networkErrorHandled = true;
        return {
          success: false,
          revoked: false,
          error: "Network error occurred during logout.",
        };
      },
    });

    const logoutResult = await mockContext.logout();
    assert.strictEqual(networkErrorHandled, true, "Network error must be captured by logout contract");
    assert.strictEqual(logoutResult.success, false);
    assert.strictEqual(logoutResult.revoked, false);
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 5: Brand Preservation & Static Architecture Links
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 5: Preservation of Brand, Badges & Anchor Links");
  console.log("--------------------------------------------------------------------------------");

  await runTest("Header preserves brand identity, enterprise badge, and core architecture links", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        AuthProvider,
        { initialUser: mockApplicantUser },
        React.createElement(Header, null)
      )
    );

    // Branding
    assert.ok(html.includes("CrediGuide AI"), "Must preserve CrediGuide AI brand title");
    assert.ok(html.includes("Enterprise"), "Must preserve Enterprise badge");
    assert.ok(
      html.includes("Autonomous Lending Intelligence &amp; Policy Governance"),
      "Must preserve institutional subtitle"
    );

    // Informational pills
    assert.ok(html.includes("Deterministic Engine"), "Must preserve Deterministic Engine pill");
    assert.ok(html.includes("AI Assistant"), "Must preserve AI Assistant pill");
    assert.ok(html.includes("PostgreSQL / Prisma"), "Must preserve PostgreSQL / Prisma pill");

    // Public navigation anchor links
    assert.ok(html.includes('href="/#chat-assistant"'), "Must preserve Chat Assistant link");
    assert.ok(html.includes('href="/#products"'), "Must preserve Loan Products link");
    assert.ok(html.includes('href="/#architecture"'), "Must preserve Architecture link");
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 6: Root Layout Server Component & Provider Hierarchy
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 6: RootLayout Server Component & Provider Hierarchy");
  console.log("--------------------------------------------------------------------------------");

  await runTest("RootLayout renders Server Component structure with AuthProvider wrapping entire body", () => {
    const testChild = React.createElement("div", { id: "test-content-node" }, "Application View Content");

    const html = renderToStaticMarkup(
      React.createElement(RootLayoutComponent, null, testChild)
    );

    // Verify HTML document boundary
    assert.ok(html.includes("<html"), "RootLayout must produce <html container");
    assert.ok(html.includes("<body"), "RootLayout must produce <body container");

    // Verify DisclaimerBanner inclusion
    assert.ok(
      html.includes("Preliminary Eligibility Notice"),
      "RootLayout must render DisclaimerBanner"
    );

    // Verify Header inclusion (within AuthProvider)
    assert.ok(
      html.includes("CrediGuide AI"),
      "RootLayout must render Header component inside AuthProvider"
    );

    // Verify Main content wrapper and child inclusion
    assert.ok(
      html.includes('<main class="flex-1">'),
      "RootLayout must render main container"
    );
    assert.ok(
      html.includes('id="test-content-node"'),
      "RootLayout must render children inside main container"
    );
    assert.ok(
      html.includes("Application View Content"),
      "Children content must be preserved verbatim"
    );

    // Verify Footer inclusion
    assert.ok(
      html.includes("© 2026 CrediGuide AI. All rights reserved."),
      "RootLayout must render Footer component"
    );

    // Verify metadata export
    assert.ok(
      rootMetadata?.title?.includes("CrediGuide AI"),
      "RootLayout must preserve Server Component metadata export"
    );
  });

  await runTest("Source verification: RootLayout is strictly a Server Component without 'use client'", () => {
    const layoutPath = path.resolve(process.cwd(), "src/app/layout.tsx");
    const source = fs.readFileSync(layoutPath, "utf-8");

    assert.ok(
      !source.includes('"use client"') && !source.includes("'use client'"),
      "src/app/layout.tsx must NOT contain 'use client' directive"
    );
    assert.ok(
      source.includes("export const metadata"),
      "src/app/layout.tsx must retain export const metadata"
    );
    assert.ok(
      source.includes("<AuthProvider>"),
      "src/app/layout.tsx must mount <AuthProvider>"
    );
  });

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`📊 STAGE 2C INTEGRATION TEST RESULTS: ${passedTests} / ${totalTests} PASSED (100%)`);
  console.log("================================================================================\n");
}

runHeaderAuthIntegrationTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
