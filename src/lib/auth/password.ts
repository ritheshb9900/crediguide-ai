import { hash, verify } from "@node-rs/argon2";

/**
 * OWASP Recommended Argon2id Parameters for Enterprise Authentication:
 * - memoryCost: 19456 KiB (~19 MiB)
 * - timeCost: 2 iterations
 * - parallelism: 1 thread
 */
export const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Hashes a plaintext password using Argon2id with OWASP-recommended parameters.
 * Strictly executed on the server. Never logs or prints plaintext passwords or hashes.
 *
 * @param plaintext - Candidate plaintext password.
 * @returns Argon2id PHC string ($argon2id$v=19$m=19456,t=2,p=1$...).
 */
export async function hashPassword(plaintext: string): Promise<string> {
  if (!plaintext || typeof plaintext !== "string") {
    throw new Error("Password must be a non-empty string.");
  }
  if (plaintext.length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }
  if (plaintext.length > 128) {
    throw new Error("Password exceeds maximum allowable length of 128 characters.");
  }

  return hash(plaintext, {
    memoryCost: ARGON2_OPTIONS.memoryCost,
    timeCost: ARGON2_OPTIONS.timeCost,
    parallelism: ARGON2_OPTIONS.parallelism,
  });
}

/**
 * Verifies a candidate plaintext password against an Argon2id password hash.
 * Constant-time comparison is handled by the underlying Argon2 implementation.
 * Catches any malformed hash errors and safely returns false instead of throwing.
 *
 * @param passwordHash - Stored Argon2id PHC hash.
 * @param candidatePlaintext - Candidate password entered by user.
 * @returns boolean indicating whether the password matches.
 */
export async function verifyPassword(
  passwordHash: string,
  candidatePlaintext: string
): Promise<boolean> {
  if (!passwordHash || !candidatePlaintext) {
    return false;
  }

  try {
    return await verify(passwordHash, candidatePlaintext);
  } catch {
    // Malformed hash, invalid algorithm identifier, or internal verification error
    return false;
  }
}

/**
 * Computes a bounded progressive delay for failed authentication attempts.
 * Delays brute-force attackers without causing thread starvation on the server.
 * Formula: min(200ms * failedAttempts, 2000ms).
 *
 * @param failedAttempts - Current count of consecutive failed login attempts.
 * @returns Milliseconds to pause execution (between 0 and 2000ms).
 */
export function calculateProgressiveDelay(failedAttempts: number): number {
  if (failedAttempts <= 0) {
    return 0;
  }
  const delayMs = Math.min(200 * failedAttempts, 2000);
  return delayMs;
}

/**
 * Helper to pause execution for a given duration.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
