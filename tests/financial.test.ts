import { Prisma } from "@/generated/prisma/client";
import {
  toFinancialNumber,
  toRequiredFinancialNumber,
  isPrismaDecimal,
  InvalidFinancialValueError,
} from "@/lib/financial";

console.log("================================================================================");
console.log("💰 CrediGuide AI - Financial Precision & Boundary Conversion Test Suite");
console.log("================================================================================");

let totalPassed = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAILED: ${testName}`);
    if (detail) console.error(`   Detail: ${detail}`);
    process.exit(1);
  } else {
    totalPassed++;
    console.log(`✅ PASSED: ${testName}`);
  }
}

// -----------------------------------------------------------------------------
// Test 1: Preservation of null and undefined
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 1: Preservation of null and undefined");
assert(toFinancialNumber(null) === null, "Preserves null as null");
assert(toFinancialNumber(undefined) === undefined, "Preserves undefined as undefined");

// -----------------------------------------------------------------------------
// Test 2: Prisma.Decimal controlled conversion
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 2: Prisma.Decimal Controlled Conversion");
const d1 = new Prisma.Decimal("1500000.50");
const d2 = new Prisma.Decimal("0.00");
const d3 = new Prisma.Decimal("12.75");

assert(isPrismaDecimal(d1), "isPrismaDecimal returns true for Decimal instance");
assert(toFinancialNumber(d1) === 1500000.5, "Converts 1500000.50 Decimal to 1500000.5 number");
assert(toFinancialNumber(d2) === 0, "Converts 0.00 Decimal to 0 number");
assert(toFinancialNumber(d3) === 12.75, "Converts 12.75 Decimal to 12.75 number");

// -----------------------------------------------------------------------------
// Test 3: Primitive number and valid string handling
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 3: Primitive Number and String Handling");
assert(toFinancialNumber(50000) === 50000, "Preserves valid integer number");
assert(toFinancialNumber(10.5) === 10.5, "Preserves valid float number");
assert(toFinancialNumber(0) === 0, "Preserves zero number");
assert(toFinancialNumber("2500000.00") === 2500000, "Converts valid string to number");
assert(toFinancialNumber("  8.25  ") === 8.25, "Trims and converts valid string to number");

// -----------------------------------------------------------------------------
// Test 4: Rejection of NaN, Infinity, -Infinity
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 4: Strict Rejection of Non-Finite and Invalid Numbers");

let threwOnNaN = false;
try {
  toFinancialNumber(NaN);
} catch (e) {
  threwOnNaN = e instanceof InvalidFinancialValueError;
}
assert(threwOnNaN, "Rejects NaN with InvalidFinancialValueError");

let threwOnInf = false;
try {
  toFinancialNumber(Infinity);
} catch (e) {
  threwOnInf = e instanceof InvalidFinancialValueError;
}
assert(threwOnInf, "Rejects Infinity with InvalidFinancialValueError");

let threwOnNegInf = false;
try {
  toFinancialNumber(-Infinity);
} catch (e) {
  threwOnNegInf = e instanceof InvalidFinancialValueError;
}
assert(threwOnNegInf, "Rejects -Infinity with InvalidFinancialValueError");

// -----------------------------------------------------------------------------
// Test 5: Rejection of Unparseable Strings and Empty Values (Never Silently 0)
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 5: Rejection of Unparseable Strings and Empty Values");

let threwOnEmpty = false;
try {
  toFinancialNumber("");
} catch (e) {
  threwOnEmpty = e instanceof InvalidFinancialValueError;
}
assert(threwOnEmpty, "Rejects empty string without defaulting to zero");

let threwOnWhitespace = false;
try {
  toFinancialNumber("   ");
} catch (e) {
  threwOnWhitespace = e instanceof InvalidFinancialValueError;
}
assert(threwOnWhitespace, "Rejects whitespace-only string without defaulting to zero");

let threwOnAlpha = false;
try {
  toFinancialNumber("not-a-number");
} catch (e) {
  threwOnAlpha = e instanceof InvalidFinancialValueError;
}
assert(threwOnAlpha, "Rejects alphanumeric string without defaulting to zero");

let threwOnInvalidObj = false;
try {
  toFinancialNumber({ amount: 100 });
} catch (e) {
  threwOnInvalidObj = e instanceof InvalidFinancialValueError;
}
assert(threwOnInvalidObj, "Rejects non-Decimal object without defaulting to zero");

// -----------------------------------------------------------------------------
// Test 6: toRequiredFinancialNumber Mandatory Validation
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 6: Mandatory Field Validation (toRequiredFinancialNumber)");

assert(
  toRequiredFinancialNumber(new Prisma.Decimal("500000.00"), "approvalLimitAmount") === 500000,
  "toRequiredFinancialNumber accepts valid Decimal"
);
assert(
  toRequiredFinancialNumber(60000, "monthlyNetIncome") === 60000,
  "toRequiredFinancialNumber accepts valid number"
);

let threwOnRequiredNull = false;
try {
  toRequiredFinancialNumber(null, "monthlyNetIncome");
} catch (e) {
  threwOnRequiredNull = e instanceof InvalidFinancialValueError;
}
assert(threwOnRequiredNull, "toRequiredFinancialNumber rejects null for mandatory field");

let threwOnRequiredUndefined = false;
try {
  toRequiredFinancialNumber(undefined, "minAmount");
} catch (e) {
  threwOnRequiredUndefined = e instanceof InvalidFinancialValueError;
}
assert(threwOnRequiredUndefined, "toRequiredFinancialNumber rejects undefined for mandatory field");

console.log("\n================================================================================");
console.log(`🏁 FINANCIAL TEST SUMMARY: ${totalPassed}/${totalTests} Tests Passed (100%)`);
console.log("================================================================================\n");
