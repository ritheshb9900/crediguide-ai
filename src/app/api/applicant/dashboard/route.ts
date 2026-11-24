import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { UserRole, ApplicationStatus } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/rbac";
import { toFinancialNumber } from "@/lib/financial";

/**
 * Active loan application statuses under review or operational processing.
 * DRAFT applications are excluded from the active count as they are unsubmitted.
 * Terminal states (APPROVED, DISBURSED, REJECTED, WITHDRAWN) are also excluded.
 */
const ACTIVE_STATUS_SET = new Set<ApplicationStatus>([
  ApplicationStatus.SUBMITTED,
  ApplicationStatus.UNDER_REVIEW,
  ApplicationStatus.DOCUMENTS_REQUIRED,
  ApplicationStatus.CONDITIONALLY_ELIGIBLE,
  ApplicationStatus.RECOMMENDED,
]);

interface ProfileFieldCheck {
  key: string;
  label: string;
  isFilled: boolean;
}

/**
 * Calculates accurate profile completion metrics without guesswork.
 */
function calculateProfileCompletion(applicant: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  employmentType: string;
  employerName: string | null;
  monthlyNetIncome: unknown;
  city: string | null;
  state: string | null;
  pincode: string | null;
  residenceType: string | null;
  age: number | null;
  dateOfBirth: Date | null;
}) {
  const isSalaried = applicant.employmentType?.toUpperCase().includes("SALARIED");
  const incomeNumber = toFinancialNumber(applicant.monthlyNetIncome as number) ?? 0;

  const checks: ProfileFieldCheck[] = [
    { key: "firstName", label: "First Name", isFilled: Boolean(applicant.firstName?.trim()) },
    { key: "lastName", label: "Last Name", isFilled: Boolean(applicant.lastName?.trim()) },
    { key: "email", label: "Email", isFilled: Boolean(applicant.email?.trim()) },
    { key: "phone", label: "Phone Number", isFilled: Boolean(applicant.phone?.trim()) },
    {
      key: "employmentType",
      label: "Employment Type",
      isFilled: Boolean(applicant.employmentType && applicant.employmentType !== "UNSPECIFIED"),
    },
    { key: "monthlyNetIncome", label: "Monthly Income", isFilled: incomeNumber > 0 },
    { key: "city", label: "City", isFilled: Boolean(applicant.city?.trim()) },
    { key: "state", label: "State", isFilled: Boolean(applicant.state?.trim()) },
    { key: "pincode", label: "PIN Code", isFilled: Boolean(applicant.pincode?.trim()) },
    { key: "residenceType", label: "Residence Type", isFilled: Boolean(applicant.residenceType?.trim()) },
    {
      key: "ageOrDob",
      label: "Age / Date of Birth",
      isFilled: Boolean((applicant.age && applicant.age > 0) || applicant.dateOfBirth),
    },
  ];

  if (isSalaried) {
    checks.push({
      key: "employerName",
      label: "Employer Name",
      isFilled: Boolean(applicant.employerName?.trim()),
    });
  }

  const completedCount = checks.filter((c) => c.isFilled).length;
  const totalCount = checks.length;
  const percentage = Math.round((completedCount / totalCount) * 100);
  const missingFields = checks.filter((c) => !c.isFilled).map((c) => c.label);

  return {
    percentage,
    isComplete: completedCount === totalCount,
    completedFields: completedCount,
    totalFields: totalCount,
    missingFields,
  };
}

export async function GET(request: Request) {
  // 1. Authoritative Role Verification: strictly LOAN_APPLICANT
  const auth = await requireRole(request, UserRole.LOAN_APPLICANT);
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const userId = auth.context.user.id;

    // 2. Derive Applicant Identity strictly from authenticated session context
    // Never trust client-supplied IDs or headers
    const applicant = await prisma.applicant.findFirst({
      where: {
        OR: [
          { userId },
          ...(auth.context.applicantId ? [{ id: auth.context.applicantId }] : []),
        ],
      },
    });

    // 3. Graceful handling when no applicant profile exists for the user
    if (!applicant) {
      return NextResponse.json({
        success: true,
        applicant: null,
        summary: {
          totalApplications: 0,
          activeApplications: 0,
          approvedApplications: 0,
          disbursedApplications: 0,
          draftApplications: 0,
          rejectedApplications: 0,
        },
        applications: [],
        recentAssessments: [],
        message: "No applicant profile linked to this user account.",
      });
    }

    // 4. Query Applications belonging strictly to this applicant
    const applications = await prisma.loanApplication.findMany({
      where: {
        applicantId: applicant.id,
        isDeleted: false,
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            productCode: true,
            minInterestRate: true,
            maxInterestRate: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // 5. Aggregate Summary Metrics
    const totalApplications = applications.length;
    let activeApplications = 0;
    let approvedApplications = 0;
    let disbursedApplications = 0;
    let draftApplications = 0;
    let rejectedApplications = 0;

    for (const app of applications) {
      if (ACTIVE_STATUS_SET.has(app.status)) {
        activeApplications++;
      } else if (app.status === ApplicationStatus.APPROVED) {
        approvedApplications++;
      } else if (app.status === ApplicationStatus.DISBURSED) {
        disbursedApplications++;
      } else if (app.status === ApplicationStatus.DRAFT) {
        draftApplications++;
      } else if (app.status === ApplicationStatus.REJECTED) {
        rejectedApplications++;
      }
    }

    // 6. Query Recent Eligibility Assessments
    const assessments = await prisma.eligibilityAssessment.findMany({
      where: {
        applicantId: applicant.id,
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            productCode: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    // 7. Calculate Profile Completion
    const profileCompletion = calculateProfileCompletion(applicant);

    // 8. Safe Response Serialization: Return only fields required by the dashboard overview
    // Unnecessary raw personal disclosures, financial data, and redundant user objects are omitted
    // Complete applicant disclosures remain fully available in the database, underwriting engine,
    // and upcoming dedicated profile management / bank-officer review workflows.
    return NextResponse.json({
      success: true,
      applicant: {
        id: applicant.id,
        firstName: applicant.firstName,
        lastName: applicant.lastName,
        profileCompletion,
      },
      summary: {
        totalApplications,
        activeApplications,
        approvedApplications,
        disbursedApplications,
        draftApplications,
        rejectedApplications,
      },
      applications: applications.map((app) => ({
        id: app.id,
        applicationNumber: app.applicationNumber,
        productName: app.product.name,
        productCode: app.product.productCode,
        requestedAmount: toFinancialNumber(app.requestedAmount),
        requestedTenureMonths: app.requestedTenureMonths,
        purpose: app.purpose,
        status: app.status,
        submissionDate: app.submissionDate,
        createdAt: app.createdAt,
        updatedAt: app.updatedAt,
      })),
      recentAssessments: assessments.map((a) => ({
        id: a.id,
        productName: a.product.name,
        productCode: a.product.productCode,
        requestedAmount: toFinancialNumber(a.requestedAmount),
        requestedTenureMonths: a.requestedTenureMonths,
        status: a.status,
        eligibleAmount: toFinancialNumber(a.eligibleAmount),
        indicativeInterestRate: toFinancialNumber(a.indicativeInterestRate),
        indicativeEmi: toFinancialNumber(a.indicativeEmi),
        summary: a.summary,
        createdAt: a.createdAt,
      })),
    });
  } catch (error) {
    console.error("[Applicant Dashboard API] Database error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "INTERNAL_ERROR",
        message: "Failed to load dashboard data. Please try again later.",
      },
      { status: 500 }
    );
  }
}
