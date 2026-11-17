import { getAIService } from "@/services/ai";
import {
  ConversationState,
  ChatServiceResponse,
  ChatServiceResponseSchema,
} from "@/services/ai/types";
import {
  EligibilityAssessmentRequest,
  EligibilityAssessmentRequestSchema,
  EmploymentType,
} from "@/types/domain";
import { assessLoanEligibility } from "@/services/eligibility";

/**
 * Orchestrates the end-to-end conversational eligibility assessment flow:
 * 
 * 1. User message
 *    ↓
 * 2. MockAIService natural language extraction & normalization
 *    ↓
 * 3. Update conversation state & check required fields
 *    ↓
 * 4. If missing fields: return conversational next question (DO NOT call engine)
 *    ↓
 * 5. If all required fields present:
 *      - Construct EligibilityAssessmentRequest
 *      - Validate strictly via Zod
 *      - Call deterministic eligibility engine (assessLoanEligibility)
 *      - Return full explainable assessment alongside conversational explanation
 */
export async function orchestrateChatAssessment(
  userMessage: string,
  conversationState?: Partial<ConversationState>
): Promise<ChatServiceResponse> {
  // 1. Invoke Provider-Agnostic AI Service (Mock AI in Stage 3)
  const aiService = getAIService();
  const chatResponse = await aiService.processChatMessage(userMessage, conversationState);

  // 2. If required demo fields are still missing, return next question immediately
  // CRITICAL RULE: Never call the eligibility engine until all parameters are collected.
  if (!chatResponse.readyForAssessment) {
    return ChatServiceResponseSchema.parse(chatResponse);
  }

  // 3. All required fields are present -> Assemble and validate eligibility request
  const profile = chatResponse.extractedData;

  const assessmentPayload: EligibilityAssessmentRequest = {
    applicant: {
      firstName: profile.firstName || "Applicant",
      lastName: profile.lastName || "Demo",
      email: profile.email || "applicant@demo-borrower.com",
      phone: profile.phone || "9876543210",
      age: profile.age!,
      employmentType: profile.employmentType as EmploymentType,
      employerName: profile.employerName || "Employer",
      monthlyNetIncome: profile.monthlyNetIncome!,
      existingMonthlyEmi: profile.existingMonthlyEmi ?? 0,
      creditScore: profile.creditScore,
    },
    requestedAmount: profile.requestedAmount!,
    requestedTenureMonths: profile.requestedTenureMonths!,
    productCode: "PL_STANDARD",
  };

  // Strict server-side Zod validation
  const validatedRequest = EligibilityAssessmentRequestSchema.parse(assessmentPayload);

  // 4. Call Deterministic Eligibility Engine (The ONLY source of truth for eligibility)
  const assessment = await assessLoanEligibility(validatedRequest);

  // 5. Generate conversational explanation reflecting deterministic output
  // The AI wording NEVER alters or overrides the deterministic calculations
  let explanationMessage = "";
  if (assessment.status === "ELIGIBLE") {
    explanationMessage = `Preliminary Assessment Complete: ELIGIBLE. Based on your declared monthly income of ₹${profile.monthlyNetIncome?.toLocaleString("en-IN")} and existing EMI of ₹${profile.existingMonthlyEmi?.toLocaleString("en-IN")}, your estimated monthly EMI for ₹${profile.requestedAmount?.toLocaleString("en-IN")} over ${profile.requestedTenureMonths} months is ₹${assessment.financialMetrics.proposedMonthlyEmi.toLocaleString("en-IN")} (Total FOIR: ${assessment.financialMetrics.totalFoirPercentage.toFixed(2)}%). Complete applicable KYC verification with the lender. Proceed to lender verification and formal underwriting.`;
  } else if (assessment.status === "CONDITIONAL") {
    explanationMessage = `Preliminary Assessment Complete: CONDITIONAL. ${assessment.reasons.join(" ")} You may proceed with an adjusted conditional loan amount up to ₹${assessment.financialMetrics.maxEligibleAmount.toLocaleString("en-IN")}. Complete applicable KYC verification with the lender.`;
  } else {
    explanationMessage = `Preliminary Assessment Complete: NOT ELIGIBLE. ${assessment.reasons.join(" ")} Review the criteria breakdown and next steps below.`;
  }

  // 6. Return combined structured response
  const orchestratedResponse: ChatServiceResponse = {
    ...chatResponse,
    message: explanationMessage,
    assessment,
    status: assessment.status,
    financialMetrics: assessment.financialMetrics,
    criteria: assessment.criteria,
    reasons: assessment.reasons,
    documents: assessment.documents,
    nextSteps: assessment.nextSteps,
  };

  return ChatServiceResponseSchema.parse(orchestratedResponse);
}
