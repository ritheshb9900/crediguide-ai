import {
  ApplicantProfile,
  DeterministicAssessmentResponse,
  ExplainedCriterion,
  FinancialMetrics,
  DocumentItem,
  EligibilityStatus,
} from "@/types/domain";
import { LoanProductData, EligibilityRuleData, DocumentRequirementData } from "../data/types";
import {
  calculateReducingBalanceEmi,
  calculateExistingFoir,
  calculateTotalFoir,
  calculateAvailableMonthlyHeadroom,
  calculateMaxEligibleLoanAmount,
  calculateEmiBurdenRatio,
} from "./financial-math";
import { formatCurrencyINR } from "@/lib/utils";

export interface DeterministicEvaluationInput {
  applicant: ApplicantProfile;
  requestedAmount: number;
  requestedTenureMonths: number;
  product: LoanProductData;
  rules: EligibilityRuleData[];
  documents: DocumentRequirementData[];
}

/**
 * Normalizes applicant employment type string into "Salaried" | "Self-employed" | "Unsupported"
 */
export function normalizeEmploymentType(raw: string): "Salaried" | "Self-employed" | "Unsupported" {
  const cleaned = raw.trim().toUpperCase().replace(/[-_\s]+/g, "");
  if (cleaned.includes("SALARIED")) {
    return "Salaried";
  }
  if (cleaned.includes("SELF") || cleaned.includes("EMPLOYED") || cleaned.includes("BUSINESS") || cleaned.includes("PROFESSIONAL")) {
    return "Self-employed";
  }
  return "Unsupported";
}

/**
 * Evaluates personal loan eligibility deterministically based on product rules and mathematical formulas.
 */
export function evaluateLoanEligibility(
  input: DeterministicEvaluationInput
): DeterministicAssessmentResponse {
  const { applicant, requestedAmount, requestedTenureMonths, product, documents } = input;

  // 1. Establish Demonstration Thresholds (from product or fallback configuration)
  const MIN_AGE = 21;
  const MAX_AGE = 60;
  const MIN_INCOME = 30000;
  const MAX_FOIR_THRESHOLD = 50.0; // Configurable demonstration rule threshold (50%)
  const MIN_TENURE_MONTHS = product.minTenureMonths || 12; // 1 year
  const MAX_TENURE_MONTHS = product.maxTenureMonths || 84; // 7 years
  const INDICATIVE_RATE = product.minInterestRate || 10.5;

  // 2. Perform Financial Calculations
  const existingFoir = calculateExistingFoir(
    applicant.existingMonthlyEmi,
    applicant.monthlyNetIncome
  );

  const proposedEmi = calculateReducingBalanceEmi(
    requestedAmount,
    INDICATIVE_RATE,
    requestedTenureMonths
  );

  const totalFoir = calculateTotalFoir(
    applicant.existingMonthlyEmi,
    proposedEmi,
    applicant.monthlyNetIncome
  );

  const availableMonthlyCapacity = calculateAvailableMonthlyHeadroom(
    applicant.monthlyNetIncome,
    applicant.existingMonthlyEmi,
    MAX_FOIR_THRESHOLD
  );

  const maxEligibleAmount = calculateMaxEligibleLoanAmount(
    applicant.monthlyNetIncome,
    applicant.existingMonthlyEmi,
    MAX_FOIR_THRESHOLD,
    INDICATIVE_RATE,
    requestedTenureMonths,
    product.maxAmount
  );

  const emiBurdenRatio = calculateEmiBurdenRatio(
    applicant.existingMonthlyEmi,
    applicant.monthlyNetIncome
  );

  const financialMetrics: FinancialMetrics = {
    monthlyIncome: applicant.monthlyNetIncome,
    existingEmi: applicant.existingMonthlyEmi,
    requestedAmount,
    requestedTenureMonths,
    indicativeInterestRate: INDICATIVE_RATE,
    proposedMonthlyEmi: proposedEmi,
    existingFoirPercentage: existingFoir,
    totalFoirPercentage: totalFoir,
    maxEligibleAmount,
    emiBurdenRatio,
    availableMonthlyCapacity,
  };

  // 3. Evaluate Criteria One by One
  const criteria: ExplainedCriterion[] = [];
  const reasons: string[] = [];

  // CRITERION 1: Age Rule (Min 21, Max 60)
  const agePassed = applicant.age >= MIN_AGE && applicant.age <= MAX_AGE;
  criteria.push({
    criterion: "Applicant Age Range",
    applicantValue: `${applicant.age} years`,
    requiredValue: `${MIN_AGE} to ${MAX_AGE} years`,
    status: agePassed ? "PASS" : "FAIL",
    explanation: agePassed
      ? `Applicant's age of ${applicant.age} is within the required range of ${MIN_AGE} to ${MAX_AGE} years.`
      : `Applicant's age of ${applicant.age} fails the age criteria. Minimum age is ${MIN_AGE} and maximum age is ${MAX_AGE} years.`,
    isMandatory: true,
  });
  if (!agePassed) {
    reasons.push(
      applicant.age < MIN_AGE
        ? `Applicant is ${applicant.age} years old, which is below the minimum age of ${MIN_AGE}.`
        : `Applicant is ${applicant.age} years old, which exceeds the maximum maturity age of ${MAX_AGE}.`
    );
  }

  // CRITERION 2: Minimum Income Rule (₹30,000)
  const incomePassed = applicant.monthlyNetIncome >= MIN_INCOME;
  criteria.push({
    criterion: "Minimum Monthly Income",
    applicantValue: formatCurrencyINR(applicant.monthlyNetIncome),
    requiredValue: `${formatCurrencyINR(MIN_INCOME)} or more`,
    status: incomePassed ? "PASS" : "FAIL",
    explanation: incomePassed
      ? `The applicant's monthly income (${formatCurrencyINR(applicant.monthlyNetIncome)}) is above the configured minimum threshold of ${formatCurrencyINR(MIN_INCOME)}.`
      : `The applicant's monthly income (${formatCurrencyINR(applicant.monthlyNetIncome)}) is below the required threshold of ${formatCurrencyINR(MIN_INCOME)}.`,
    isMandatory: true,
  });
  if (!incomePassed) {
    reasons.push(
      `Monthly income of ${formatCurrencyINR(applicant.monthlyNetIncome)} is lower than the mandatory minimum of ${formatCurrencyINR(MIN_INCOME)}.`
    );
  }

  // CRITERION 3: EMI / FOIR Rule (Max 50%)
  const foirPassed = existingFoir <= MAX_FOIR_THRESHOLD;
  criteria.push({
    criterion: "Existing FOIR (Configurable Demonstration Rule)",
    applicantValue: `${existingFoir.toFixed(2)}% (${formatCurrencyINR(applicant.existingMonthlyEmi)} / month)`,
    requiredValue: `${MAX_FOIR_THRESHOLD.toFixed(2)}% or lower (Configurable Demonstration Rule)`,
    status: foirPassed ? "PASS" : "FAIL",
    explanation: foirPassed
      ? `Existing monthly debt burden (FOIR) of ${existingFoir.toFixed(2)}% is within the allowable demonstration threshold of ${MAX_FOIR_THRESHOLD.toFixed(2)}%.`
      : `Existing monthly debt burden (FOIR) of ${existingFoir.toFixed(2)}% exceeds the allowable demonstration threshold of ${MAX_FOIR_THRESHOLD.toFixed(2)}%. Existing obligations consume too high a portion of monthly income.`,
    isMandatory: true,
  });
  if (!foirPassed) {
    reasons.push(
      `Existing debt-to-income ratio (FOIR) of ${existingFoir.toFixed(2)}% exceeds the allowable demonstration threshold of ${MAX_FOIR_THRESHOLD.toFixed(2)}%.`
    );
  }

  // CRITERION 4: Loan Tenure Range (1 to 7 years)
  const tenurePassed =
    requestedTenureMonths >= MIN_TENURE_MONTHS && requestedTenureMonths <= MAX_TENURE_MONTHS;
  criteria.push({
    criterion: "Loan Tenure Range",
    applicantValue: `${requestedTenureMonths} months (${(requestedTenureMonths / 12).toFixed(1)} years)`,
    requiredValue: `${MIN_TENURE_MONTHS} to ${MAX_TENURE_MONTHS} months (1 to 7 years)`,
    status: tenurePassed ? "PASS" : "FAIL",
    explanation: tenurePassed
      ? `Requested tenure of ${requestedTenureMonths} months is within the allowed range of 1 to 7 years (${MIN_TENURE_MONTHS}–${MAX_TENURE_MONTHS} months).`
      : `Requested tenure of ${requestedTenureMonths} months is outside the allowed range of 1 to 7 years (${MIN_TENURE_MONTHS}–${MAX_TENURE_MONTHS} months).`,
    isMandatory: true,
  });
  if (!tenurePassed) {
    reasons.push(
      `Requested tenure of ${requestedTenureMonths} months is outside the product limits (12 to 84 months).`
    );
  }

  // CRITERION 5: Employment Type (Salaried or Self-employed)
  const normalizedEmp = normalizeEmploymentType(applicant.employmentType);
  const employmentPassed = normalizedEmp !== "Unsupported";
  criteria.push({
    criterion: "Eligible Employment Type",
    applicantValue: applicant.employmentType,
    requiredValue: "Salaried or Self-employed",
    status: employmentPassed ? "PASS" : "FAIL",
    explanation: employmentPassed
      ? `Applicant employment type '${applicant.employmentType}' (normalized: ${normalizedEmp}) is supported by this loan product.`
      : `Applicant employment type '${applicant.employmentType}' is not supported. Product requires Salaried or Self-employed applicants.`,
    isMandatory: true,
  });
  if (!employmentPassed) {
    reasons.push(
      `Employment type '${applicant.employmentType}' is not supported. Must be Salaried or Self-employed.`
    );
  }

  // CRITERION 6: Requested Amount vs Calculated Repayment Capacity
  const amountWithinProductLimits =
    requestedAmount >= product.minAmount && requestedAmount <= product.maxAmount;
  const capacityPassed = requestedAmount <= maxEligibleAmount && amountWithinProductLimits;

  criteria.push({
    criterion: "Requested Loan Amount & Repayment Capacity",
    applicantValue: formatCurrencyINR(requestedAmount),
    requiredValue: `Up to ${formatCurrencyINR(maxEligibleAmount)} (Product limit: ${formatCurrencyINR(product.maxAmount)})`,
    status: capacityPassed ? "PASS" : "FAIL",
    explanation: capacityPassed
      ? `Requested loan amount of ${formatCurrencyINR(requestedAmount)} is fully serviceable within the calculated debt capacity of ${formatCurrencyINR(maxEligibleAmount)}.`
      : requestedAmount > product.maxAmount
      ? `Requested loan amount of ${formatCurrencyINR(requestedAmount)} exceeds the maximum product cap of ${formatCurrencyINR(product.maxAmount)}.`
      : `Requested loan amount of ${formatCurrencyINR(requestedAmount)} exceeds the calculated maximum borrowing capacity of ${formatCurrencyINR(maxEligibleAmount)} based on income and FOIR constraints.`,
    isMandatory: false, // Capacity mismatch can lead to CONDITIONAL approval with lower sanctioned amount
  });

  // 4. Determine Overall Result Status
  // Rule:
  // - If any mandatory basic criteria (Age, Income, Existing FOIR, Tenure, Employment) fail => NOT_ELIGIBLE
  // - If all basic criteria pass, but requested amount exceeds max capacity => CONDITIONAL (eligible for maxEligibleAmount)
  // - If all criteria pass => ELIGIBLE
  const mandatoryBasicCriteriaPassed =
    agePassed && incomePassed && foirPassed && tenurePassed && employmentPassed;

  let overallStatus: EligibilityStatus;
  const nextSteps: string[] = [];

  if (!mandatoryBasicCriteriaPassed) {
    overallStatus = "NOT_ELIGIBLE";
    nextSteps.push(
      "Review the failed mandatory criteria above.",
      "Consider applying with a creditworthy co-applicant or clearing existing EMIs to lower your FOIR.",
      "Re-apply once the minimum income or employment requirement is satisfied."
    );
  } else if (!capacityPassed) {
    overallStatus = "CONDITIONAL";
    if (maxEligibleAmount > 0) {
      reasons.push(
        `Basic eligibility criteria are satisfied, but requested amount (${formatCurrencyINR(requestedAmount)}) exceeds maximum repayment capacity (${formatCurrencyINR(maxEligibleAmount)}).`
      );
      nextSteps.push(
        `You may proceed with an adjusted conditional loan amount of up to ${formatCurrencyINR(maxEligibleAmount)}.`,
        "Submit required income proofs (Form 16 / Bank Statements) to verify additional allowances or bonus components.",
        "Consider extending the tenure to reduce the monthly EMI burden, or adding a co-applicant to increase capacity."
      );
    } else {
      overallStatus = "NOT_ELIGIBLE";
      reasons.push(
        "Existing debt obligations leave no available monthly capacity for additional loan servicing under the 50% FOIR limit."
      );
      nextSteps.push(
        "Prepay or close existing loans to create monthly EMI headroom.",
        "Apply with a co-borrower to augment eligible household income."
      );
    }
  } else {
    overallStatus = "ELIGIBLE";
    reasons.push(
      "All mandatory eligibility criteria and repayment capacity checks have been successfully satisfied."
    );
    nextSteps.push(
      "Complete applicable KYC verification with the lender.",
      "Upload 3 months salary slips and 6 months bank statement.",
      "Proceed to lender verification and formal underwriting."
    );
  }

  // 5. Filter Applicable Document Requirements
  const applicableDocuments: DocumentItem[] = documents
    .filter((doc) => {
      if (!doc.employmentType || doc.employmentType === "ALL") return true;
      if (normalizedEmp === "Salaried" && doc.employmentType === "SALARIED") return true;
      if (normalizedEmp === "Self-employed" && doc.employmentType.includes("SELF")) return true;
      return false;
    })
    .map((doc) => ({
      documentType: doc.documentType,
      name: doc.name,
      description: doc.description,
      isMandatory: doc.isMandatory,
    }));

  return {
    status: overallStatus,
    applicant: {
      firstName: applicant.firstName,
      lastName: applicant.lastName,
      email: applicant.email,
      age: applicant.age,
      employmentType: applicant.employmentType,
      monthlyNetIncome: applicant.monthlyNetIncome,
      existingMonthlyEmi: applicant.existingMonthlyEmi,
      creditScore: applicant.creditScore,
    },
    loanProduct: {
      id: product.id,
      productCode: product.productCode,
      name: product.name,
      minAmount: product.minAmount,
      maxAmount: product.maxAmount,
      minTenureMonths: product.minTenureMonths,
      maxTenureMonths: product.maxTenureMonths,
      indicativeInterestRate: INDICATIVE_RATE,
      processingFeePercentage: product.processingFeePercentage,
    },
    financialMetrics,
    criteria,
    reasons,
    nextSteps,
    documents: applicableDocuments,
    disclaimer:
      "This is a PRELIMINARY, INDICATIVE eligibility assessment based on demonstration policy rules and self-declared applicant information. It does NOT constitute a final loan sanction, approval, or binding credit commitment. Real disbursement requires physical KYC, underwriting review, and formal sanction letter issuance.",
    evaluatedAt: new Date().toISOString(),
  };
}
