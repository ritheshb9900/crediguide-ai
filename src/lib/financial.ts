import { Prisma } from "@/generated/prisma/client";

/**
 * Custom error thrown when a financial value cannot be safely or reliably converted.
 */
export class InvalidFinancialValueError extends Error {
  constructor(message: string, public readonly value?: unknown) {
    super(message);
    this.name = "InvalidFinancialValueError";
  }
}

/**
 * Type guard to check if an unknown value is a Prisma Decimal instance
 * or has an equivalent Decimal.js runtime interface.
 */
export function isPrismaDecimal(value: unknown): value is Prisma.Decimal {
  if (value === null || value === undefined) {
    return false;
  }
  return Prisma.Decimal.isDecimal(value);
}

/**
 * Type-safe boundary conversion helper from Prisma Decimal / numeric representation
 * to JavaScript primitive number.
 *
 * =============================================================================
 * CRITICAL ARCHITECTURAL CONTEXT & FINANCIAL ARITHMETIC NOTICE:
 * =============================================================================
 * In CrediGuide AI, all monetary amounts and percentage rates are permanently
 * stored and validated in PostgreSQL using arbitrary-precision decimals:
 *   - @db.Decimal(14,2) for currency amounts (e.g. Loan limits, EMI, Income)
 *   - @db.Decimal(5,2) for percentages and rates (e.g. Interest rates, FOIR, Fees)
 *
 * Converting a Decimal to a native JavaScript `number` (IEEE 754 double precision)
 * at the data adapter boundary is strictly an interface adaptation mechanism for
 * legacy application and presentation contracts.
 *
 * This conversion does NOT provide exact financial arithmetic. True financial
 * calculations (amortization schedules, compounding interest, underwriting policy
 * thresholds, and statutory audits) MUST always rely on Prisma Decimal or exact
 * arbitrary-precision arithmetic.
 *
 * Conversion Rules:
 * 1. Preserves `null` as `null`.
 * 2. Preserves `undefined` as `undefined`.
 * 3. Extracts values from Prisma Decimal using controlled `.toString()` parsing.
 * 4. Rejects `NaN`, `Infinity`, `-Infinity`, unparseable strings, and empty strings.
 * 5. NEVER silently coerces invalid or missing numbers to 0.
 *
 * @throws {InvalidFinancialValueError} When input is invalid, non-numeric, or infinite.
 */
export function toFinancialNumber(value: Prisma.Decimal | number | string): number;
export function toFinancialNumber(value: Prisma.Decimal | number | string | null): number | null;
export function toFinancialNumber(value: Prisma.Decimal | number | string | undefined): number | undefined;
export function toFinancialNumber(value: Prisma.Decimal | number | string | null | undefined): number | null | undefined;
export function toFinancialNumber(value: unknown): number | null | undefined;
export function toFinancialNumber(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  if (value === undefined) {
    return undefined;
  }

  let numStr: string;

  if (isPrismaDecimal(value)) {
    // Controlled conversion via Decimal.js canonical string representation
    numStr = value.toString();
  } else if (typeof value === "number") {
    if (Number.isNaN(value) || !Number.isFinite(value)) {
      throw new InvalidFinancialValueError(`Invalid financial number: ${value}`, value);
    }
    return value;
  } else if (typeof value === "string") {
    numStr = value.trim();
    if (numStr === "") {
      throw new InvalidFinancialValueError("Cannot convert empty string to financial number", value);
    }
  } else {
    throw new InvalidFinancialValueError(
      `Unsupported type for financial conversion: ${typeof value}`,
      value
    );
  }

  const parsed = Number(numStr);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    throw new InvalidFinancialValueError(
      `Failed to convert financial value "${numStr}" to a valid finite number`,
      value
    );
  }

  return parsed;
}

/**
 * Strict conversion helper for non-nullable, mandatory financial fields.
 *
 * Throws InvalidFinancialValueError if the input is null, undefined, or invalid.
 *
 * @throws {InvalidFinancialValueError} If value is null, undefined, or non-numeric.
 */
export function toRequiredFinancialNumber(value: unknown, fieldName = "financial field"): number {
  if (value === null || value === undefined) {
    throw new InvalidFinancialValueError(
      `Mandatory ${fieldName} cannot be null or undefined`,
      value
    );
  }
  const result = toFinancialNumber(value);
  if (result === null || result === undefined) {
    throw new InvalidFinancialValueError(
      `Mandatory ${fieldName} resolved to ${String(result)}`,
      value
    );
  }
  return result;
}
