import { UserRole } from "@/generated/prisma/enums";

/**
 * Sanitized user data safe to pass across server-side service boundaries.
 * Excludes passwordHash.
 */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  phone: string | null;
  isActive: boolean;
  isEmailVerified: boolean;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Session metadata retrieved from the database.
 */
export interface SessionData {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

/**
 * Bank Officer Profile summary for authenticated officers.
 */
export interface OfficerProfileSummary {
  id: string;
  employeeCode: string;
  department: string;
  branchCode: string | null;
  designation: string;
  approvalLimitAmount: number;
}

/**
 * Authenticated session context containing verified user, session, and associated profiles.
 */
export interface SessionContext {
  user: AuthUser;
  session: SessionData;
  applicantId: string | null;
  officerProfile: OfficerProfileSummary | null;
}

/**
 * Result of database session verification.
 */
export type SessionValidationResult =
  | { isValid: true; context: SessionContext }
  | {
      isValid: false;
      reason: "EXPIRED" | "REVOKED" | "INACTIVE_USER" | "NOT_FOUND" | "MALFORMED";
    };

/**
 * Cookie configuration options for the crediguide_session cookie.
 */
export interface SessionCookieConfig {
  name: string;
  value: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  path: string;
  maxAge: number;
  expires: Date;
}

/**
 * Result returned by rate limiter implementations.
 */
export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: Date;
  retryAfterSeconds?: number;
}

/**
 * Pluggable rate limiter abstraction.
 */
export interface IRateLimiter {
  readonly providerName: string;
  consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}

/**
 * Email dispatch payload.
 */
export interface EmailPayload {
  to: string;
  recipientName: string;
  actionUrl: string;
  expiresInMinutes: number;
  rawToken?: string;
  tokenHashPrefix?: string;
}

/**
 * Result of email delivery attempt.
 */
export interface EmailDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Pluggable email provider abstraction.
 */
export interface IEmailProvider {
  readonly providerName: string;
  sendPasswordReset(payload: EmailPayload): Promise<EmailDeliveryResult>;
  sendEmailVerification(payload: EmailPayload): Promise<EmailDeliveryResult>;
}

/**
 * In-memory test sink record for safe development email inspection.
 */
export interface DevEmailSinkRecord {
  id: string;
  type: "PASSWORD_RESET" | "EMAIL_VERIFICATION";
  to: string;
  recipientName: string;
  actionUrl: string;
  expiresInMinutes: number;
  timestamp: Date;
}
