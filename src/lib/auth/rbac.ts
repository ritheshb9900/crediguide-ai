import { NextResponse } from "next/server";
import { UserRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { extractSessionTokenFromRequest, validateDatabaseSession } from "./session";
import { SessionContext } from "./types";

/**
 * Granular permissions supported by the CrediGuide AI platform.
 */
export type Permission =
  | "APPLICANT_READ_SELF"
  | "APPLICANT_SUBMIT_APPLICATION"
  | "APPLICANT_UPLOAD_DOCUMENT"
  | "OFFICER_REVIEW_APPLICATION"
  | "OFFICER_VERIFY_DOCUMENT"
  | "OFFICER_VIEW_ASSIGNED"
  | "ADMIN_PROVISION_OFFICER"
  | "ADMIN_MANAGE_POLICY"
  | "ADMIN_AUDIT_LOGS"
  | "ADMIN_VIEW_ALL";

/**
 * Canonical Role-to-Permissions mapping matrix.
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  [UserRole.LOAN_APPLICANT]: [
    "APPLICANT_READ_SELF",
    "APPLICANT_SUBMIT_APPLICATION",
    "APPLICANT_UPLOAD_DOCUMENT",
  ],
  [UserRole.BANK_OFFICER]: [
    "OFFICER_REVIEW_APPLICATION",
    "OFFICER_VERIFY_DOCUMENT",
    "OFFICER_VIEW_ASSIGNED",
  ],
  [UserRole.BANK_ADMIN]: [
    "ADMIN_PROVISION_OFFICER",
    "ADMIN_MANAGE_POLICY",
    "ADMIN_AUDIT_LOGS",
    "ADMIN_VIEW_ALL",
  ],
} as const;

/**
 * Evaluates whether a given UserRole possesses the requested permission.
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) {
    return false;
  }
  return permissions.includes(permission);
}

/**
 * Structured authorization outcome returned by route guard helpers.
 */
export type AuthorizationResult =
  | { authorized: true; context: SessionContext }
  | { authorized: false; response: NextResponse };

/**
 * Authoritatively verifies that an incoming request has a valid, active database session.
 *
 * @param request - Incoming Web or NextRequest.
 * @returns AuthorizationResult containing authenticated SessionContext, or HTTP 401 response.
 */
export async function requireAuth(request: Request): Promise<AuthorizationResult> {
  const rawToken = extractSessionTokenFromRequest(request);

  if (!rawToken) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          success: false,
          error: "UNAUTHENTICATED",
          message: "Authentication required. No session cookie provided.",
        },
        { status: 401 }
      ),
    };
  }

  const validationResult = await validateDatabaseSession(rawToken);

  if (!validationResult.isValid) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          success: false,
          error: "UNAUTHENTICATED",
          message: "Session is invalid, expired, or revoked. Please log in again.",
        },
        { status: 401 }
      ),
    };
  }

  return {
    authorized: true,
    context: validationResult.context,
  };
}

/**
 * Authoritatively verifies that the caller is authenticated AND has the exact required role.
 *
 * @param request - Incoming Request.
 * @param allowedRole - Required UserRole enum value.
 * @returns AuthorizationResult with context or 401/403 NextResponse.
 */
export async function requireRole(
  request: Request,
  allowedRole: UserRole
): Promise<AuthorizationResult> {
  const auth = await requireAuth(request);
  if (!auth.authorized) {
    return auth;
  }

  if (auth.context.user.role !== allowedRole) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          success: false,
          error: "FORBIDDEN",
          message: "Forbidden: Insufficient permissions for this resource.",
        },
        { status: 403 }
      ),
    };
  }

  return auth;
}

/**
 * Authoritatively verifies that the caller is authenticated AND matches any of the allowed roles.
 *
 * @param request - Incoming Request.
 * @param allowedRoles - Array of permitted UserRole enum values.
 * @returns AuthorizationResult with context or 401/403 NextResponse.
 */
export async function requireAnyRole(
  request: Request,
  allowedRoles: UserRole[]
): Promise<AuthorizationResult> {
  const auth = await requireAuth(request);
  if (!auth.authorized) {
    return auth;
  }

  if (!allowedRoles.includes(auth.context.user.role)) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          success: false,
          error: "FORBIDDEN",
          message: "Forbidden: Insufficient permissions for this resource.",
        },
        { status: 403 }
      ),
    };
  }

  return auth;
}

/**
 * Strict Applicant IDOR Guard.
 *
 * Evaluates strictly whether the authenticated caller is a LOAN_APPLICANT and owns the
 * requested applicant record.
 *
 * SECURITY INVARIANT:
 * - Returns true IF AND ONLY IF caller is LOAN_APPLICANT and context.applicantId matches targetApplicantId.
 * - Returns false for any other applicant ID (prevents horizontal IDOR).
 * - Returns false for BANK_OFFICER and BANK_ADMIN. Internal staff never masquerade as applicant owners.
 */
export function requireApplicantOwnership(
  context: SessionContext,
  targetApplicantId: string
): boolean {
  if (context.user.role !== UserRole.LOAN_APPLICANT) {
    return false;
  }

  if (!context.applicantId || !targetApplicantId) {
    return false;
  }

  return context.applicantId === targetApplicantId;
}

/**
 * Explicit Bank Officer Operational Assignment Guard.
 *
 * Verifies that the authenticated caller is a BANK_OFFICER and is assigned to the
 * specified loan application.
 *
 * SECURITY INVARIANT:
 * - Returns false if caller is not a BANK_OFFICER.
 * - Queries the database to verify assignedOfficerId === context.user.id.
 * - An unassigned officer is denied access.
 */
export async function canOfficerAccessApplication(
  context: SessionContext,
  applicationId: string
): Promise<boolean> {
  if (context.user.role !== UserRole.BANK_OFFICER) {
    return false;
  }

  if (!applicationId || typeof applicationId !== "string") {
    return false;
  }

  const application = await prisma.loanApplication.findUnique({
    where: { id: applicationId },
    select: { assignedOfficerId: true },
  });

  if (!application) {
    return false;
  }

  return application.assignedOfficerId === context.user.id;
}
