import "dotenv/config";
import { defineConfig } from "prisma/config";

function getDatasourceUrl(): string | undefined {
  if (process.env.IS_E2E === "true") {
    const e2eUrl = process.env.E2E_DATABASE_URL;
    if (!e2eUrl) {
      throw new Error(
        "FATAL_E2E_DB_SECURITY_VIOLATION: IS_E2E is true but E2E_DATABASE_URL is not defined in prisma.config.ts."
      );
    }
    const match = e2eUrl.match(/\/([^/?]+)(?:\?|$)/);
    const dbName = match ? match[1] : null;
    if (dbName !== "crediguide_e2e_db") {
      throw new Error(
        `FATAL_E2E_DB_SECURITY_VIOLATION: E2E_DATABASE_URL must target 'crediguide_e2e_db', but got '${dbName}'.`
      );
    }
    return e2eUrl;
  }
  return process.env["DATABASE_URL"];
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: getDatasourceUrl(),
  },
});
