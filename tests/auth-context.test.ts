import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AuthProvider,
  useAuth,
  isValidAuthUser,
  isValidOfficerProfile,
  setupSessionSync,
  shouldTriggerSync,
  type AuthContextType,
  type AuthUser,
} from "@/contexts/auth-context";

let passedCount = 0;
let totalCount = 0;

async function runTest(name: string, fn: () => void | Promise<void>) {
  totalCount++;
  try {
    const result = fn();
    if (result instanceof Promise) {
      await result;
    }
    passedCount++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(err);
    throw err;
  }
}

const mockApplicantUser: AuthUser = {
  id: "usr_applicant_001",
  email: "applicant@crediguide.com",
  firstName: "Jane",
  lastName: "Doe",
  role: "LOAN_APPLICANT",
  isEmailVerified: true,
  phone: "+1-555-0199",
  applicantId: "app_profile_001",
  officerProfile: null,
};

const mockOfficerUser: AuthUser = {
  id: "usr_officer_001",
  email: "officer@bank.com",
  firstName: "Marcus",
  lastName: "Vance",
  role: "BANK_OFFICER",
  isEmailVerified: true,
  phone: "+1-555-0200",
  applicantId: null,
  officerProfile: {
    id: "off_profile_001",
    employeeCode: "EMP-4491",
    department: "Commercial Underwriting",
    branchCode: "BR-NORTH",
    designation: "Senior Credit Officer",
    approvalLimitAmount: 5000000,
  },
};

function captureContext(providerProps?: {
  initialUser?: AuthUser | null;
  onUserChange?: (user: AuthUser | null) => void;
}): AuthContextType {
  let captured: AuthContextType | null = null;
  let liveUser: AuthUser | null = providerProps?.initialUser ?? null;

  function Consumer() {
    captured = useAuth();
    return React.createElement("div", { "data-ready": "true" }, "Ready");
  }

  renderToStaticMarkup(
    React.createElement(
      AuthProvider,
      {
        ...providerProps,
        onUserChange: (u) => {
          liveUser = u;
          providerProps?.onUserChange?.(u);
        },
      },
      React.createElement(Consumer)
    )
  );

  if (!captured) {
    throw new Error("Failed to capture AuthContext during renderToStaticMarkup");
  }

  const baseCaptured = captured as AuthContextType;

  return {
    ...baseCaptured,
    get user() {
      return liveUser;
    },
    get isAuthenticated() {
      return Boolean(liveUser);
    },
  };
}

// Minimal mock event target for testing window and document events in Node.js
class MockEventTarget {
  listeners: Record<string, Array<() => void>> = {};

  addEventListener(event: string, fn: () => void) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(fn);
  }

  removeEventListener(event: string, fn: () => void) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((f) => f !== fn);
  }

  dispatchEvent(event: string) {
    const list = this.listeners[event] || [];
    for (const fn of [...list]) {
      fn();
    }
  }

  listenerCount(event: string): number {
    return (this.listeners[event] || []).length;
  }
}

async function runAllTests() {
  console.log("================================================================================");
  console.log("🧪 CrediGuide AI - Phase 4 Sub-Phase F: Stage 2B.3.3 Strict Login Queue Test Suite");
  console.log("================================================================================\n");

  // ---------------------------------------------------------------------------
  // GROUP 1: Hook Isolation, Initial State & Runtime Validation
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 1: Hook Isolation, Initial State & Runtime Validation");
  console.log("--------------------------------------------------------------------------------");

  await runTest("useAuth throws descriptive error when invoked outside AuthProvider", () => {
    function OrphanConsumer() {
      useAuth();
      return null;
    }

    assert.throws(
      () => {
        renderToStaticMarkup(React.createElement(OrphanConsumer));
      },
      (err: unknown) => {
        return (
          err instanceof Error &&
          err.message.includes("useAuth must be used within an AuthProvider")
        );
      },
      "Must throw error with exact guard message"
    );
  });

  await runTest("AuthProvider initializes in loading state when initialUser is omitted", () => {
    const auth = captureContext();

    assert.strictEqual(auth.user, null, "User must be null by default");
    assert.strictEqual(auth.isAuthenticated, false, "Must not be authenticated");
    assert.strictEqual(auth.isLoading, true, "Must start in loading state");
    assert.strictEqual(auth.error, null, "Error must start null");
    assert.strictEqual(typeof auth.login, "function", "login method must exist");
    assert.strictEqual(typeof auth.logout, "function", "logout method must exist");
    assert.strictEqual(typeof auth.refreshUser, "function", "refreshUser method must exist");
  });

  await runTest("AuthProvider initializes immediately when initialUser is supplied", () => {
    const auth = captureContext({ initialUser: mockApplicantUser });

    assert.deepStrictEqual(auth.user, mockApplicantUser, "User must match initialUser");
    assert.strictEqual(auth.isAuthenticated, true, "Must be authenticated");
    assert.strictEqual(auth.isLoading, false, "Must not be loading when initialUser is provided");
    assert.strictEqual(auth.error, null, "Error must be null");
  });

  await runTest("AuthProvider preserves complex officerProfile attributes", () => {
    const auth = captureContext({ initialUser: mockOfficerUser });

    assert.strictEqual(auth.user?.role, "BANK_OFFICER");
    assert.strictEqual(auth.user?.officerProfile?.employeeCode, "EMP-4491");
    assert.strictEqual(auth.user?.officerProfile?.approvalLimitAmount, 5000000);
  });

  await runTest("Runtime validator isValidAuthUser accepts valid profiles and rejects malformed payloads", () => {
    // Valid cases
    assert.strictEqual(isValidAuthUser(mockApplicantUser), true, "Valid applicant must pass");
    assert.strictEqual(isValidAuthUser(mockOfficerUser), true, "Valid officer must pass");

    // Invalid cases
    assert.strictEqual(isValidAuthUser(null), false, "null must fail");
    assert.strictEqual(isValidAuthUser({}), false, "Empty object must fail");
    assert.strictEqual(isValidAuthUser({ ...mockApplicantUser, id: "" }), false, "Empty id must fail");
    assert.strictEqual(isValidAuthUser({ ...mockApplicantUser, email: "not-an-email" }), false, "Invalid email must fail");
    assert.strictEqual(isValidAuthUser({ ...mockApplicantUser, role: "UNAUTHORIZED_ROLE" }), false, "Invalid role must fail");
    assert.strictEqual(isValidAuthUser({ ...mockApplicantUser, role: "SUPER_ADMIN" }), false, "Unknown role must fail");
    assert.strictEqual(isValidAuthUser({ ...mockApplicantUser, isEmailVerified: "true" }), false, "Non-boolean isEmailVerified must fail");

    // Officer profile validation
    assert.strictEqual(isValidOfficerProfile(null), true, "null officerProfile is valid for applicants");
    assert.strictEqual(isValidOfficerProfile({}), false, "Empty officerProfile must fail");
    assert.strictEqual(isValidOfficerProfile({ ...mockOfficerUser.officerProfile, approvalLimitAmount: "5000000" }), false, "Non-numeric limit must fail");
  });

  // ---------------------------------------------------------------------------
  // GROUP 2: Login Success & Mandatory User Verification
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 2: Login Success & Mandatory User Verification");
  console.log("--------------------------------------------------------------------------------");

  await runTest("login dispatches POST /api/auth/login and establishes user only after valid /me retrieval", async () => {
    const originalFetch = globalThis.fetch;
    const fetchCalls: Array<{ url: string; method?: string; body?: unknown }> = [];

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      let parsedBody: unknown = undefined;
      if (typeof init?.body === "string") {
        try {
          parsedBody = JSON.parse(init.body);
        } catch {
          parsedBody = init.body;
        }
      }

      fetchCalls.push({ url, method: init?.method, body: parsedBody });

      if (url.includes("/api/auth/login")) {
        return new Response(
          JSON.stringify({
            success: true,
            message: "Authentication successful.",
            user: { id: mockApplicantUser.id, email: mockApplicantUser.email },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.includes("/api/auth/me")) {
        return new Response(
          JSON.stringify({
            success: true,
            user: mockApplicantUser,
            session: { id: "sess_123", expiresAt: new Date().toISOString() },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response("Not found", { status: 404 });
    };

    try {
      const auth = captureContext();
      const result = await auth.login({
        email: "applicant@crediguide.com",
        password: "ValidPassword123!",
      });

      assert.strictEqual(result.success, true, "Login must report success");
      assert.strictEqual(result.message, "Authentication successful.");

      assert.strictEqual(fetchCalls.length, 2, "Must call login then /me");
      assert.strictEqual(fetchCalls[0].url, "/api/auth/login");
      assert.strictEqual(fetchCalls[0].method, "POST");
      assert.deepStrictEqual(fetchCalls[0].body, {
        email: "applicant@crediguide.com",
        password: "ValidPassword123!",
      });
      assert.strictEqual(fetchCalls[1].url, "/api/auth/me");
      assert.strictEqual(fetchCalls[1].method, "GET");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await runTest("login returns failure when /api/auth/login returns 200 but /api/auth/me returns 401", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/login")) {
        return new Response(
          JSON.stringify({ success: true, message: "Credentials accepted" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/api/auth/me")) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "UNAUTHENTICATED",
            message: "Session cookie not recognized.",
          }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    try {
      const auth = captureContext();
      const result = await auth.login({
        email: "applicant@crediguide.com",
        password: "ValidPassword123!",
      });

      assert.strictEqual(result.success, false, "Login must FAIL if subsequent /me returns 401");
      assert.ok(
        result.error?.includes("failed to establish verified session profile") ||
        result.error?.includes("Session cookie not recognized"),
        "Must provide sanitized failure message"
      );
      assert.strictEqual(auth.user, null, "User must remain null in context");
      assert.strictEqual(auth.isAuthenticated, false, "Must not be authenticated");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await runTest("login returns failure when /api/auth/login returns 200 but /api/auth/me returns 500", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/login")) {
        return new Response(
          JSON.stringify({ success: true, message: "Credentials accepted" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/api/auth/me")) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "INTERNAL_SERVER_ERROR",
            message: "Database connection failed while loading profile.",
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    try {
      const auth = captureContext();
      const result = await auth.login({
        email: "applicant@crediguide.com",
        password: "ValidPassword123!",
      });

      assert.strictEqual(result.success, false, "Login must FAIL if /me returns 500");
      assert.ok(result.error?.includes("Database connection failed"), "Error message must reflect server error");
      assert.strictEqual(auth.user, null, "User must remain null in context");
      assert.strictEqual(auth.isAuthenticated, false, "Must not be authenticated");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await runTest("login returns failure when /api/auth/login returns 200 but /api/auth/me returns malformed response", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/login")) {
        return new Response(
          JSON.stringify({ success: true, message: "Credentials accepted" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/api/auth/me")) {
        return new Response(
          JSON.stringify({
            success: true,
            user: { id: "u1", role: "MALFORMED_ROLE" }, // Missing email, firstName, lastName, invalid role
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    try {
      const auth = captureContext();
      const result = await auth.login({
        email: "applicant@crediguide.com",
        password: "ValidPassword123!",
      });

      assert.strictEqual(result.success, false, "Login must FAIL if /me returns structurally malformed profile");
      assert.ok(result.error?.includes("Malformed user profile"), "Must report malformed profile error");
      assert.strictEqual(auth.user, null, "User must not be populated with malformed profile");
      assert.strictEqual(auth.isAuthenticated, false, "Must not be authenticated");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await runTest("failed login with 401 INVALID_CREDENTIALS preserves unauthenticated state", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          success: false,
          error: "INVALID_CREDENTIALS",
          message: "Invalid email or password.",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    };

    try {
      const auth = captureContext();
      const result = await auth.login({
        email: "bad@crediguide.com",
        password: "WrongPassword123!",
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, "Invalid email or password.");
      assert.strictEqual(auth.user, null, "User must remain null");
      assert.strictEqual(auth.isAuthenticated, false, "Must not be authenticated");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // ---------------------------------------------------------------------------
  // GROUP 3: Concurrency, Sequencing & Race-Condition Defense
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 3: Concurrency, Sequencing & Race-Condition Defense");
  console.log("--------------------------------------------------------------------------------");

  await runTest("login followed immediately by logout leaves context completely unauthenticated", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/login")) {
        return new Response(
          JSON.stringify({ success: true, message: "Logged in" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/api/auth/logout")) {
        return new Response(
          JSON.stringify({ success: true, message: "Logged out", revoked: true }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/api/auth/me")) {
        return new Response(
          JSON.stringify({ success: true, user: mockApplicantUser }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    try {
      const auth = captureContext();
      const loginPromise = auth.login({ email: "applicant@crediguide.com", password: "Password123!" });
      const logoutPromise = auth.logout();

      const [, logoutResult] = await Promise.all([loginPromise, logoutPromise]);

      assert.strictEqual(logoutResult.success, true, "Logout must report success");
      assert.strictEqual(auth.user, null, "Context user must be null");
      assert.strictEqual(auth.isAuthenticated, false, "Must not be authenticated");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await runTest(
    "logout during in-flight login serializes network requests: login settles before logout dispatches",
    async () => {
      const originalFetch = globalThis.fetch;
      const timeline: string[] = [];
      let resolveLoginFetch: (res: Response) => void = () => {};
      let meCalled = false;

      const loginFetchPromise = new Promise<Response>((resolve) => {
        resolveLoginFetch = resolve;
      });

      globalThis.fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/login")) {
          timeline.push("login_start");
          const response = await loginFetchPromise;
          timeline.push("login_finish");
          return response;
        }
        if (url.includes("/api/auth/logout")) {
          timeline.push("logout_start");
          const response = new Response(
            JSON.stringify({ success: true, message: "Logged out successfully", revoked: true }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
          timeline.push("logout_finish");
          return response;
        }
        if (url.includes("/api/auth/me")) {
          meCalled = true;
          return new Response(
            JSON.stringify({ success: true, user: mockApplicantUser }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("Not found", { status: 404 });
      };

      try {
        const auth = captureContext();
        assert.strictEqual(auth.user, null, "User initially null");

        // 1. Dispatch login (will block on loginFetchPromise)
        const loginPromise = auth.login({
          email: "applicant@crediguide.com",
          password: "Password123!",
        });

        // Verify login has started on the wire
        assert.deepStrictEqual(timeline, ["login_start"], "Login request must be in-flight");

        // 2. Dispatch logout while login is still waiting on the network
        const logoutPromise = auth.logout();

        // Immediate optimistic clear: user must be null immediately
        assert.strictEqual(auth.user, null, "User must be null immediately upon calling logout");
        assert.strictEqual(auth.isAuthenticated, false, "isAuthenticated must be false immediately");

        // Logout must NOT have dispatched yet because it's awaiting login settlement
        assert.deepStrictEqual(
          timeline,
          ["login_start"],
          "Logout must not dispatch fetch until login settles"
        );

        // 3. Now resolve the in-flight login request
        resolveLoginFetch(
          new Response(
            JSON.stringify({ success: true, message: "Login successful" }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Set-Cookie": "auth_token=mock_session_cookie; Path=/; HttpOnly; SameSite=Lax",
              },
            }
          )
        );

        // Await both operations
        const [loginResult, logoutResult] = await Promise.all([loginPromise, logoutPromise]);

        // 4. Verify timeline ordering: login_start -> login_finish -> logout_start -> logout_finish
        assert.deepStrictEqual(timeline, [
          "login_start",
          "login_finish",
          "logout_start",
          "logout_finish",
        ]);

        // 5. Verify /api/auth/me was NEVER called by the superseded login
        assert.strictEqual(meCalled, false, "Superseded login must never call /api/auth/me");

        // 6. Verify return values
        assert.strictEqual(loginResult.success, false, "Login must report success: false (superseded)");
        assert.ok(
          loginResult.error?.includes("superseded"),
          `Expected superseded error message, got: ${loginResult.error}`
        );
        assert.strictEqual(logoutResult.success, true, "Logout must report success: true");

        // 7. Verify frontend auth state remains null
        assert.strictEqual(auth.user, null, "Context user must remain null");
        assert.strictEqual(auth.isAuthenticated, false, "Must remain unauthenticated");
      } finally {
        globalThis.fetch = originalFetch;
      }
    }
  );

  await runTest("older delayed login completion cannot restore user after newer logout", async () => {
    const originalFetch = globalThis.fetch;
    let resolveLoginFetch: (res: Response) => void = () => {};

    const loginResponsePromise = new Promise<Response>((resolve) => {
      resolveLoginFetch = resolve;
    });

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/login")) {
        return loginResponsePromise;
      }
      if (url.includes("/api/auth/logout")) {
        return new Response(
          JSON.stringify({ success: true, message: "Logged out", revoked: true }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/api/auth/me")) {
        return new Response(
          JSON.stringify({ success: true, user: mockApplicantUser }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    try {
      const auth = captureContext();
      // 1. Dispatch login (which remains pending on the wire)
      const loginPromise = auth.login({ email: "applicant@crediguide.com", password: "Password123!" });

      // 2. Schedule delayed login response to resolve shortly while logout is awaiting it
      const timer = setTimeout(() => {
        resolveLoginFetch(
          new Response(
            JSON.stringify({ success: true, message: "Delayed login 200" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }, 15);

      // 3. Dispatch logout while login is still waiting on the network
      const logoutResult = await auth.logout();
      clearTimeout(timer);

      assert.strictEqual(logoutResult.success, true, "Logout completed successfully");
      assert.strictEqual(auth.user, null, "User is cleared by logout");

      const loginResult = await loginPromise;

      // 4. Verify login recognizes it was superseded and did NOT resurrect the user
      assert.strictEqual(loginResult.success, false, "Superseded login must report failure");
      assert.strictEqual(auth.user, null, "User must remain null in context; older login must not restore session");
      assert.strictEqual(auth.isAuthenticated, false, "Must remain unauthenticated");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await runTest(
    "login resolving after logout timeout triggers automatic session cleanup and preserves unauthenticated state",
    async () => {
      const originalFetch = globalThis.fetch;
      const originalSetTimeout = globalThis.setTimeout;

      const timeline: string[] = [];
      let resolveDelayedLogin: (res: Response) => void = () => {};
      let meCalled = false;

      const delayedLoginPromise = new Promise<Response>((resolve) => {
        resolveDelayedLogin = resolve;
      });

      // Mock setTimeout so that the LOGIN_WAIT_TIMEOUT_MS timeout fires in 10ms instead of 8000ms
      (globalThis as unknown as Record<string, unknown>).setTimeout = (
        fn: (...args: unknown[]) => void,
        ms?: number,
        ...args: unknown[]
      ) => {
        if (typeof ms === "number" && ms >= 8000) {
          return originalSetTimeout(fn, 10, ...args);
        }
        return originalSetTimeout(fn, ms, ...args);
      };

      let logoutCount = 0;
      globalThis.fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/login")) {
          timeline.push("login_start");
          const response = await delayedLoginPromise;
          timeline.push("login_resolved");
          return response;
        }
        if (url.includes("/api/auth/logout")) {
          logoutCount++;
          if (logoutCount === 1) {
            // First logout: fired by auth.logout() after 8s timeout elapsed
            // At this point, cookie has NOT arrived yet, so backend returns revoked: false
            timeline.push("logout_timeout_dispatch");
            return new Response(
              JSON.stringify({ success: true, message: "Logged out without active cookie", revoked: false }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          } else {
            // Second logout: fired by late login cleanup handler
            // Now cookie is present, so backend returns revoked: true
            timeline.push("late_cleanup_dispatch");
            return new Response(
              JSON.stringify({ success: true, message: "Orphaned session revoked successfully", revoked: true }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
        }
        if (url.includes("/api/auth/me")) {
          meCalled = true;
          return new Response(
            JSON.stringify({ success: true, user: mockApplicantUser }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("Not found", { status: 404 });
      };

      try {
        const auth = captureContext();

        // 1. Dispatch login that will hang past timeout
        const loginPromise = auth.login({
          email: "applicant@crediguide.com",
          password: "Password123!",
        });

        // 2. Dispatch logout while login is still waiting
        const logoutResult = await auth.logout();

        // Logout timed out before login finished. Since cookie was absent, revoked: false -> success: false
        assert.strictEqual(logoutResult.success, false, "Timed-out logout without cookie returns unconfirmed failure");
        assert.strictEqual(logoutResult.revoked, false, "revoked must be false");
        assert.ok(logoutResult.error?.includes("could not be confirmed"));
        assert.strictEqual(auth.user, null, "Frontend user state must be null");

        // 3. Now, the delayed login HTTP response arrives from the server!
        resolveDelayedLogin(
          new Response(
            JSON.stringify({ success: true, message: "Delayed login 200" }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Set-Cookie": "crediguide_session=late_token; Path=/; HttpOnly; SameSite=Lax",
              },
            }
          )
        );

        // Await login completion
        const loginResult = await loginPromise;

        // 4. Assert late login recognized it was superseded and reported failure
        assert.strictEqual(loginResult.success, false, "Late login must fail because it was superseded");
        assert.ok(loginResult.error?.includes("superseded"));

        // 5. Assert automatic cleanup was dispatched!
        assert.strictEqual(logoutCount, 2, "Automatic cleanup POST /api/auth/logout must have been triggered");

        // 6. Assert timeline order: login_start -> logout_timeout_dispatch -> login_resolved -> late_cleanup_dispatch
        assert.deepStrictEqual(timeline, [
          "login_start",
          "logout_timeout_dispatch",
          "login_resolved",
          "late_cleanup_dispatch",
        ]);

        // 7. Verify /api/auth/me was NEVER called
        assert.strictEqual(meCalled, false, "Late login must never call /api/auth/me");

        // 8. Verify frontend auth state remains null
        assert.strictEqual(auth.user, null, "Context user must remain null");
        assert.strictEqual(auth.isAuthenticated, false, "Must remain unauthenticated");
      } finally {
        globalThis.fetch = originalFetch;
        globalThis.setTimeout = originalSetTimeout;
      }
    }
  );

  await runTest(
    "two overlapping login attempts: older login cleanup does not revoke newer login session",
    async () => {
      const originalFetch = globalThis.fetch;
      const timeline: string[] = [];
      let resolveLoginA: (res: Response) => void = () => {};

      const loginAPromise = new Promise<Response>((resolve) => {
        resolveLoginA = resolve;
      });

      globalThis.fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/login")) {
          // Check timeline to distinguish Login A vs Login B
          if (timeline.filter((t) => t === "login_A_start").length === 0) {
            timeline.push("login_A_start");
            const res = await loginAPromise;
            timeline.push("login_A_resolved");
            return res;
          } else {
            timeline.push("login_B_start");
            timeline.push("login_B_resolved");
            return new Response(
              JSON.stringify({ success: true, message: "Login B succeeded" }),
              {
                status: 200,
                headers: {
                  "Content-Type": "application/json",
                  "Set-Cookie": "crediguide_session=token_b; Path=/; HttpOnly; SameSite=Lax",
                },
              }
            );
          }
        }
        if (url.includes("/api/auth/logout")) {
          timeline.push("cleanup_A_start");
          timeline.push("cleanup_A_resolved");
          return new Response(
            JSON.stringify({ success: true, message: "Revoked A", revoked: true }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        if (url.includes("/api/auth/me")) {
          timeline.push("me_B_start");
          timeline.push("me_B_resolved");
          return new Response(
            JSON.stringify({ success: true, user: mockOfficerUser }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("Not found", { status: 404 });
      };

      try {
        const auth = captureContext();

        // 1. Dispatch Login A (will be delayed on network)
        const promiseA = auth.login({
          email: "userA@crediguide.com",
          password: "PasswordA123!",
        });

        // 2. Dispatch Login B immediately while Login A is still pending
        // Login B must wait in the queue for Login A and its cleanup to finish before dispatching!
        const promiseB = auth.login({
          email: "userB@crediguide.com",
          password: "PasswordB123!",
        });

        // 3. Now resolve Login A with a session cookie
        resolveLoginA(
          new Response(
            JSON.stringify({ success: true, message: "Login A succeeded" }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Set-Cookie": "crediguide_session=token_a; Path=/; HttpOnly; SameSite=Lax",
              },
            }
          )
        );

        const [resA, resB] = await Promise.all([promiseA, promiseB]);

        // Login A fails because it was superseded by Login B
        assert.strictEqual(resA.success, false, "Login A must report failure");
        assert.ok(resA.error?.includes("superseded"));

        // Login B succeeds and establishes authenticated Officer session
        assert.strictEqual(resB.success, true, "Login B must succeed");
        assert.strictEqual(auth.user?.role, "BANK_OFFICER", "Context must hold User B (Officer)");
        assert.strictEqual(auth.isAuthenticated, true, "Must be authenticated as User B");

        // Verify timeline ordering:
        // Login A started -> Login A resolved -> Cleanup A started -> Cleanup A resolved -> Login B started
        // Login B was NEVER dispatched until Login A and its cleanup finished!
        assert.deepStrictEqual(timeline, [
          "login_A_start",
          "login_A_resolved",
          "cleanup_A_start",
          "cleanup_A_resolved",
          "login_B_start",
          "login_B_resolved",
          "me_B_start",
          "me_B_resolved",
        ]);
      } finally {
        globalThis.fetch = originalFetch;
      }
    }
  );

  await runTest(
    "strict login queue serialization: Login B waits for Login A cleanup even after 8s logout timeout",
    async () => {
      const originalFetch = globalThis.fetch;
      const originalSetTimeout = globalThis.setTimeout;

      const timeline: string[] = [];
      let resolveLoginA: (res: Response) => void = () => {};

      const loginAPromise = new Promise<Response>((resolve) => {
        resolveLoginA = resolve;
      });

      // Mock setTimeout so that the 8000ms timeout in logout fires in 10ms
      (globalThis as unknown as Record<string, unknown>).setTimeout = (
        fn: (...args: unknown[]) => void,
        ms?: number,
        ...args: unknown[]
      ) => {
        if (typeof ms === "number" && ms >= 8000) {
          return originalSetTimeout(fn, 10, ...args);
        }
        return originalSetTimeout(fn, ms, ...args);
      };

      let logoutCount = 0;
      globalThis.fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/login")) {
          if (timeline.filter((t) => t === "login_A_start").length === 0) {
            timeline.push("login_A_start");
            const res = await loginAPromise;
            timeline.push("login_A_resolved");
            return res;
          } else {
            timeline.push("login_B_start");
            timeline.push("login_B_resolved");
            return new Response(
              JSON.stringify({ success: true, message: "Login B succeeded" }),
              {
                status: 200,
                headers: {
                  "Content-Type": "application/json",
                  "Set-Cookie": "crediguide_session=token_b; Path=/; HttpOnly; SameSite=Lax",
                },
              }
            );
          }
        }
        if (url.includes("/api/auth/logout")) {
          logoutCount++;
          if (logoutCount === 1) {
            // First logout: dispatched by auth.logout() after 8s timeout elapsed
            // At this point, Cookie A has not arrived yet, so revoked: false
            timeline.push("logout_timeout_dispatch");
            return new Response(
              JSON.stringify({ success: true, message: "Logged out without cookie", revoked: false }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          } else {
            // Second logout: dispatched by Login A's late cleanup handler!
            timeline.push("cleanup_A_start");
            timeline.push("cleanup_A_resolved");
            return new Response(
              JSON.stringify({ success: true, message: "Revoked A", revoked: true }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
        }
        if (url.includes("/api/auth/me")) {
          timeline.push("me_B_start");
          timeline.push("me_B_resolved");
          return new Response(
            JSON.stringify({ success: true, user: mockOfficerUser }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("Not found", { status: 404 });
      };

      try {
        const auth = captureContext();

        // 1. Dispatch Login A (remains pending on network beyond 8 seconds)
        const promiseA = auth.login({
          email: "userA@crediguide.com",
          password: "PasswordA123!",
        });

        // 2. Dispatch Logout while Login A is in-flight
        const logoutResult = await auth.logout();

        // 3. Logout timed out after 8s and returned unconfirmed result
        assert.strictEqual(logoutResult.success, false, "Timed-out logout must report unconfirmed");
        assert.strictEqual(logoutResult.revoked, false, "revoked must be false");
        assert.strictEqual(auth.user, null, "User state is cleared");

        // 4. Now, while Login A is STILL pending on the network (> 8 seconds), dispatch Login B!
        const promiseB = auth.login({
          email: "userB@crediguide.com",
          password: "PasswordB123!",
        });

        // 5. Verify that Login B has NOT dispatched its network request!
        // The 8s timeout in logout must NOT have released the login queue!
        assert.ok(
          !timeline.includes("login_B_start"),
          "Login B must NOT dispatch its network request while Login A is still pending"
        );

        // 6. Now, resolve delayed Login A with HTTP 200 and Cookie A
        resolveLoginA(
          new Response(
            JSON.stringify({ success: true, message: "Login A succeeded" }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Set-Cookie": "crediguide_session=token_a; Path=/; HttpOnly; SameSite=Lax",
              },
            }
          )
        );

        const [resA, resB] = await Promise.all([promiseA, promiseB]);

        // 7. Verify Login A failed (superseded)
        assert.strictEqual(resA.success, false, "Login A must report failure (superseded)");

        // 8. Verify Login B succeeded and established authenticated Officer session
        assert.strictEqual(resB.success, true, "Login B must succeed");
        const liveUser = auth.user as AuthUser | null;
        assert.strictEqual(liveUser?.role, "BANK_OFFICER", "Context must hold User B (Officer)");
        assert.strictEqual(auth.isAuthenticated, true, "Must be authenticated as User B");

        // 9. Verify exact timeline ordering:
        // login_A_start -> logout_timeout_dispatch -> login_A_resolved -> cleanup_A_start -> cleanup_A_resolved -> login_B_start -> login_B_resolved -> me_B_start -> me_B_resolved
        // Notice: login_B_start ONLY occurs AFTER cleanup_A_resolved!
        assert.deepStrictEqual(timeline, [
          "login_A_start",
          "logout_timeout_dispatch",
          "login_A_resolved",
          "cleanup_A_start",
          "cleanup_A_resolved",
          "login_B_start",
          "login_B_resolved",
          "me_B_start",
          "me_B_resolved",
        ]);
      } finally {
        globalThis.fetch = originalFetch;
        globalThis.setTimeout = originalSetTimeout;
      }
    }
  );

  await runTest(
    "logout handles rejected in-flight login gracefully without unhandled rejection",
    async () => {
      const originalFetch = globalThis.fetch;
      const timeline: string[] = [];
      let rejectLoginFetch: (err: Error) => void = () => {};

      const loginFetchPromise = new Promise<Response>((_, reject) => {
        rejectLoginFetch = reject;
      });

      globalThis.fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/login")) {
          timeline.push("login_start");
          return await loginFetchPromise;
        }
        if (url.includes("/api/auth/logout")) {
          timeline.push("logout_start");
          return new Response(
            JSON.stringify({ success: true, message: "Logged out after rejected login", revoked: true }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("Not found", { status: 404 });
      };

      try {
        const auth = captureContext();

        // 1. Dispatch login
        const loginPromise = auth.login({
          email: "applicant@crediguide.com",
          password: "Password123!",
        });

        // 2. Dispatch logout while login is on the wire
        const logoutPromise = auth.logout();

        // 3. Reject login fetch with a network error
        rejectLoginFetch(new Error("Connection reset by peer"));

        const [loginResult, logoutResult] = await Promise.all([loginPromise, logoutPromise]);

        // Login reports failure
        assert.strictEqual(loginResult.success, false, "Login must fail");
        // Logout succeeds cleanly without being affected by login rejection
        assert.strictEqual(logoutResult.success, true, "Logout must succeed despite login failure");
        assert.strictEqual(auth.user, null, "Context user must remain null");
        assert.strictEqual(auth.isAuthenticated, false, "Must remain unauthenticated");
      } finally {
        globalThis.fetch = originalFetch;
      }
    }
  );

  await runTest("out-of-order refresh responses: older response cannot overwrite newer response", async () => {
    const originalFetch = globalThis.fetch;
    let resolveFirstMe: (res: Response) => void = () => {};

    const firstMePromise = new Promise<Response>((resolve) => {
      resolveFirstMe = resolve;
    });

    let meCallCount = 0;
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/me")) {
        meCallCount++;
        if (meCallCount === 1) {
          // First refresh request: delayed
          return firstMePromise;
        } else {
          // Second refresh request: resolves immediately with officer user
          return new Response(
            JSON.stringify({ success: true, user: mockOfficerUser }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
      }
      return new Response("Not found", { status: 404 });
    };

    try {
      const auth = captureContext();
      // Dispatch Refresh 1 (delayed)
      const refresh1Promise = auth.refreshUser();

      // Dispatch Refresh 2 (resolves immediately)
      const res2 = await auth.refreshUser();
      assert.strictEqual(res2.success, true, "Refresh 2 succeeded");
      assert.strictEqual(res2.user?.role, "BANK_OFFICER", "Refresh 2 holds Officer");
      assert.strictEqual(auth.user?.role, "BANK_OFFICER", "Context holds User 2 (Officer)");

      // Now resolve Refresh 1 with User 1 (Applicant)
      resolveFirstMe(
        new Response(
          JSON.stringify({ success: true, user: mockApplicantUser }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const res1 = await refresh1Promise;

      // Assert User 2 was NOT overwritten by older User 1
      assert.strictEqual(res1.success, false, "Older refresh must be marked superseded");
      assert.strictEqual(auth.user?.role, "BANK_OFFICER", "Older refresh must be suppressed; context still holds Officer");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // ---------------------------------------------------------------------------
  // GROUP 4: Logout Result & Server Revocation Contracts
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 4: Logout Result & Server Revocation Contracts");
  console.log("--------------------------------------------------------------------------------");

  await runTest("logout returns { success: true } when server confirms session revocation", async () => {
    const originalFetch = globalThis.fetch;
    let logoutBody: unknown = undefined;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/auth/logout")) {
        logoutBody = init?.body;
        return new Response(
          JSON.stringify({ success: true, message: "Logged out successfully.", revoked: true }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    try {
      const auth = captureContext({ initialUser: mockApplicantUser });
      const result = await auth.logout();

      assert.strictEqual(result.success, true, "Must report success");
      assert.strictEqual(result.revoked, true, "Must confirm database revocation");
      assert.strictEqual(result.error, undefined, "No error on success");
      assert.strictEqual(logoutBody, "{}", "Must transmit empty JSON body");
      assert.strictEqual(auth.user, null, "Frontend user state must be null");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await runTest(
    "logout returns { success: false, revoked: false } when server reports unconfirmed revocation (revoked: false)",
    async () => {
      const originalFetch = globalThis.fetch;

      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            success: true,
            message: "Logged out, but no active session was found on server.",
            revoked: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      try {
        const auth = captureContext({ initialUser: mockApplicantUser });
        const result = await auth.logout();

        assert.strictEqual(result.success, false, "Must return false when revocation is unconfirmed");
        assert.strictEqual(result.revoked, false, "revoked must be false");
        assert.ok(result.error?.includes("could not be confirmed"), "Must provide unconfirmed explanation");
        assert.strictEqual(auth.user, null, "Frontend user state must be null");
        assert.strictEqual(auth.isAuthenticated, false, "Must remain unauthenticated");
      } finally {
        globalThis.fetch = originalFetch;
      }
    }
  );

  await runTest("logout returns { success: false, error } on server HTTP 500 without restoring user", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          success: false,
          error: "INTERNAL_SERVER_ERROR",
          message: "Database connection failed during session revocation.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    };

    try {
      const auth = captureContext({ initialUser: mockApplicantUser });
      const result = await auth.logout();

      assert.strictEqual(result.success, false, "Must return failure when server fails");
      assert.ok(result.error?.includes("Database connection failed"), "Must report server failure message");
      assert.strictEqual(auth.user, null, "Client state must remain cleared; never restore old user");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await runTest("logout returns { success: false, error } on network failure without restoring user", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () => {
      throw new Error("Network offline during logout attempt");
    };

    try {
      const auth = captureContext({ initialUser: mockApplicantUser });
      const result = await auth.logout();

      assert.strictEqual(result.success, false, "Must return failure when network offline");
      assert.ok(result.error?.includes("Network offline"), "Must report network failure");
      assert.strictEqual(auth.user, null, "Client state must remain cleared");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // ---------------------------------------------------------------------------
  // GROUP 5: Focus, Visibility & Cooldown Synchronization
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 5: Focus, Visibility & Cooldown Synchronization");
  console.log("--------------------------------------------------------------------------------");

  await runTest("shouldTriggerSync enforces cooldown, in-flight suppression, and visibility guards", () => {
    // 1. Not visible: must return false
    assert.strictEqual(shouldTriggerSync(1000, 20000, false, "hidden"), false);

    // 2. In flight: must return false
    assert.strictEqual(shouldTriggerSync(1000, 20000, true, "visible"), false);

    // 3. Within cooldown (< 15000ms): must return false
    assert.strictEqual(shouldTriggerSync(10000, 20000, false, "visible"), false); // diff = 10000 < 15000

    // 4. Exactly at or after cooldown: must return true
    assert.strictEqual(shouldTriggerSync(10000, 25000, false, "visible"), true); // diff = 15000
    assert.strictEqual(shouldTriggerSync(10000, 30000, false, "visible"), true); // diff = 20000
  });

  await runTest("duplicate focus and visibility events within cooldown trigger exactly ONE fetch", () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;

    const mockWindow = new MockEventTarget();
    const mockDocument = Object.assign(new MockEventTarget(), { visibilityState: "visible" });

    (globalThis as unknown as Record<string, unknown>).window = mockWindow;
    (globalThis as unknown as Record<string, unknown>).document = mockDocument;

    let syncCount = 0;
    const lastFetchTimeRef = { current: 1000000 };
    let isFetching = false;

    const cleanup = setupSessionSync({
      sync: () => {
        syncCount++;
        isFetching = true;
      },
      cooldownMs: 15000,
      lastFetchTimeRef,
      isFetching: () => isFetching,
    });

    try {
      // Advance past cooldown for first event
      lastFetchTimeRef.current = 500000;

      // Trigger visibilitychange then focus 2ms later (simulating tab switch)
      mockDocument.dispatchEvent("visibilitychange");
      mockWindow.dispatchEvent("focus");

      assert.strictEqual(syncCount, 1, "Only 1 fetch should be dispatched; second event suppressed by cooldown and in-flight guard");
    } finally {
      cleanup();
      (globalThis as unknown as Record<string, unknown>).window = originalWindow;
      (globalThis as unknown as Record<string, unknown>).document = originalDocument;
    }
  });

  await runTest("focus refresh triggers again after cooldown expiry", () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const originalDateNow = Date.now;

    const mockWindow = new MockEventTarget();
    const mockDocument = Object.assign(new MockEventTarget(), { visibilityState: "visible" });

    (globalThis as unknown as Record<string, unknown>).window = mockWindow;
    (globalThis as unknown as Record<string, unknown>).document = mockDocument;

    let currentTime = 1000000;
    Date.now = () => currentTime;

    let syncCount = 0;
    const lastFetchTimeRef = { current: currentTime - 20000 }; // 20s ago (expired)
    let isFetching = false;

    const cleanup = setupSessionSync({
      sync: () => {
        syncCount++;
        isFetching = false;
      },
      cooldownMs: 15000,
      lastFetchTimeRef,
      isFetching: () => isFetching,
    });

    try {
      // 1. Focus after expiry triggers sync
      mockWindow.dispatchEvent("focus");
      assert.strictEqual(syncCount, 1, "Focus after cooldown expiry triggers sync");

      // 2. Advance time by 5s (< 15s) -> should NOT trigger
      currentTime += 5000;
      mockWindow.dispatchEvent("focus");
      assert.strictEqual(syncCount, 1, "Focus during cooldown must be suppressed");

      // 3. Advance time by 16s (> 15s) -> triggers sync again
      currentTime += 16000;
      mockWindow.dispatchEvent("focus");
      assert.strictEqual(syncCount, 2, "Focus after cooldown expiry triggers sync again");
    } finally {
      cleanup();
      Date.now = originalDateNow;
      (globalThis as unknown as Record<string, unknown>).window = originalWindow;
      (globalThis as unknown as Record<string, unknown>).document = originalDocument;
    }
  });

  await runTest("event listeners for focus and visibility are removed on unmount", () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;

    const mockWindow = new MockEventTarget();
    const mockDocument = Object.assign(new MockEventTarget(), { visibilityState: "visible" });

    (globalThis as unknown as Record<string, unknown>).window = mockWindow;
    (globalThis as unknown as Record<string, unknown>).document = mockDocument;

    const lastFetchTimeRef = { current: 0 };
    const cleanup = setupSessionSync({
      sync: () => {},
      cooldownMs: 15000,
      lastFetchTimeRef,
      isFetching: () => false,
    });

    try {
      assert.strictEqual(mockWindow.listenerCount("focus"), 1, "focus listener registered");
      assert.strictEqual(mockDocument.listenerCount("visibilitychange"), 1, "visibilitychange listener registered");

      cleanup();

      assert.strictEqual(mockWindow.listenerCount("focus"), 0, "focus listener removed on cleanup");
      assert.strictEqual(mockDocument.listenerCount("visibilitychange"), 0, "visibilitychange listener removed on cleanup");
    } finally {
      (globalThis as unknown as Record<string, unknown>).window = originalWindow;
      (globalThis as unknown as Record<string, unknown>).document = originalDocument;
    }
  });

  // ---------------------------------------------------------------------------
  // GROUP 6: Security Architecture & Zero Storage Verification
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 6: Security Architecture & Zero Storage Verification");
  console.log("--------------------------------------------------------------------------------");

  await runTest("AuthProvider does not access or write to localStorage or sessionStorage", () => {
    let localStorageTouched = false;
    let sessionStorageTouched = false;

    const originalLocalStorage = (globalThis as unknown as Record<string, unknown>).localStorage;
    const originalSessionStorage = (globalThis as unknown as Record<string, unknown>).sessionStorage;

    (globalThis as unknown as Record<string, unknown>).localStorage = new Proxy({}, {
      get() {
        localStorageTouched = true;
        return undefined;
      },
      set() {
        localStorageTouched = true;
        return true;
      },
    });

    (globalThis as unknown as Record<string, unknown>).sessionStorage = new Proxy({}, {
      get() {
        sessionStorageTouched = true;
        return undefined;
      },
      set() {
        sessionStorageTouched = true;
        return true;
      },
    });

    try {
      const auth = captureContext({ initialUser: mockApplicantUser });
      assert.strictEqual(localStorageTouched, false, "localStorage must never be touched");
      assert.strictEqual(sessionStorageTouched, false, "sessionStorage must never be touched");
      assert.strictEqual(auth.isAuthenticated, true);
    } finally {
      (globalThis as unknown as Record<string, unknown>).localStorage = originalLocalStorage;
      (globalThis as unknown as Record<string, unknown>).sessionStorage = originalSessionStorage;
    }
  });

  await runTest("Password or token secrets are never retained in AuthContext state", () => {
    const auth = captureContext({ initialUser: mockApplicantUser });
    const keys = Object.keys(auth.user ?? {});

    assert.ok(!keys.includes("password"), "Must not contain password");
    assert.ok(!keys.includes("passwordHash"), "Must not contain passwordHash");
    assert.ok(!keys.includes("token"), "Must not contain token");
    assert.ok(!keys.includes("tokenHash"), "Must not contain tokenHash");
  });

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`📊 STAGE 2B.3.3 TEST RESULTS: ${passedCount} / ${totalCount} PASSED (100%)`);
  console.log("================================================================================\n");
}

runAllTests().catch((err) => {
  console.error("Test execution terminated with error:", err);
  process.exit(1);
});
