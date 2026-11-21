import "dotenv/config";
import { execSync } from "child_process";

export function getE2EDatabaseUrl(): string {
  const e2eUrl = process.env.E2E_DATABASE_URL;
  if (!e2eUrl || typeof e2eUrl !== "string" || e2eUrl.trim() === "") {
    throw new Error(
      "FATAL_MIGRATION_CONFIG_ERROR: E2E_DATABASE_URL is not set in environment. An explicit E2E_DATABASE_URL targeting 'crediguide_e2e_db' is strictly required."
    );
  }

  let dbName: string | null = null;
  try {
    const parsed = new URL(e2eUrl);
    dbName = parsed.pathname.replace(/^\//, "").split("?")[0] || null;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `FATAL_MIGRATION_CONFIG_ERROR: Malformed E2E_DATABASE_URL: ${msg}`
    );
  }

  if (dbName !== "crediguide_e2e_db") {
    throw new Error(
      `FATAL_MIGRATION_CONFIG_ERROR: E2E_DATABASE_URL must target 'crediguide_e2e_db', but targets '${dbName}'. Migration aborted to protect non-E2E database.`
    );
  }

  return e2eUrl;
}

function runE2EMigrate() {
  const e2eUrl = getE2EDatabaseUrl();
  console.log("🔒 Deploying enterprise schema migrations to isolated database: crediguide_e2e_db");

  try {
    execSync("npx prisma migrate deploy", {
      env: {
        ...process.env,
        IS_E2E: "true",
        E2E_DATABASE_URL: e2eUrl,
      },
      stdio: "inherit",
    });
    console.log("✅ E2E database migrations successfully deployed to crediguide_e2e_db.");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ E2E database migration failed:", message);
    process.exit(1);
  }
}

if (require.main === module) {
  runE2EMigrate();
}
