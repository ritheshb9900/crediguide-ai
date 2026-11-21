import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

export function getDatabaseConnectionString(): string | undefined {
  const isE2E = process.env.IS_E2E === "true";

  if (isE2E) {
    const e2eUrl = process.env.E2E_DATABASE_URL;
    if (!e2eUrl) {
      throw new Error(
        "FATAL_E2E_DB_SECURITY_VIOLATION: IS_E2E is true but E2E_DATABASE_URL is not set. Failing closed to prevent accidental fallback to development database."
      );
    }

    let dbName: string | null = null;
    try {
      const parsed = new URL(e2eUrl);
      dbName = parsed.pathname.replace(/^\//, "").split("?")[0] || null;
    } catch {
      const match = e2eUrl.match(/\/([^/?]+)(?:\?|$)/);
      dbName = match ? match[1] : null;
    }

    if (dbName !== "crediguide_e2e_db") {
      throw new Error(
        `FATAL_E2E_DB_SECURITY_VIOLATION: E2E_DATABASE_URL must target 'crediguide_e2e_db', but targets '${dbName}'. Failing closed to protect database integrity.`
      );
    }

    return e2eUrl;
  }

  return process.env.DATABASE_URL;
}

function createPrismaClient(): PrismaClient {
  const connectionString = getDatabaseConnectionString();

  const pool = new Pool({
    connectionString: connectionString || undefined,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalThis.prismaGlobal ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}

export default prisma;
