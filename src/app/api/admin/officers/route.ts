import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { UserRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/rbac";
import { hashPassword } from "@/lib/auth/password";
import { OfficerProvisioningInputSchema } from "@/lib/auth/validation";
import { requireCsrf } from "@/lib/auth/csrf";

/**
 * POST /api/admin/officers
 *
 * Provision a new internal Bank Officer with an associated OfficerProfile.
 *
 * SECURITY & GOVERNANCE INVARIANTS:
 * 1. Authoritative Access Control: Restricted strictly to authenticated BANK_ADMIN callers.
 *    Non-admin callers receive HTTP 403 Forbidden.
 * 2. Strict Input Validation: Rejects role escalation or malformed payloads via OfficerProvisioningInputSchema.
 * 3. Conflict Prevention: Rejects pre-existing emails or employee codes with HTTP 409 Conflict.
 * 4. Password Security: Hashes temporary password via Argon2id with OWASP parameters.
 * 5. Atomic Transaction: User and OfficerProfile are created together; failure in either rolls back both.
 * 6. Email Verification State: isEmailVerified is set to FALSE by default. Administrative provisioning
 *    does NOT silently assert email ownership.
 * 7. Zero Credential Leakage: Passwords and hashes are never returned in the API response.
 */
export async function POST(request: Request) {
  const csrfError = requireCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  try {
    // 1. Enforce strict BANK_ADMIN role authorization
    const auth = await requireRole(request, UserRole.BANK_ADMIN);
    if (!auth.authorized) {
      return auth.response;
    }

    // 2. Parse and validate JSON payload
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_JSON",
          message: "Request body must be valid JSON.",
        },
        { status: 400 }
      );
    }

    const parseResult = OfficerProvisioningInputSchema.safeParse(rawBody);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      return NextResponse.json(
        {
          success: false,
          error: "VALIDATION_ERROR",
          message: issue?.message || "Invalid officer provisioning data.",
          field: issue?.path.join("."),
        },
        { status: 400 }
      );
    }

    const input = parseResult.data;

    // 3. Pre-check uniqueness of email and employeeCode
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          error: "EMAIL_ALREADY_EXISTS",
          message: "A user with this email address already exists.",
        },
        { status: 409 }
      );
    }

    const existingCode = await prisma.officerProfile.findUnique({
      where: { employeeCode: input.employeeCode },
      select: { id: true },
    });
    if (existingCode) {
      return NextResponse.json(
        {
          success: false,
          error: "EMPLOYEE_CODE_ALREADY_EXISTS",
          message: "An officer with this employee code already exists.",
        },
        { status: 409 }
      );
    }

    // 4. Hash temporary password with Argon2id
    const passwordHash = await hashPassword(input.temporaryPassword);

    // 5. Atomic creation of User and OfficerProfile inside Prisma transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          role: UserRole.BANK_OFFICER,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone || null,
          isActive: true,
          // Newly provisioned officers remain unverified until completing explicit verification
          isEmailVerified: false,
        },
      });

      const officerProfile = await tx.officerProfile.create({
        data: {
          userId: user.id,
          employeeCode: input.employeeCode,
          department: input.department,
          branchCode: input.branchCode || null,
          designation: input.designation,
          approvalLimitAmount: new Prisma.Decimal(input.approvalLimitAmount),
        },
      });

      return { user, officerProfile };
    });

    // 6. Return sanitized officer details (No passwordHash or temporaryPassword)
    return NextResponse.json(
      {
        success: true,
        message: "Bank officer provisioned successfully.",
        officer: {
          id: result.officerProfile.id,
          userId: result.user.id,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          phone: result.user.phone,
          employeeCode: result.officerProfile.employeeCode,
          department: result.officerProfile.department,
          branchCode: result.officerProfile.branchCode,
          designation: result.officerProfile.designation,
          approvalLimitAmount: Number(result.officerProfile.approvalLimitAmount),
          isEmailVerified: result.user.isEmailVerified,
          createdAt: result.officerProfile.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error provisioning bank officer:", error);
    return NextResponse.json(
      {
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "An internal error occurred while provisioning the bank officer.",
      },
      { status: 500 }
    );
  }
}
