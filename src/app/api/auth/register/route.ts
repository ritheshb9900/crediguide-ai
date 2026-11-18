import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/generated/prisma/enums";
import { RegisterApplicantInputSchema } from "@/lib/auth/validation";
import { hashPassword } from "@/lib/auth/password";
import { generateSecureToken, hashToken } from "@/lib/auth/tokens";
import { getEmailProvider } from "@/lib/auth/email-provider";

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_JSON",
          message: "Invalid JSON in request payload.",
        },
        { status: 400 }
      );
    }

    // 1. Strict Server-Side Input Validation
    const validationResult = RegisterApplicantInputSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "VALIDATION_FAILED",
          message: "Input validation failed. Please check applicant details.",
          details: validationResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const input = validationResult.data;

    // 2. Reserved Domain Rejection (RFC 2606 Demonstration Domain)
    if (input.email.endsWith("@example.com")) {
      return NextResponse.json(
        {
          success: false,
          error: "RESERVED_DOMAIN",
          message: "Registration cannot use reserved demonstration domain (@example.com).",
        },
        { status: 400 }
      );
    }

    // 3. Synthetic Applicant Protection Check
    const existingApplicant = await prisma.applicant.findUnique({
      where: { email: input.email },
      select: { id: true, email: true },
    });

    if (existingApplicant) {
      if (
        existingApplicant.id.startsWith("demo-app-") ||
        existingApplicant.email.toLowerCase().endsWith("@example.com")
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "DEMO_APPLICANT_PROTECTED",
            message: "Registration cannot use reserved demonstration applicant credentials.",
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: "EMAIL_ALREADY_EXISTS",
          message: "An account with this email address already exists.",
        },
        { status: 409 }
      );
    }

    // 4. Existing User Check
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          error: "EMAIL_ALREADY_EXISTS",
          message: "An account with this email address already exists.",
        },
        { status: 409 }
      );
    }

    // 5. Password Hashing (Argon2id exclusively on server)
    const passwordHash = await hashPassword(input.password);

    // 6. Generate Verification Token
    const rawVerificationToken = generateSecureToken(32);
    const tokenHash = hashToken(rawVerificationToken);
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // 7. Atomic Prisma Transaction (User + Applicant + VerificationToken)
    let createdRecords;
    try {
      createdRecords = await prisma.$transaction(async (tx) => {
        // Create User - Strictly assigned UserRole.LOAN_APPLICANT
        const user = await tx.user.create({
          data: {
            email: input.email,
            passwordHash,
            role: UserRole.LOAN_APPLICANT,
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone || null,
            isActive: true,
            isEmailVerified: false,
            failedLoginAttempts: 0,
          },
        });

        // Create Applicant linked 1-to-1 to User
        const applicant = await tx.applicant.create({
          data: {
            userId: user.id,
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
            phone: input.phone || null,
            employmentType: input.employmentType || "UNSPECIFIED",
            monthlyNetIncome:
              input.monthlyNetIncome != null
                ? new Prisma.Decimal(input.monthlyNetIncome)
                : new Prisma.Decimal(0.00),
            existingMonthlyEmi: new Prisma.Decimal(0.00),
          },
        });

        // Create EmailVerificationToken storing only SHA-256 digest
        await tx.emailVerificationToken.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt: verificationExpiresAt,
          },
        });

        return { user, applicant };
      });
    } catch (dbError) {
      // Catch unique constraint violation (P2002) in case of concurrent registrations
      if (
        dbError instanceof Prisma.PrismaClientKnownRequestError &&
        dbError.code === "P2002"
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "EMAIL_ALREADY_EXISTS",
            message: "An account with this email address already exists.",
          },
          { status: 409 }
        );
      }
      throw dbError;
    }

    const { user, applicant } = createdRecords;

    // 8. Dispatch Verification Email via Abstraction
    const emailProvider = getEmailProvider();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const verificationUrl = `${appUrl}/auth/verify-email?token=${rawVerificationToken}`;

    const emailResult = await emailProvider.sendEmailVerification({
      to: user.email,
      recipientName: `${user.firstName} ${user.lastName}`,
      actionUrl: verificationUrl,
      expiresInMinutes: 24 * 60,
      tokenHashPrefix: tokenHash.substring(0, 8),
    });

    // 9. Sanitized Response (Zero passwordHash or raw token leakage)
    return NextResponse.json(
      {
        success: true,
        message: "Applicant registration successful.",
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
        },
        applicantId: applicant.id,
        emailDelivery: {
          dispatched: emailResult.success,
          message: emailResult.success
            ? "Verification email has been dispatched. Please check your inbox."
            : "Outbound email delivery is currently disabled. Account remains unverified.",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error processing applicant registration:", error);
    return NextResponse.json(
      {
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "An internal error occurred during registration. Please try again.",
      },
      { status: 500 }
    );
  }
}
