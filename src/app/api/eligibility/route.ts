import { NextResponse } from "next/server";
import { EligibilityAssessmentRequestSchema } from "@/types/domain";
import { assessLoanEligibility } from "@/services/eligibility";

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid JSON in request payload.",
        },
        { status: 400 }
      );
    }

    // 1. Strict Server-Side Input Validation with Zod
    const validationResult = EligibilityAssessmentRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Input validation failed. Please check applicant details and loan parameters.",
          details: validationResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    // 2. Perform Deterministic Assessment
    const assessment = await assessLoanEligibility(validationResult.data);

    // 3. Return Structured Explainable Assessment
    return NextResponse.json(
      {
        success: true,
        assessment,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error executing loan eligibility assessment:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error occurred while processing loan eligibility assessment.",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
