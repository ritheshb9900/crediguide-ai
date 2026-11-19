import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { UserRole } from "../src/generated/prisma/enums";
import { hashPassword } from "../src/lib/auth/password";
import { NormalizedEmailSchema, PasswordSchema } from "../src/lib/auth/validation";

// Dedicated 64-bit constant for CrediGuide PostgreSQL transaction advisory lock
// "CREDIADM" in ASCII hex converted to BigInt: 0x435245444941444D -> 4851025531737752653n
export const BOOTSTRAP_ADVISORY_LOCK_ID = "4851025531737752653";

export interface BootstrapOptions {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  enableOverride?: boolean;
}

export interface BootstrapResult {
  id: string;
  email: string;
  role: UserRole;
  createdAt: Date;
}

/**
 * Executes initial Bank Administrator bootstrap.
 *
 * SECURITY INVARIANTS:
 * 1. Fails closed unless ENABLE_ADMIN_BOOTSTRAP === "true".
 * 2. Acquires PostgreSQL transaction-level advisory lock (pg_advisory_xact_lock)
 *    inside an isolated database transaction to guarantee serialized execution.
 * 3. Fails closed if ANY BANK_ADMIN already exists in PostgreSQL.
 * 4. Fails closed if the requested email is already used by ANY user account.
 * 5. Uses OWASP-compliant Argon2id password hashing.
 * 6. Never logs passwords or password hashes.
 */
export async function runAdminBootstrap(
  options: BootstrapOptions = {}
): Promise<BootstrapResult> {
  const isEnabled =
    options.enableOverride ?? process.env.ENABLE_ADMIN_BOOTSTRAP === "true";

  if (!isEnabled) {
    throw new Error(
      "BOOTSTRAP_DISABLED: Admin bootstrap is disabled. Set ENABLE_ADMIN_BOOTSTRAP=true in environment to execute."
    );
  }

  const rawEmail = options.email ?? process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@crediguide.internal";
  const rawPassword = options.password ?? process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!rawPassword) {
    throw new Error(
      "BOOTSTRAP_MISSING_PASSWORD: BOOTSTRAP_ADMIN_PASSWORD must be provided in environment or options."
    );
  }

  // Validate inputs with Zod schemas
  const emailParse = NormalizedEmailSchema.safeParse(rawEmail);
  if (!emailParse.success) {
    throw new Error(
      `BOOTSTRAP_INVALID_EMAIL: Invalid email address format: ${emailParse.error.issues[0]?.message}`
    );
  }
  const normalizedEmail = emailParse.data;

  const passwordParse = PasswordSchema.safeParse(rawPassword);
  if (!passwordParse.success) {
    throw new Error(
      `BOOTSTRAP_INVALID_PASSWORD: Password does not meet security requirements: ${passwordParse.error.issues[0]?.message}`
    );
  }
  const validPassword = passwordParse.data;

  const firstName = (options.firstName ?? process.env.BOOTSTRAP_ADMIN_FIRST_NAME ?? "System").trim();
  const lastName = (options.lastName ?? process.env.BOOTSTRAP_ADMIN_LAST_NAME ?? "Administrator").trim();

  // Execute inside an isolated PostgreSQL transaction with advisory lock
  const createdAdmin = await prisma.$transaction(async (tx) => {
    // 1. Acquire transaction-level advisory lock
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(${BOOTSTRAP_ADVISORY_LOCK_ID});`
    );

    // 2. Strict conflict check: Does the email already belong to ANY user?
    const existingUser = await tx.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, role: true },
    });

    if (existingUser) {
      throw new Error(
        "EMAIL_CONFLICT: A user with this email address already exists. Bootstrap will not overwrite or modify existing accounts."
      );
    }

    // 3. Strict check: Has any BANK_ADMIN already been provisioned?
    const existingAdmin = await tx.user.findFirst({
      where: { role: UserRole.BANK_ADMIN },
      select: { id: true, email: true },
    });

    if (existingAdmin) {
      throw new Error(
        "ADMIN_ALREADY_EXISTS: At least one BANK_ADMIN already exists in the system. Bootstrap can only be run once on a fresh installation."
      );
    }

    // 4. Hash password with Argon2id
    const passwordHash = await hashPassword(validPassword);

    // 5. Create initial administrator
    const admin = await tx.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        role: UserRole.BANK_ADMIN,
        firstName,
        lastName,
        isEmailVerified: true,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return admin;
  });

  return createdAdmin;
}

// Standalone execution wrapper
async function main() {
  try {
    const admin = await runAdminBootstrap();
    console.log(
      `[BOOTSTRAP] Initial BANK_ADMIN created successfully: ${admin.email} (ID: ${admin.id})`
    );
    process.exit(0);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[BOOTSTRAP ERROR] ${message}`);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  void main();
}
