import { assessLoanEligibility } from "../src/services/eligibility";
import { EligibilityAssessmentRequest } from "../src/types/domain";

interface TestCase {
  name: string;
  description: string;
  expectedStatus: "ELIGIBLE" | "CONDITIONAL" | "NOT_ELIGIBLE";
  request: EligibilityAssessmentRequest;
}

const TEST_CASES: TestCase[] = [
  {
    name: "TEST 1: Prime Salaried Applicant within all limits",
    description: "Age 28, Income ₹60,000, Existing EMI ₹5,000, Loan ₹8,00,000, 5 years, Salaried",
    expectedStatus: "ELIGIBLE",
    request: {
      applicant: {
        firstName: "Aarav",
        lastName: "Mehta",
        email: "aarav.mehta@example.com",
        phone: "9876543210",
        age: 28,
        employmentType: "Salaried",
        monthlyNetIncome: 60000,
        existingMonthlyEmi: 5000,
        creditScore: 750,
      },
      requestedAmount: 800000,
      requestedTenureMonths: 60, // 5 years
      productCode: "PL_STANDARD",
    },
  },
  {
    name: "TEST 2: Underage Applicant Failure",
    description: "Age 19 (< 21), Income ₹60,000, Existing EMI ₹5,000, Loan ₹8,00,000, 5 years",
    expectedStatus: "NOT_ELIGIBLE",
    request: {
      applicant: {
        firstName: "Karan",
        lastName: "Kapoor",
        email: "karan.k@example.com",
        phone: "9876543211",
        age: 19,
        employmentType: "Salaried",
        monthlyNetIncome: 60000,
        existingMonthlyEmi: 5000,
      },
      requestedAmount: 800000,
      requestedTenureMonths: 60,
      productCode: "PL_STANDARD",
    },
  },
  {
    name: "TEST 3: Below Minimum Income Failure",
    description: "Age 30, Income ₹25,000 (< ₹30,000), Existing EMI ₹2,000, Loan ₹5,00,000, 5 years",
    expectedStatus: "NOT_ELIGIBLE",
    request: {
      applicant: {
        firstName: "Sneha",
        lastName: "Rao",
        email: "sneha.rao@example.com",
        phone: "9876543212",
        age: 30,
        employmentType: "Salaried",
        monthlyNetIncome: 25000,
        existingMonthlyEmi: 2000,
      },
      requestedAmount: 500000,
      requestedTenureMonths: 60,
      productCode: "PL_STANDARD",
    },
  },
  {
    name: "TEST 4: High Debt Burden / FOIR Failure",
    description: "Age 30, Income ₹60,000, Existing EMI ₹40,000 (FOIR 66.67% > 50%), Loan ₹8,00,000, 5 years",
    expectedStatus: "NOT_ELIGIBLE",
    request: {
      applicant: {
        firstName: "Vikram",
        lastName: "Singhania",
        email: "vikram.s@example.com",
        phone: "9876543213",
        age: 30,
        employmentType: "Salaried",
        monthlyNetIncome: 60000,
        existingMonthlyEmi: 40000,
      },
      requestedAmount: 800000,
      requestedTenureMonths: 60,
      productCode: "PL_STANDARD",
    },
  },
  {
    name: "TEST 5: Valid Applicant with Excessively High Loan Request",
    description: "Age 30, Income ₹60,000, Existing EMI ₹5,000, Loan ₹45,00,000 (Exceeds capacity of ~₹11.65L)",
    expectedStatus: "CONDITIONAL",
    request: {
      applicant: {
        firstName: "Deepika",
        lastName: "Nair",
        email: "deepika.n@example.com",
        phone: "9876543214",
        age: 30,
        employmentType: "Salaried",
        monthlyNetIncome: 60000,
        existingMonthlyEmi: 5000,
      },
      requestedAmount: 4500000, // 45 Lakhs requested on 60k salary
      requestedTenureMonths: 60,
      productCode: "PL_STANDARD",
    },
  },
];

async function runDeterministicTests() {
  console.log("================================================================================");
  console.log("🏦 TCS Automated Loan Eligibility Engine - Deterministic Test Suite");
  console.log("================================================================================\n");

  let passedTests = 0;

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`RUNNING ${tc.name}`);
    console.log(`Scenario: ${tc.description}`);
    console.log(`Expected Status: [${tc.expectedStatus}]`);
    console.log(`--------------------------------------------------------------------------------`);

    const result = await assessLoanEligibility(tc.request);

    console.log(`\n  Calculated Financial Metrics:`);
    console.log(`    - Monthly Income: ₹${result.financialMetrics.monthlyIncome.toLocaleString("en-IN")}`);
    console.log(`    - Existing EMI: ₹${result.financialMetrics.existingEmi.toLocaleString("en-IN")}`);
    console.log(`    - Existing FOIR: ${result.financialMetrics.existingFoirPercentage.toFixed(2)}% (Max threshold: 50.00%)`);
    console.log(`    - Proposed Loan EMI: ₹${result.financialMetrics.proposedMonthlyEmi.toLocaleString("en-IN")}`);
    console.log(`    - Total Proposed FOIR: ${result.financialMetrics.totalFoirPercentage.toFixed(2)}%`);
    console.log(`    - Calculated Max Eligible Capacity: ₹${result.financialMetrics.maxEligibleAmount.toLocaleString("en-IN")}`);

    console.log(`\n  Evaluated Criteria:`);
    result.criteria.forEach((c) => {
      const icon = c.status === "PASS" ? "✅ PASS" : "❌ FAIL";
      console.log(`    ${icon} | ${c.criterion.padEnd(45)} | Value: ${c.applicantValue.padEnd(20)} | Req: ${c.requiredValue}`);
      console.log(`         Explanation: ${c.explanation}`);
    });

    console.log(`\n  Outcome Decision:`);
    console.log(`    Status: ${result.status}`);
    console.log(`    Reasons: ${result.reasons.join(" ")}`);
    console.log(`    Next Steps:`);
    result.nextSteps.forEach((step) => console.log(`      • ${step}`));

    const isMatch = result.status === tc.expectedStatus;
    if (isMatch) {
      console.log(`\n>>> RESULT: SUCCESS (Matches expected status ${tc.expectedStatus})\n`);
      passedTests++;
    } else {
      console.error(`\n>>> RESULT: FAILED (Expected ${tc.expectedStatus}, got ${result.status})\n`);
    }
  }

  console.log("================================================================================");
  console.log(`🏁 TEST SUMMARY: ${passedTests}/${TEST_CASES.length} Test Cases Passed (${((passedTests / TEST_CASES.length) * 100).toFixed(0)}%)`);
  console.log("================================================================================");

  if (passedTests !== TEST_CASES.length) {
    process.exit(1);
  }
}

runDeterministicTests().catch((err) => {
  console.error("Test execution failed with error:", err);
  process.exit(1);
});
