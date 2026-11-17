import { z } from "zod";

/**
 * Standard Eligibility Statuses mandated by the Deterministic Engine
 */
export const EligibilityStatusEnum = z.enum([
  "ELIGIBLE",
  "CONDITIONAL",
  "NOT_ELIGIBLE",
]);
export type EligibilityStatus = z.infer<typeof EligibilityStatusEnum>;

/**
 * Backward-compatible assessment status enum
 */
export const AssessmentStatusEnum = z.enum([
  "ELIGIBLE",
  "CONDITIONAL",
  "NOT_ELIGIBLE",
  "PRELIMINARY_ELIGIBLE",
  "CONDITIONALLY_ELIGIBLE",
  "INELIGIBLE",
  "INCOMPLETE_DATA",
]);
export type AssessmentStatus = z.infer<typeof AssessmentStatusEnum>;

/**
 * Employment Types accepted by the demonstration policy
 * Normalized to SALARIED or SELF_EMPLOYED
 */
export const EmploymentTypeEnum = z.enum([
  "SALARIED",
  "SELF_EMPLOYED",
  "SELF_EMPLOYED_PROFESSIONAL",
  "SELF_EMPLOYED_BUSINESS",
  "Salaried",
  "Self-employed",
  "self-employed",
  "salaried",
]);
export type EmploymentType = z.infer<typeof EmploymentTypeEnum>;

/**
 * Residence Types
 */
export const ResidenceTypeEnum = z.enum([
  "OWNED",
  "RENTED",
  "PARENTAL",
  "COMPANY_PROVIDED",
]);
export type ResidenceType = z.infer<typeof ResidenceTypeEnum>;

/**
 * Risk Tiers computed by deterministic financial rules
 */
export const RiskTierEnum = z.enum(["LOW", "MODERATE", "HIGH"]);
export type RiskTier = z.infer<typeof RiskTierEnum>;

/**
 * Zod Schema for Structured Applicant Input
 */
export const ApplicantProfileSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Invalid 10-digit Indian mobile number").optional(),
  age: z.number().int({ message: "Age must be an integer" }).min(18, "Applicant must be at least 18 years old").max(75, "Age exceeds upper threshold"),
  dateOfBirth: z.string().optional(),
  employmentType: EmploymentTypeEnum,
  employerName: z.string().optional(),
  monthlyNetIncome: z.number().positive("Monthly net income must be greater than 0"),
  existingMonthlyEmi: z.number().min(0, "Existing monthly EMI cannot be negative").default(0),
  creditScore: z.number().int().min(300).max(900).optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().regex(/^\d{6}$/, "Invalid 6-digit PIN code").optional(),
  residenceType: ResidenceTypeEnum.optional(),
  workExperienceYears: z.number().min(0).optional(),
});
export type ApplicantProfile = z.infer<typeof ApplicantProfileSchema>;

/**
 * Zod Schema for Eligibility Assessment Request API
 */
export const EligibilityAssessmentRequestSchema = z.object({
  applicant: ApplicantProfileSchema,
  requestedAmount: z.number().positive("Requested loan amount must be greater than 0"),
  requestedTenureMonths: z.number().int().min(1, "Tenure must be at least 1 month"),
  productId: z.string().optional(),
  productCode: z.string().optional(),
});
export type EligibilityAssessmentRequest = z.infer<typeof EligibilityAssessmentRequestSchema>;

/**
 * Explained Criterion format matching strict explainability guidelines
 */
export interface ExplainedCriterion {
  criterion: string;
  applicantValue: string;
  requiredValue: string;
  status: "PASS" | "FAIL";
  explanation: string;
  isMandatory?: boolean;
}

/**
 * Backward compatibility alias
 */
export interface EvaluatedCriterion extends ExplainedCriterion {
  ruleCode?: string;
  criterionName?: string;
  category?: string;
  passed?: boolean;
  actualValue?: string;
  expectedValue?: string;
}

/**
 * Financial metrics calculated deterministically
 */
export interface FinancialMetrics {
  monthlyIncome: number;
  existingEmi: number;
  requestedAmount: number;
  requestedTenureMonths: number;
  indicativeInterestRate: number;
  proposedMonthlyEmi: number;
  existingFoirPercentage: number;
  totalFoirPercentage: number;
  maxEligibleAmount: number;
  emiBurdenRatio: number;
  availableMonthlyCapacity: number;
}

/**
 * Required Document Item
 */
export interface DocumentItem {
  documentType: string;
  name: string;
  description: string;
  isMandatory: boolean;
}

/**
 * Structured Overall Assessment Output
 */
export interface DeterministicAssessmentResponse {
  status: EligibilityStatus;
  applicant: {
    firstName: string;
    lastName: string;
    email: string;
    age: number;
    employmentType: string;
    monthlyNetIncome: number;
    existingMonthlyEmi: number;
    creditScore?: number;
  };
  loanProduct: {
    id: string;
    productCode: string;
    name: string;
    minAmount: number;
    maxAmount: number;
    minTenureMonths: number;
    maxTenureMonths: number;
    indicativeInterestRate: number;
    processingFeePercentage: number;
  };
  financialMetrics: FinancialMetrics;
  criteria: ExplainedCriterion[];
  reasons: string[];
  nextSteps: string[];
  documents: DocumentItem[];
  disclaimer: string;
  evaluatedAt: string;
}

/**
 * Backward compatibility type alias
 */
export type PreliminaryAssessmentResult = DeterministicAssessmentResponse;
