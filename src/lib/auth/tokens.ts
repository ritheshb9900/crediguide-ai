import crypto from "node:crypto";

/**
 * Generates a 256-bit (32 bytes) cryptographically secure random token.
 * Output is formatted as base64url (URL-safe, alphanumeric with '-' and '_').
 *
 * @param bytes - Byte length of random entropy (default: 32 bytes = 256 bits).
 * @returns Cryptographically secure base64url string.
 */
export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/**
 * Computes a deterministic SHA-256 hex digest of a sensitive token string.
 * This digest is the ONLY representation that may be persisted to PostgreSQL
 * (e.g. in `user_sessions.tokenHash` or `password_reset_tokens.tokenHash`).
 *
 * @param rawToken - Raw session or reset token.
 * @returns 64-character lowercase SHA-256 hexadecimal string.
 */
export function hashToken(rawToken: string): string {
  if (!rawToken || typeof rawToken !== "string") {
    throw new Error("Token must be a non-empty string.");
  }
  return crypto.createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/**
 * Performs a constant-time equality check between a candidate raw token and a stored SHA-256 hash.
 * Guards against timing side-channel attacks during token lookup.
 *
 * @param candidateToken - Raw token provided by user or client.
 * @param storedHash - Stored 64-character SHA-256 hex digest from the database.
 * @returns boolean indicating whether the hashes match identically.
 */
export function verifyTokenHash(candidateToken: string, storedHash: string): boolean {
  if (!candidateToken || !storedHash || storedHash.length !== 64) {
    return false;
  }

  const candidateHash = hashToken(candidateToken);

  try {
    const candidateBuffer = Buffer.from(candidateHash, "hex");
    const storedBuffer = Buffer.from(storedHash, "hex");

    if (candidateBuffer.length !== storedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(candidateBuffer, storedBuffer);
  } catch {
    return false;
  }
}

/**
 * Masks an email address for safe development and production logging.
 * Example: 'rohit.sharma@example.com' -> 'r****@example.com'
 *
 * @param email - Plaintext email address.
 * @returns Sanitized string safe for system logging.
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes("@")) {
    return "***@***";
  }

  const [local, domain] = email.split("@");
  if (!local || local.length <= 1) {
    return `*@${domain}`;
  }

  const firstChar = local.charAt(0);
  return `${firstChar}****@${domain}`;
}

/**
 * Masks a sensitive token or token hash for safe audit logging.
 * Example: 'e4b2d3c4f5...' -> 'e4b2***'
 *
 * @param token - Sensitive token or token digest.
 * @returns Sanitized string safe for logs.
 */
export function maskTokenPrefix(token: string): string {
  if (!token || token.length < 4) {
    return "****";
  }
  return `${token.substring(0, 4)}***`;
}
