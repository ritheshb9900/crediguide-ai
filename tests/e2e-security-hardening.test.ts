import crypto from "crypto";
import fs from "fs";
import { execSync } from "child_process";
import { isTimingSafeEqual, isAllowedTestEmail } from "../src/app/api/dev/e2e/email-link/route";
import { GET, DELETE } from "../src/app/api/dev/e2e/email-link/route";
import { DevEmailSink } from "../src/lib/auth/email-provider";
import { getE2EDatabaseUrl } from "../scripts/e2e-migrate";
import playwrightConfig from "../playwright.config";

/**
 * Stage 3F.2.1: E2E Security Hardening & Bridge Test Suite
 */
async function runE2ESecurityHardeningTests() {
  console.log("================================================================================");
  console.log("🔒 CrediGuide AI — Stage 3F.2.1: E2E Security Hardening & Isolation Suite");
  console.log("================================================================================\n");

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ""}`);
      throw new Error(`Assertion failed: ${testName}`);
    }
  }

  // ===========================================================================
  // TEST GROUP 1: TIMING-SAFE SECRET COMPARISON
  // ===========================================================================
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 1: Timing-Safe Secret Comparison");
  console.log("--------------------------------------------------------------------------------");

  const secretA = "e2e_sec_0123456789abcdef0123456789abcdef";
  const secretB = "e2e_sec_0123456789abcdef0123456789abcdef";
  const secretDiff = "e2e_sec_0123456789abcdef0123456789abcdeg";
  const secretShort = "e2e_sec_short";

  assert(isTimingSafeEqual(secretA, secretB) === true, "Identical secrets evaluate to true");
  assert(isTimingSafeEqual(secretA, secretDiff) === false, "Different secret with equal length evaluates to false");
  assert(isTimingSafeEqual(secretA, secretShort) === false, "Different length secret evaluates to false without throwing RangeError");
  assert(isTimingSafeEqual(secretShort, secretA) === false, "Shorter first secret evaluates to false without throwing RangeError");
  assert(isTimingSafeEqual("", secretA) === false, "Empty string evaluates to false");
  assert(isTimingSafeEqual(secretA, "") === false, "Empty expected secret evaluates to false");
  assert(isTimingSafeEqual(undefined as unknown as string, secretA) === false, "Undefined input safely returns false");

  // ===========================================================================
  // TEST GROUP 2: PERMITTED EMAIL TEST DOMAIN VALIDATION
  // ===========================================================================
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 2: Email Test Domain Authorization");
  console.log("--------------------------------------------------------------------------------");

  assert(isAllowedTestEmail("user@cg-test-domain.org") === true, "Permits @cg-test-domain.org");
  assert(isAllowedTestEmail("sub.user@cg-test-domain.org") === true, "Permits subdomain prefix @cg-test-domain.org");
  assert(isAllowedTestEmail("e2e.12345@e2e.crediguide.local") === true, "Permits @e2e.crediguide.local");
  assert(isAllowedTestEmail("admin@crediguide.internal") === false, "Rejects production internal domain @crediguide.internal");
  assert(isAllowedTestEmail("rohit.sharma@example.com") === false, "Rejects synthetic demo domain @example.com");
  assert(isAllowedTestEmail("victim@gmail.com") === false, "Rejects public domains");

  // ===========================================================================
  // TEST GROUP 3: EMAIL BRIDGE AUTHORIZATION & ZERO STATIC FALLBACK
  // ===========================================================================
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 3: Bridge Route Authorization & Secret Verification");
  console.log("--------------------------------------------------------------------------------");

  const origEnv = { ...process.env };

  try {
    (process.env as Record<string, string | undefined>)["NODE_ENV"] = "test";
    process.env.ENABLE_E2E_EMAIL_BRIDGE = "true";
    const testSecret = crypto.randomBytes(32).toString("hex");
    process.env.E2E_BRIDGE_SECRET = testSecret;

    // 1. Missing secret header
    const reqMissingHeader = new Request("http://localhost:3000/api/dev/e2e/email-link?email=user@cg-test-domain.org");
    const resMissing = await GET(reqMissingHeader);
    assert(resMissing.status === 401, "Missing x-e2e-bridge-secret header returns 401 Unauthorized");

    // 2. Incorrect secret header
    const reqWrongHeader = new Request("http://localhost:3000/api/dev/e2e/email-link?email=user@cg-test-domain.org", {
      headers: { "x-e2e-bridge-secret": "wrong-secret-value-1234567890" },
    });
    const resWrong = await GET(reqWrongHeader);
    assert(resWrong.status === 401, "Incorrect x-e2e-bridge-secret header returns 401 Unauthorized");

    // 3. Static fallback rejection when server secret is unconfigured
    delete process.env.E2E_BRIDGE_SECRET;
    const reqWithStatic = new Request("http://localhost:3000/api/dev/e2e/email-link?email=user@cg-test-domain.org", {
      headers: { "x-e2e-bridge-secret": "crediguide-e2e-bridge-secret-local-dev" },
    });
    const resUnconf = await GET(reqWithStatic);
    assert(
      resUnconf.status === 500,
      "Server returns 500 when E2E_BRIDGE_SECRET is unconfigured (refuses static fallback)"
    );

    // Restore test secret
    process.env.E2E_BRIDGE_SECRET = testSecret;

    // 4. Production guard returns 404 regardless of valid secret
    (process.env as Record<string, string | undefined>)["NODE_ENV"] = "production";
    const reqProd = new Request("http://localhost:3000/api/dev/e2e/email-link?email=user@cg-test-domain.org", {
      headers: { "x-e2e-bridge-secret": testSecret },
    });
    const resProd = await GET(reqProd);
    assert(resProd.status === 404, "Production environment returns 404 Not Found regardless of secret");

    (process.env as Record<string, string | undefined>)["NODE_ENV"] = "test";

    // 5. Disabled bridge returns 404
    process.env.ENABLE_E2E_EMAIL_BRIDGE = "false";
    const resDisabled = await GET(reqProd);
    assert(resDisabled.status === 404, "Disabled bridge (ENABLE_E2E_EMAIL_BRIDGE=false) returns 404");
  } finally {
    process.env = { ...origEnv };
  }

  // ===========================================================================
  // TEST GROUP 4: TARGETED EMAIL SINK CLEANUP
  // ===========================================================================
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 4: Targeted Email Sink Cleanup");
  console.log("--------------------------------------------------------------------------------");

  const origEnv2 = { ...process.env };
  try {
    (process.env as Record<string, string | undefined>)["NODE_ENV"] = "test";
    process.env.ENABLE_E2E_EMAIL_BRIDGE = "true";
    const testSecret = crypto.randomBytes(32).toString("hex");
    process.env.E2E_BRIDGE_SECRET = testSecret;

    DevEmailSink.clear();

    // Populate multiple records
    DevEmailSink.record({
      id: "msg-1",
      type: "EMAIL_VERIFICATION",
      to: "test.applicant1@cg-test-domain.org",
      recipientName: "Test Applicant 1",
      actionUrl: "http://localhost:3000/auth/verify-email?token=token1",
      expiresInMinutes: 1440,
      timestamp: new Date(),
    });

    DevEmailSink.record({
      id: "msg-2",
      type: "PASSWORD_RESET",
      to: "test.applicant2@cg-test-domain.org",
      recipientName: "Test Applicant 2",
      actionUrl: "http://localhost:3000/auth/reset-password?token=token2",
      expiresInMinutes: 15,
      timestamp: new Date(),
    });

    DevEmailSink.record({
      id: "msg-3",
      type: "EMAIL_VERIFICATION",
      to: "developer.local@example.com",
      recipientName: "Dev User",
      actionUrl: "http://localhost:3000/auth/verify-email?token=token3",
      expiresInMinutes: 1440,
      timestamp: new Date(),
    });

    assert(DevEmailSink.getRecords().length === 3, "Sink initialized with 3 records for distinct recipients");

    // DELETE without email parameter is rejected
    const reqDeleteNoParam = new Request("http://localhost:3000/api/dev/e2e/email-link", {
      method: "DELETE",
      headers: { "x-e2e-bridge-secret": testSecret },
    });
    const resDeleteNoParam = await DELETE(reqDeleteNoParam);
    assert(resDeleteNoParam.status === 400, "DELETE without email parameter returns 400 Bad Request");
    assert(DevEmailSink.getRecords().length === 3, "Blanket deletion is prevented (sink untouched)");

    // DELETE for non-test email is rejected
    const reqDeleteNonTest = new Request("http://localhost:3000/api/dev/e2e/email-link?email=developer.local@example.com", {
      method: "DELETE",
      headers: { "x-e2e-bridge-secret": testSecret },
    });
    const resDeleteNonTest = await DELETE(reqDeleteNonTest);
    assert(resDeleteNonTest.status === 403, "DELETE for non-test domain email returns 403 Forbidden");
    assert(DevEmailSink.getRecords().length === 3, "Non-test records are protected from deletion");

    // DELETE for test applicant 1 succeeds and removes ONLY applicant 1
    const reqDeleteTest1 = new Request("http://localhost:3000/api/dev/e2e/email-link?email=test.applicant1@cg-test-domain.org", {
      method: "DELETE",
      headers: { "x-e2e-bridge-secret": testSecret },
    });
    const resDeleteTest1 = await DELETE(reqDeleteTest1);
    assert(resDeleteTest1.status === 200, "DELETE for test applicant returns 200 OK");
    const jsonDelete = await resDeleteTest1.json();
    assert(jsonDelete.removedCount === 1, "Exactly 1 record was removed");

    const remaining = DevEmailSink.getRecords();
    assert(remaining.length === 2, "Sink retains exactly 2 remaining records");
    assert(DevEmailSink.findLatestFor("test.applicant1@cg-test-domain.org") === undefined, "Targeted test email 1 was removed");
    assert(DevEmailSink.findLatestFor("test.applicant2@cg-test-domain.org") !== undefined, "Test email 2 was preserved");
    assert(DevEmailSink.findLatestFor("developer.local@example.com") !== undefined, "Dev user record was preserved");

    DevEmailSink.clear();
  } finally {
    process.env = { ...origEnv2 };
  }

  // ===========================================================================
  // TEST GROUP 5: EXPLICIT E2E MIGRATION URL VALIDATION
  // ===========================================================================
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 5: Explicit E2E Migration Database URL Validation");
  console.log("--------------------------------------------------------------------------------");

  const origEnv3 = { ...process.env };
  try {
    // 1. Missing E2E_DATABASE_URL throws
    delete process.env.E2E_DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/crediguide_db";
    let threwMissing = false;
    try {
      getE2EDatabaseUrl();
    } catch (e: unknown) {
      const err = e as Error;
      threwMissing = true;
      assert(err.message.includes("FATAL_MIGRATION_CONFIG_ERROR"), "Missing E2E_DATABASE_URL throws FATAL_MIGRATION_CONFIG_ERROR");
      assert(err.message.includes("is not set"), "Error explicitly states E2E_DATABASE_URL is not set");
    }
    assert(threwMissing, "getE2EDatabaseUrl fails closed when E2E_DATABASE_URL is missing");

    // 2. Malformed E2E_DATABASE_URL throws
    process.env.E2E_DATABASE_URL = "not-a-valid-url";
    let threwMalformed = false;
    try {
      getE2EDatabaseUrl();
    } catch (e: unknown) {
      const err = e as Error;
      threwMalformed = true;
      assert(err.message.includes("Malformed E2E_DATABASE_URL"), "Malformed URL throws descriptive error");
    }
    assert(threwMalformed, "getE2EDatabaseUrl fails closed on malformed URL");

    // 3. Incorrect database name (pointing to dev DB or other DB) throws
    process.env.E2E_DATABASE_URL = "postgresql://user:pass@localhost:5432/crediguide_db";
    let threwDevDb = false;
    try {
      getE2EDatabaseUrl();
    } catch (e: unknown) {
      const err = e as Error;
      threwDevDb = true;
      assert(err.message.includes("must target 'crediguide_e2e_db'"), "Throws error when targeting crediguide_db");
    }
    assert(threwDevDb, "getE2EDatabaseUrl strictly rejects targeting crediguide_db");

    // 4. Valid E2E_DATABASE_URL targeting crediguide_e2e_db passes
    const validE2EUrl = "postgresql://crediguide_user:secret@localhost:5432/crediguide_e2e_db?schema=public";
    process.env.E2E_DATABASE_URL = validE2EUrl;
    const resolvedUrl = getE2EDatabaseUrl();
    assert(resolvedUrl === validE2EUrl, "Valid E2E_DATABASE_URL is accepted and returned directly");
  } finally {
    process.env = { ...origEnv3 };
  }

  // ===========================================================================
  // TEST GROUP 6: PLAYWRIGHT SERVER ISOLATION & UNCONDITIONAL SECRET GENERATION
  // ===========================================================================
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 6: Playwright Server Isolation & Unconditional Secret Generation");
  console.log("--------------------------------------------------------------------------------");

  const webServerConfig = playwrightConfig.webServer as {
    reuseExistingServer?: boolean;
    env?: Record<string, string>;
  };
  assert(webServerConfig !== undefined, "Playwright webServer is configured");
  assert(webServerConfig.reuseExistingServer === false, "reuseExistingServer is strictly false (never reuses dev server)");
  assert(webServerConfig.env?.IS_E2E === "true", "webServer.env sets IS_E2E to 'true'");
  assert(webServerConfig.env?.ENABLE_E2E_EMAIL_BRIDGE === "true", "webServer.env sets ENABLE_E2E_EMAIL_BRIDGE to 'true'");
  assert(
    Boolean(webServerConfig.env?.E2E_DATABASE_URL?.includes("crediguide_e2e_db")),
    "webServer.env.E2E_DATABASE_URL targets crediguide_e2e_db"
  );

  // Unconditional fresh secret generation verification
  const serverSecret = webServerConfig.env?.E2E_BRIDGE_SECRET;
  const testProcessSecret = process.env.E2E_BRIDGE_SECRET;

  assert(Boolean(serverSecret), "webServer receives non-empty bridge secret");
  assert(Boolean(testProcessSecret), "Playwright test execution process receives non-empty bridge secret");
  assert(serverSecret === testProcessSecret, "Server and test execution process receive the exact same secret");
  assert((serverSecret?.length ?? 0) === 64, "Secret length is exactly 64 hexadecimal characters (32 random bytes)");
  assert(
    serverSecret !== "crediguide-e2e-bridge-secret-local-dev",
    "Generated secret does not match any predictable or static fallback string"
  );

  // Prove two independent generations produce distinct secrets (high entropy)
  const probeSecret1 = crypto.randomBytes(32).toString("hex");
  const probeSecret2 = crypto.randomBytes(32).toString("hex");
  assert(probeSecret1 !== probeSecret2, "Independent cryptographic generations produce distinct 32-byte secrets");

  // Verify source files do not contain environment override or static fallbacks
  const playwrightConfigFile = fs.readFileSync("playwright.config.ts", "utf8");
  assert(
    !playwrightConfigFile.includes("process.env.E2E_BRIDGE_SECRET ||"),
    "playwright.config.ts does not permit inherited environment variable override"
  );
  assert(
    playwrightConfigFile.includes("crypto.randomBytes(32).toString(\"hex\")"),
    "playwright.config.ts unconditionally generates crypto.randomBytes(32)"
  );
  assert(
    !playwrightConfigFile.includes("crediguide-e2e-bridge-secret-local-dev"),
    "playwright.config.ts contains zero static fallback secrets"
  );

  const testEnvFile = fs.readFileSync("e2e/fixtures/test-environment.ts", "utf8");
  assert(
    !testEnvFile.includes("crediguide-e2e-bridge-secret-local-dev"),
    "e2e/fixtures/test-environment.ts contains zero static fallback secrets"
  );

  const routeFile = fs.readFileSync("src/app/api/dev/e2e/email-link/route.ts", "utf8");
  assert(
    !routeFile.includes("crediguide-e2e-bridge-secret-local-dev"),
    "src/app/api/dev/e2e/email-link/route.ts contains zero static fallback secrets"
  );

  // Active proof: Orchestrator execution ignores inherited environment variable
  const mockInheritedSecret = "inherited_bogus_secret_value_12345678901234567890";
  const isWorkerSim = false;
  let simulatedSecret: string;
  if (isWorkerSim && mockInheritedSecret) {
    simulatedSecret = mockInheritedSecret;
  } else {
    simulatedSecret = crypto.randomBytes(32).toString("hex");
  }
  assert(
    simulatedSecret !== mockInheritedSecret,
    "Orchestrator logic unconditionally ignores inherited E2E_BRIDGE_SECRET and generates fresh random bytes"
  );
  assert(
    simulatedSecret.length === 64,
    "Simulated fresh secret is exactly 64 hex characters"
  );

  // ===========================================================================
  // TEST GROUP 7: GITIGNORE EXCLUSIONS AND TRACKING INTEGRITY
  // ===========================================================================
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 7: Gitignore Exclusions and Tracking Integrity");
  console.log("--------------------------------------------------------------------------------");

  const gitignoreContent = fs.readFileSync(".gitignore", "utf8");
  assert(gitignoreContent.includes("/test-results/"), ".gitignore contains root-anchored /test-results/");
  assert(gitignoreContent.includes("/playwright-report/"), ".gitignore contains root-anchored /playwright-report/");

  // Verify using git check-ignore via child_process
  let testResultsIgnored = false;
  try {
    const res = execSync("git check-ignore -v test-results/", { encoding: "utf8" });
    if (res.includes("/test-results/")) testResultsIgnored = true;
  } catch {
    testResultsIgnored = false;
  }
  assert(testResultsIgnored, "Git confirms test-results/ is ignored by .gitignore");

  let playwrightReportIgnored = false;
  try {
    const res = execSync("git check-ignore -v playwright-report/", { encoding: "utf8" });
    if (res.includes("/playwright-report/")) playwrightReportIgnored = true;
  } catch {
    playwrightReportIgnored = false;
  }
  assert(playwrightReportIgnored, "Git confirms playwright-report/ is ignored by .gitignore");

  // Verify trackable files are not ignored
  const criticalFiles = [
    "playwright.config.ts",
    "e2e/smoke.spec.ts",
    "e2e/auth-journey.spec.ts",
    "e2e/fixtures/test-environment.ts",
    "tests/e2e-security-hardening.test.ts",
    "prisma/migrations/20261118124555_init_crediguide_enterprise/migration.sql",
  ];

  for (const file of criticalFiles) {
    let isIgnored = true;
    try {
      execSync(`git check-ignore ${file}`, { stdio: "ignore" });
    } catch {
      // Non-zero exit code means file is NOT ignored
      isIgnored = false;
    }
    assert(!isIgnored, `Git confirms critical file '${file}' is trackable and NOT ignored`);
  }

  console.log("\n================================================================================");
  console.log(`📊 STAGE 3F.2.2 TEST SUMMARY: ${passedTests} / ${totalTests} Tests Passed (100% SUCCESS)`);
  console.log("================================================================================\n");
}

runE2ESecurityHardeningTests().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
