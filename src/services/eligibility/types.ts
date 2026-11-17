import { ApplicantProfile, PreliminaryAssessmentResult } from "@/types/domain";
import { LoanProductData, EligibilityRuleData } from "../data/types";

/**
 * Input for the deterministic calculation and rule check
 */
export interface EvaluationInput {
  applicant: ApplicantProfile;
  requestedAmount: number;
  requestedTenureMonths: number;
  product: LoanProductData;
  rules: EligibilityRuleData[];
}

/**
 * Deterministic Eligibility Engine Interface
 * 
 * Rules:
 * - All calculations (EMI, FOIR, Eligible limits) are strictly deterministic formulas.
 * - All rule validations (Age, Income, Credit Score, DTI/FOIR) are strictly Boolean criteria.
 * - This engine NEVER calls AI models. It outputs a pure mathematical & rule-based decision.
 */
export interface IEligibilityEngine {
  evaluate(input: EvaluationInput): PreliminaryAssessmentResult;
  calculateEmi(principal: number, annualRatePercent: number, tenureMonths: number): number;
  calculateFoir(existingEmi: number, proposedEmi: number, monthlyNetIncome: number): number;
  calculateMaxEligibleAmount(
    monthlyNetIncome: number,
    existingEmi: number,
    maxFoir: number,
    annualRatePercent: number,
    tenureMonths: number
  ): number;
}
