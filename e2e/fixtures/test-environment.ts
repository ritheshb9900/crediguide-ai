import { Pool } from "pg";

export const E2E_TEST_DOMAIN = "@cg-test-domain.org";

export function getE2EBridgeSecret(): string {
  const secret = process.env.E2E_BRIDGE_SECRET;
  if (!secret || secret.trim() === "") {
    throw new Error(
      "E2E_CONFIGURATION_ERROR: process.env.E2E_BRIDGE_SECRET is not set in test environment. Static fallback secrets are forbidden."
    );
  }
  return secret;
}

export interface TestApplicantCredentials {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
}

export function generateTestApplicantCredentials(prefix = "e2e"): TestApplicantCredentials {
  const timestamp = Date.now();
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return {
    email: `${prefix}.${timestamp}.${rand}${E2E_TEST_DOMAIN}`,
    password: "TestPassword123!Secure",
    firstName: "E2E",
    lastName: "AutomatedUser",
    phone: "9876543210",
  };
}

/**
 * Polls the isolated local dev bridge for dispatched email verification or reset links.
 */
export async function fetchEmailActionLink(
  email: string,
  expectedType?: "EMAIL_VERIFICATION" | "PASSWORD_RESET",
  options: { maxRetries?: number; intervalMs?: number } = {}
): Promise<string> {
  const maxRetries = options.maxRetries ?? 15;
  const intervalMs = options.intervalMs ?? 500;
  const secret = getE2EBridgeSecret();
  const url = `http://localhost:3000/api/dev/e2e/email-link?email=${encodeURIComponent(email)}`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "x-e2e-bridge-secret": secret,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.actionUrl) {
          if (!expectedType || data.type === expectedType) {
            return data.actionUrl;
          }
        }
      }
    } catch {
      // Dev server may be warming up
    }

    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error(
    `Failed to retrieve email action link for '${email}' after ${maxRetries} attempts.`
  );
}

/**
 * Isolated cleanup utility targeting ONLY crediguide_e2e_db.
 * Refuses execution if email does not belong to authorized test domain.
 */
export async function cleanupE2EUser(email: string): Promise<void> {
  const normalized = email.toLowerCase().trim();
  if (!normalized.endsWith(E2E_TEST_DOMAIN) && !normalized.endsWith("@e2e.crediguide.local")) {
    throw new Error(
      `SECURITY_VIOLATION: Refusing to clean up non-test email: '${email}'`
    );
  }

  const e2eDbUrl = process.env.E2E_DATABASE_URL;
  if (!e2eDbUrl || typeof e2eDbUrl !== "string" || e2eDbUrl.trim() === "") {
    throw new Error(
      "FATAL_E2E_CONFIGURATION_ERROR: process.env.E2E_DATABASE_URL is not set for test cleanup."
    );
  }

  const pool = new Pool({ connectionString: e2eDbUrl });
  try {
    // Verify target DB is strictly crediguide_e2e_db
    const checkRes = await pool.query("SELECT current_database() as db;");
    if (checkRes.rows[0].db !== "crediguide_e2e_db") {
      throw new Error(
        `CRITICAL_SAFETY_FAIL: Target DB is ${checkRes.rows[0].db}, expected crediguide_e2e_db`
      );
    }

    // Delete user (cascades to sessions, tokens, etc.)
    await pool.query("DELETE FROM users WHERE lower(email) = lower($1);", [normalized]);
    await pool.query("DELETE FROM applicants WHERE lower(email) = lower($1);", [normalized]);
  } finally {
    await pool.end();
  }

  // Targeted sink cleanup via bridge for this specific test email
  try {
    const secret = getE2EBridgeSecret();
    await fetch(
      `http://localhost:3000/api/dev/e2e/email-link?email=${encodeURIComponent(normalized)}`,
      {
        method: "DELETE",
        headers: {
          "x-e2e-bridge-secret": secret,
        },
      }
    );
  } catch {
    // Non-fatal if server is stopped
  }
}
