/**
 * Financial Calculation Utility
 * 
 * Provides pure, deterministic financial formulas for personal loan evaluation:
 * - Reducing-balance Equated Monthly Installment (EMI)
 * - Fixed Obligation to Income Ratio (FOIR / DTI)
 * - Available monthly debt servicing headroom
 * - Maximum eligible loan capacity based on income and FOIR constraints
 */

/**
 * Calculates monthly EMI using the standard reducing balance amortization formula:
 * 
 *   EMI = [P * r * (1 + r)^N] / [(1 + r)^N - 1]
 * 
 * Where:
 *   P = Principal loan amount
 *   r = Monthly interest rate (Annual Rate % / 12 / 100)
 *   N = Tenure in months
 */
export function calculateReducingBalanceEmi(
  principal: number,
  annualRatePercent: number,
  tenureMonths: number
): number {
  if (principal <= 0 || tenureMonths <= 0) return 0;
  if (annualRatePercent <= 0) {
    return Math.round((principal / tenureMonths) * 100) / 100;
  }

  const monthlyRate = annualRatePercent / 12 / 100;
  const factor = Math.pow(1 + monthlyRate, tenureMonths);
  const emi = (principal * monthlyRate * factor) / (factor - 1);

  return Math.round(emi * 100) / 100;
}

/**
 * Calculates existing FOIR (Fixed Obligation to Income Ratio) percentage:
 * 
 *   FOIR = (Existing Monthly EMI / Monthly Income) * 100
 * 
 * Example:
 *   Income = ₹60,000, Existing EMI = ₹10,000 -> FOIR = 16.67%
 */
export function calculateExistingFoir(
  existingMonthlyEmi: number,
  monthlyNetIncome: number
): number {
  if (monthlyNetIncome <= 0) return 100;
  if (existingMonthlyEmi <= 0) return 0;

  const foir = (existingMonthlyEmi / monthlyNetIncome) * 100;
  return Math.round(foir * 100) / 100;
}

/**
 * Calculates total proposed FOIR percentage:
 * 
 *   Total FOIR = [(Existing Monthly EMI + Proposed EMI) / Monthly Income] * 100
 */
export function calculateTotalFoir(
  existingMonthlyEmi: number,
  proposedMonthlyEmi: number,
  monthlyNetIncome: number
): number {
  if (monthlyNetIncome <= 0) return 100;
  const totalEmi = Math.max(0, existingMonthlyEmi) + Math.max(0, proposedMonthlyEmi);
  const totalFoir = (totalEmi / monthlyNetIncome) * 100;
  return Math.round(totalFoir * 100) / 100;
}

/**
 * Calculates available monthly EMI headroom under a given FOIR ceiling:
 * 
 *   Available Headroom = Max(0, (Monthly Income * (Max FOIR % / 100)) - Existing EMI)
 */
export function calculateAvailableMonthlyHeadroom(
  monthlyNetIncome: number,
  existingMonthlyEmi: number,
  maxFoirPercent: number = 50
): number {
  if (monthlyNetIncome <= 0) return 0;
  const maxAllowableTotalEmi = monthlyNetIncome * (maxFoirPercent / 100);
  const headroom = maxAllowableTotalEmi - Math.max(0, existingMonthlyEmi);
  return Math.max(0, Math.round(headroom * 100) / 100);
}

/**
 * Calculates maximum borrowable loan amount based on income, FOIR threshold,
 * interest rate, and tenure:
 * 
 *   PV = Headroom * [(1 + r)^N - 1] / [r * (1 + r)^N]
 * 
 * Capped by product upper limit if provided, and rounded down to nearest thousand.
 */
export function calculateMaxEligibleLoanAmount(
  monthlyNetIncome: number,
  existingMonthlyEmi: number,
  maxFoirPercent: number,
  annualRatePercent: number,
  tenureMonths: number,
  productMaxAmount?: number
): number {
  const headroom = calculateAvailableMonthlyHeadroom(
    monthlyNetIncome,
    existingMonthlyEmi,
    maxFoirPercent
  );

  if (headroom <= 0 || tenureMonths <= 0) return 0;

  let maxPrincipal: number;

  if (annualRatePercent <= 0) {
    maxPrincipal = headroom * tenureMonths;
  } else {
    const monthlyRate = annualRatePercent / 12 / 100;
    const factor = Math.pow(1 + monthlyRate, tenureMonths);
    maxPrincipal = (headroom * (factor - 1)) / (monthlyRate * factor);
  }

  if (productMaxAmount !== undefined && productMaxAmount > 0) {
    maxPrincipal = Math.min(maxPrincipal, productMaxAmount);
  }

  // Round down to nearest ₹5,000 for realistic institutional loan sizing
  const rounded = Math.floor(maxPrincipal / 5000) * 5000;
  return Math.max(0, rounded);
}

/**
 * Calculates existing EMI burden ratio:
 * 
 *   Burden Ratio = Existing EMI / Monthly Net Income
 */
export function calculateEmiBurdenRatio(
  existingMonthlyEmi: number,
  monthlyNetIncome: number
): number {
  if (monthlyNetIncome <= 0) return 1.0;
  const ratio = Math.max(0, existingMonthlyEmi) / monthlyNetIncome;
  return Math.round(ratio * 10000) / 10000;
}
