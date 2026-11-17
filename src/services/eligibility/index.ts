import { getDataProvider } from "@/services/data";
import {
  DeterministicAssessmentResponse,
  EligibilityAssessmentRequest,
} from "@/types/domain";
import { evaluateLoanEligibility } from "./engine";

/**
 * Service that orchestrates deterministic loan eligibility evaluation:
 * 1. Fetches product, rules, and document requirements from ILoanDataProvider
 * 2. Evaluates the applicant deterministically
 * 3. Persists assessment in the active data provider
 * 4. Returns structured explainable output
 */
export async function assessLoanEligibility(
  request: EligibilityAssessmentRequest
): Promise<DeterministicAssessmentResponse> {
  const dataProvider = getDataProvider();

  // 1. Resolve Loan Product (by code, id, or default to standard demonstration product)
  let product = null;

  if (request.productCode) {
    product = await dataProvider.getLoanProductByCode(request.productCode);
  } else if (request.productId) {
    const products = await dataProvider.getLoanProducts();
    product = products.find((p) => p.id === request.productId) || null;
  }

  // Fallback to primary demonstration product
  if (!product) {
    product = await dataProvider.getLoanProductByCode("PL_STANDARD");
  }
  if (!product) {
    const products = await dataProvider.getLoanProducts();
    product = products[0] || null;
  }

  if (!product) {
    throw new Error("No active loan product available in the data provider.");
  }

  // 2. Fetch Rules and Document Requirements through data provider abstraction
  const [rules, documents] = await Promise.all([
    dataProvider.getEligibilityRules(product.id),
    dataProvider.getDocumentRequirements(product.id),
  ]);

  // 3. Execute Deterministic Evaluation Engine
  const evaluationResult = evaluateLoanEligibility({
    applicant: request.applicant,
    requestedAmount: request.requestedAmount,
    requestedTenureMonths: request.requestedTenureMonths,
    product,
    rules,
    documents,
  });

  // 4. Persist Record to Data Provider (if supported)
  try {
    const savedApplicant = await dataProvider.saveApplicant({
      firstName: request.applicant.firstName,
      lastName: request.applicant.lastName,
      email: request.applicant.email,
      phone: request.applicant.phone || null,
      age: request.applicant.age,
      employmentType: request.applicant.employmentType,
      employerName: request.applicant.employerName || null,
      monthlyNetIncome: request.applicant.monthlyNetIncome,
      existingMonthlyEmi: request.applicant.existingMonthlyEmi,
      creditScore: request.applicant.creditScore || null,
      city: request.applicant.city || null,
      state: request.applicant.state || null,
      pincode: request.applicant.pincode || null,
      residenceType: request.applicant.residenceType || null,
      workExperienceYears: request.applicant.workExperienceYears || null,
    });

    await dataProvider.saveAssessment({
      applicantId: savedApplicant.id,
      productId: product.id,
      requestedAmount: request.requestedAmount,
      requestedTenureMonths: request.requestedTenureMonths,
      status: evaluationResult.status,
      eligibleAmount: evaluationResult.financialMetrics.maxEligibleAmount,
      indicativeInterestRate: evaluationResult.financialMetrics.indicativeInterestRate,
      indicativeEmi: evaluationResult.financialMetrics.proposedMonthlyEmi,
      foir: evaluationResult.financialMetrics.existingFoirPercentage / 100,
      confidenceScore: 1.0, // 100% deterministic rule confidence
      riskTier: evaluationResult.status === "ELIGIBLE" ? "LOW" : evaluationResult.status === "CONDITIONAL" ? "MODERATE" : "HIGH",
      summary: evaluationResult.reasons.join(" "),
      disclaimer: evaluationResult.disclaimer,
      source: "DETERMINISTIC_API",
      criteria: evaluationResult.criteria.map((c) => ({
        criterionName: c.criterion,
        criterionCategory: "POLICY_RULE",
        passed: c.status === "PASS",
        actualValue: c.applicantValue,
        expectedValue: c.requiredValue,
        explanation: c.explanation,
        isMandatory: Boolean(c.isMandatory),
      })),
    });
  } catch (err) {
    // Non-fatal logging: persistence should never block returning assessment to client
    console.warn("Notice: Assessment persistence bypassed:", err);
  }

  return evaluationResult;
}

export * from "./engine";
export * from "./financial-math";
