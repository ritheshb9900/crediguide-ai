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
 * Evaluates all configured product-specific rules dynamically while preserving the 6-criterion
 * displayed response structure for backward compatibility.
 */
export function evaluateLoanEligibility(
  input: DeterministicEvaluationInput
): DeterministicAssessmentResponse {
  const { applicant, requestedAmount, requestedTenureMonths, product, rules, documents } = input;

  // 1. Establish Demonstration Thresholds dynamically from product-specific rules
  // Rule 1: AGE_RANGE
  const ageRule = rules?.find((r) => r.ruleCode === "AGE_RANGE" && r.isActive);
  let minAge = 21;
  let maxAge = 60;
  if (ageRule?.thresholdValue) {
    const parts = ageRule.thresholdValue.split(",").map((s) => parseInt(s.trim(), 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      minAge = parts[0];
      maxAge = parts[1];
    }
  }

  // Rule 2: MIN_INCOME
  const incomeRule = rules?.find((r) => r.ruleCode === "MIN_INCOME" && r.isActive);
  let minIncome = 30000;
  if (incomeRule?.thresholdValue) {
    const val = parseFloat(incomeRule.thresholdValue);
    if (!isNaN(val)) minIncome = val;
  }

  // Rule 3: MAX_FOIR
  const foirRule = rules?.find((r) => r.ruleCode === "MAX_FOIR" && r.isActive);
  let maxFoirThreshold = 50.0;
  if (foirRule?.thresholdValue) {
    const val = parseFloat(foirRule.thresholdValue);
    if (!isNaN(val)) maxFoirThreshold = val;
  }

  // Rule 4: TENURE_RANGE
  const tenureRule = rules?.find((r) => r.ruleCode === "TENURE_RANGE" && r.isActive);
  let minTenureMonths = product.minTenureMonths || 12;
  let maxTenureMonths = product.maxTenureMonths || 84;
  if (tenureRule?.thresholdValue) {
    const parts = tenureRule.thresholdValue.split(",").map((s) => parseInt(s.trim(), 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      minTenureMonths = parts[0];
      maxTenureMonths = parts[1];
    }
  }

  // Rule 5: EMPLOYMENT_TYPE
  const empRule = rules?.find((r) => r.ruleCode === "EMPLOYMENT_TYPE" && r.isActive);
  const allowedEmpTypes = empRule?.thresholdValue
    ? empRule.thresholdValue.split(",").map((s) => s.trim().toUpperCase().replace(/[-_\s]+/g, ""))
    : ["SALARIED", "SELFEMPLOYED"];

  // Rule 6: MIN_CREDIT_SCORE
  const creditScoreRule = rules?.find((r) => r.ruleCode === "MIN_CREDIT_SCORE" && r.isActive);
  let minCreditScore: number | null = null;
  if (creditScoreRule?.thresholdValue) {
    const val = parseInt(creditScoreRule.thresholdValue, 10);
    if (!isNaN(val)) minCreditScore = val;
  }

  const indicativeRate = product.minInterestRate || 10.5;

  // 2. Perform Financial Calculations
  const existingFoir = calculateExistingFoir(
    applicant.existingMonthlyEmi,
    applicant.monthlyNetIncome
  );

  const proposedEmi = calculateReducingBalanceEmi(
    requestedAmount,
    indicativeRate,
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
    maxFoirThreshold
  );

  const maxEligibleAmount = calculateMaxEligibleLoanAmount(
    applicant.monthlyNetIncome,
    applicant.existingMonthlyEmi,
    maxFoirThreshold,
    indicativeRate,
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
    indicativeInterestRate: indicativeRate,
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

  // CRITERION 1: Age Rule
  const agePassed = applicant.age >= minAge && applicant.age <= maxAge;
  criteria.push({
    criterion: "Applicant Age Range",
    applicantValue: `${applicant.age} years`,
    requiredValue: `${minAge} to ${maxAge} years`,
    status: agePassed ? "PASS" : "FAIL",
    explanation: agePassed
      ? `Applicant's age of ${applicant.age} is within the required range of ${minAge} to ${maxAge} years.`
      : `Applicant's age of ${applicant.age} fails the age criteria. Minimum age is ${minAge} and maximum age is ${maxAge} years.`,
    isMandatory: true,
  });
  if (!agePassed) {
    reasons.push(
      applicant.age < minAge
        ? `Applicant is ${applicant.age} years old, which is below the minimum age of ${minAge}.`
        : `Applicant is ${applicant.age} years old, which exceeds the maximum maturity age of ${maxAge}.`
    );
  }

  // CRITERION 2: Minimum Income Rule
  const incomePassed = applicant.monthlyNetIncome >= minIncome;
  criteria.push({
    criterion: "Minimum Monthly Income",
    applicantValue: formatCurrencyINR(applicant.monthlyNetIncome),
    requiredValue: `${formatCurrencyINR(minIncome)} or more`,
    status: incomePassed ? "PASS" : "FAIL",
    explanation: incomePassed
      ? `The applicant's monthly income (${formatCurrencyINR(applicant.monthlyNetIncome)}) is above the configured minimum threshold of ${formatCurrencyINR(minIncome)}.`
      : `The applicant's monthly income (${formatCurrencyINR(applicant.monthlyNetIncome)}) is below the required threshold of ${formatCurrencyINR(minIncome)}.`,
    isMandatory: true,
  });
  if (!incomePassed) {
    reasons.push(
      `Monthly income of ${formatCurrencyINR(applicant.monthlyNetIncome)} is lower than the mandatory minimum of ${formatCurrencyINR(minIncome)}.`
    );
  }

  // CRITERION 3: EMI / FOIR Rule
  const foirPassed = existingFoir <= maxFoirThreshold;
  criteria.push({
    criterion: "Existing FOIR (Configurable Demonstration Rule)",
    applicantValue: `${existingFoir.toFixed(2)}% (${formatCurrencyINR(applicant.existingMonthlyEmi)} / month)`,
    requiredValue: `${maxFoirThreshold.toFixed(2)}% or lower (Configurable Demonstration Rule)`,
    status: foirPassed ? "PASS" : "FAIL",
    explanation: foirPassed
      ? `Existing monthly debt burden (FOIR) of ${existingFoir.toFixed(2)}% is within the allowable demonstration threshold of ${maxFoirThreshold.toFixed(2)}%.`
      : `Existing monthly debt burden (FOIR) of ${existingFoir.toFixed(2)}% exceeds the allowable demonstration threshold of ${maxFoirThreshold.toFixed(2)}%. Existing obligations consume too high a portion of monthly income.`,
    isMandatory: true,
  });
  if (!foirPassed) {
    reasons.push(
      `Existing debt-to-income ratio (FOIR) of ${existingFoir.toFixed(2)}% exceeds the allowable demonstration threshold of ${maxFoirThreshold.toFixed(2)}%.`
    );
  }

  // CRITERION 4: Loan Tenure Range
  const tenurePassed =
    requestedTenureMonths >= minTenureMonths && requestedTenureMonths <= maxTenureMonths;
  criteria.push({
    criterion: "Loan Tenure Range",
    applicantValue: `${requestedTenureMonths} months (${(requestedTenureMonths / 12).toFixed(1)} years)`,
    requiredValue: `${minTenureMonths} to ${maxTenureMonths} months (${minTenureMonths / 12} to ${maxTenureMonths / 12} years)`,
    status: tenurePassed ? "PASS" : "FAIL",
    explanation: tenurePassed
      ? `Requested tenure of ${requestedTenureMonths} months is within the allowed range of 1 to 7 years (${minTenureMonths}–${maxTenureMonths} months).`
      : `Requested tenure of ${requestedTenureMonths} months is outside the allowed range of 1 to 7 years (${minTenureMonths}–${maxTenureMonths} months).`,
    isMandatory: true,
  });
  if (!tenurePassed) {
    reasons.push(
      `Requested tenure of ${requestedTenureMonths} months is outside the product limits (${minTenureMonths} to ${maxTenureMonths} months).`
    );
  }

  // CRITERION 5: Employment Type
  const normalizedEmp = normalizeEmploymentType(applicant.employmentType);
  const normalizedCheckKey = normalizedEmp === "Salaried" ? "SALARIED" : normalizedEmp === "Self-employed" ? "SELFEMPLOYED" : "UNSUPPORTED";
  const isTypeAllowed = allowedEmpTypes.some((t) => t.includes(normalizedCheckKey) || normalizedCheckKey.includes(t));
  const employmentPassed = normalizedEmp !== "Unsupported" && isTypeAllowed;

  const requiresSalariedOnly = allowedEmpTypes.every((t) => !t.includes("SELF"));
  const expectedEmpDescription = requiresSalariedOnly ? "Salaried only" : "Salaried or Self-employed";

  criteria.push({
    criterion: "Eligible Employment Type",
    applicantValue: applicant.employmentType,
    requiredValue: expectedEmpDescription,
    status: employmentPassed ? "PASS" : "FAIL",
    explanation: employmentPassed
      ? `Applicant employment type '${applicant.employmentType}' (normalized: ${normalizedEmp}) is supported by this loan product.`
      : `Applicant employment type '${applicant.employmentType}' is not supported. ${product.name} requires ${expectedEmpDescription} applicants.`,
    isMandatory: true,
  });
  if (!employmentPassed) {
    reasons.push(
      `Employment type '${applicant.employmentType}' is not supported. Must be ${expectedEmpDescription}.`
    );
  }

  // CRITERION 6: Requested Loan Amount, Repayment Capacity & Credit Score
  const amountWithinProductLimits =
    requestedAmount >= product.minAmount && requestedAmount <= product.maxAmount;
  const capacityPassed = requestedAmount <= maxEligibleAmount && amountWithinProductLimits;

  // Credit score evaluation
  let creditScorePassed = true;
  if (minCreditScore !== null) {
    if (applicant.creditScore !== undefined && applicant.creditScore !== null) {
      creditScorePassed = applicant.creditScore >= minCreditScore;
      if (!creditScorePassed) {
        reasons.push(
          `Credit score of ${applicant.creditScore} is below the mandatory minimum threshold of ${minCreditScore} required for ${product.name}.`
        );
      }
    }
  }

  const criterion6Passed = capacityPassed && creditScorePassed;

  let crit6ApplicantValue = formatCurrencyINR(requestedAmount);
  let crit6RequiredValue = `Up to ${formatCurrencyINR(maxEligibleAmount)} (Product limit: ${formatCurrencyINR(product.maxAmount)})`;
  let crit6Explanation = "";

  if (!creditScorePassed && applicant.creditScore != null && minCreditScore != null) {
    crit6ApplicantValue = `${formatCurrencyINR(requestedAmount)} (Credit Score: ${applicant.creditScore})`;
    crit6RequiredValue = `Up to ${formatCurrencyINR(maxEligibleAmount)} (Min Score: ${minCreditScore})`;
    crit6Explanation = `Credit score of ${applicant.creditScore} does not meet the product minimum threshold of ${minCreditScore} for ${product.name}.`;
  } else if (capacityPassed) {
    crit6Explanation = `Requested loan amount of ${formatCurrencyINR(requestedAmount)} is fully serviceable within the calculated debt capacity of ${formatCurrencyINR(maxEligibleAmount)}.`;
  } else if (requestedAmount > product.maxAmount) {
    crit6Explanation = `Requested loan amount of ${formatCurrencyINR(requestedAmount)} exceeds the maximum product cap of ${formatCurrencyINR(product.maxAmount)}.`;
  } else {
    crit6Explanation = `Requested loan amount of ${formatCurrencyINR(requestedAmount)} exceeds the calculated maximum borrowing capacity of ${formatCurrencyINR(maxEligibleAmount)} based on income and FOIR constraints.`;
  }

  criteria.push({
    criterion: "Requested Loan Amount & Repayment Capacity",
    applicantValue: crit6ApplicantValue,
    requiredValue: crit6RequiredValue,
    status: criterion6Passed ? "PASS" : "FAIL",
    explanation: crit6Explanation,
    isMandatory: false,
  });

  // Missing Information Detection
  const missingInformation: string[] = [];
  let requiresMoreInformation = false;

  if (applicant.creditScore == null && minCreditScore != null) {
    requiresMoreInformation = true;
    missingInformation.push(`Credit bureau score verification (minimum required score: ${minCreditScore})`);
  }
  if (!applicant.employerName && normalizedEmp === "Salaried") {
    missingInformation.push("Employer organization verification");
  }

  // 4. Determine Overall Result Status
  const mandatoryBasicCriteriaPassed =
    agePassed && incomePassed && foirPassed && tenurePassed && employmentPassed && creditScorePassed;

  let overallStatus: EligibilityStatus;
  const nextSteps: string[] = [];

  if (!mandatoryBasicCriteriaPassed) {
    overallStatus = "NOT_ELIGIBLE";
    nextSteps.push(
      "Review the failed mandatory criteria above.",
      "Consider applying with a creditworthy co-applicant or clearing existing EMIs to lower your FOIR.",
      "Re-apply once the minimum income, credit score or employment requirement is satisfied."
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
        `Existing debt obligations leave no available monthly capacity for additional loan servicing under the ${maxFoirThreshold}% FOIR limit.`
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
      "Upload required proof documents based on your profile.",
      "Proceed to lender verification and formal underwriting."
    );
  }

  // 5. Filter Applicable Document Requirements
  const applicableDocuments: DocumentItem[] = documents
    .filter((doc) => {
      if (!doc.employmentType || doc.employmentType === "ALL") return true;
      if (normalizedEmp === "Salaried" && doc.employmentType === "SALARIED") return true;
      if (normalizedEmp === "Self-employed" && (doc.employmentType === "SELF_EMPLOYED" || doc.employmentType.includes("SELF"))) return true;
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
      minTenureMonths: minTenureMonths,
      maxTenureMonths: maxTenureMonths,
      indicativeInterestRate: indicativeRate,
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
    requiresMoreInformation,
    missingInformation: missingInformation.length > 0 ? missingInformation : undefined,
  };
}
