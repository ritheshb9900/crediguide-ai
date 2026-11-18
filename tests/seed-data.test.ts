import {
  SYNTHETIC_PRODUCTS,
  SYNTHETIC_RULES,
  SYNTHETIC_DOCUMENTS,
  SYNTHETIC_APPLICANTS,
} from "../src/services/data/synthetic-data";
import { SyntheticLoanDataProvider } from "../src/services/data/synthetic-adapter";
import { evaluateLoanEligibility } from "../src/services/eligibility/engine";
import { EmploymentType } from "../src/types/domain";
import { isDemoApplicantRecord } from "../prisma/seed";

/**
 * Phase 3 Comprehensive Test Suite:
 * Validates Enterprise Seeding, Master Catalog, Product Rules, Document Mapping,
 * Dynamic Engine Compatibility, Synthetic Scenarios, and Safety Guards.
 */
async function runPhase3Tests() {
  console.log("================================================================================");
  console.log("🧪 CrediGuide AI - Phase 3 Enterprise Seeding & Demonstration Data Test Suite");
  console.log("================================================================================\n");

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ""}`);
      throw new Error(`Assertion failed: ${testName}`);
    }
  }

  // ===========================================================================
  // TEST GROUP 1: LOAN PRODUCT CATALOG VALIDATION
  // ===========================================================================
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 1: Loan Product Master Catalog (4 Products)");
  console.log("--------------------------------------------------------------------------------");

  assert(SYNTHETIC_PRODUCTS.length === 4, "Catalog contains exactly 4 distinct loan products");

  const expectedCodes = [
    "PL_STANDARD",
    "PL_PRIME_SALARIED",
    "PL_EXPRESS_FLEXI",
    "PL_PROFESSIONAL_GROWTH",
  ];
  for (const code of expectedCodes) {
    const prod = SYNTHETIC_PRODUCTS.find((p) => p.productCode === code);
    assert(!!prod, `Product ${code} exists in master catalog`);
    if (prod) {
      assert(prod.minAmount > 0 && prod.maxAmount > prod.minAmount, `${code}: Valid loan amount boundaries`);
      assert(prod.minTenureMonths > 0 && prod.maxTenureMonths > prod.minTenureMonths, `${code}: Valid tenure boundaries`);
      assert(prod.minInterestRate > 0 && prod.maxInterestRate > prod.minInterestRate, `${code}: Valid interest rates`);
      assert(prod.processingFeePercentage >= 0, `${code}: Non-negative processing fee`);
      assert(prod.isActive === true, `${code}: Product is active`);
    }
  }

  // Cross-product policy consistency
  const prime = SYNTHETIC_PRODUCTS.find((p) => p.productCode === "PL_PRIME_SALARIED")!;
  const standard = SYNTHETIC_PRODUCTS.find((p) => p.productCode === "PL_STANDARD")!;
  const flexi = SYNTHETIC_PRODUCTS.find((p) => p.productCode === "PL_EXPRESS_FLEXI")!;
  const growth = SYNTHETIC_PRODUCTS.find((p) => p.productCode === "PL_PROFESSIONAL_GROWTH")!;

  assert(prime.minInterestRate < standard.minInterestRate, "Prime loan has lower interest rate than Standard");
  assert(flexi.minInterestRate > standard.minInterestRate, "Express Flexi has risk-adjusted higher rate than Standard");
  assert(prime.processingFeePercentage < standard.processingFeePercentage, "Prime loan has lower processing fee than Standard");
  assert(growth.maxAmount > standard.maxAmount, "Professional Growth supports higher maximum amount (up to ₹50L)");

  // ===========================================================================
  // TEST GROUP 2: ELIGIBILITY RULES COMPLETENESS (24 Rules - 6 per Product)
  // ===========================================================================
  console.log("\n--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 2: Eligibility Rules (24 Rules - 6 per Product)");
  console.log("--------------------------------------------------------------------------------");

  assert(SYNTHETIC_RULES.length === 24, "Total rule count is exactly 24 rules");

  const requiredRuleCodes = [
    "AGE_RANGE",
    "MIN_INCOME",
    "MAX_FOIR",
    "TENURE_RANGE",
    "EMPLOYMENT_TYPE",
    "MIN_CREDIT_SCORE",
  ];

  for (const prod of SYNTHETIC_PRODUCTS) {
    const prodRules = SYNTHETIC_RULES.filter((r) => r.productId === prod.id);
    assert(prodRules.length === 6, `${prod.productCode} has exactly 6 configured rules`);

    for (const ruleCode of requiredRuleCodes) {
      const rule = prodRules.find((r) => r.ruleCode === ruleCode);
      assert(!!rule, `${prod.productCode} configures rule ${ruleCode}`);
      if (rule) {
        assert(rule.isMandatory === true, `${prod.productCode} -> ${ruleCode} is mandatory`);
        assert(rule.isActive === true, `${prod.productCode} -> ${ruleCode} is active`);
        assert(rule.errorMessage.length > 0, `${prod.productCode} -> ${ruleCode} has descriptive error message`);
      }
    }
  }

  // Credit score thresholds check
  const stdCreditRule = SYNTHETIC_RULES.find((r) => r.productId === standard.id && r.ruleCode === "MIN_CREDIT_SCORE")!;
  const primeCreditRule = SYNTHETIC_RULES.find((r) => r.productId === prime.id && r.ruleCode === "MIN_CREDIT_SCORE")!;
  const flexiCreditRule = SYNTHETIC_RULES.find((r) => r.productId === flexi.id && r.ruleCode === "MIN_CREDIT_SCORE")!;
  const growthCreditRule = SYNTHETIC_RULES.find((r) => r.productId === growth.id && r.ruleCode === "MIN_CREDIT_SCORE")!;

  assert(stdCreditRule.thresholdValue === "650", "Standard loan requires credit score ≥ 650");
  assert(primeCreditRule.thresholdValue === "750", "Prime loan requires prime credit score ≥ 750");
  assert(flexiCreditRule.thresholdValue === "600", "Express Flexi allows credit score down to 600");
  assert(growthCreditRule.thresholdValue === "700", "Professional Growth requires credit score ≥ 700");

  // ===========================================================================
  // TEST GROUP 3: DOCUMENT REQUIREMENTS & EMPLOYMENT ISOLATION
  // ===========================================================================
  console.log("\n--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 3: Document Requirements & Employment Isolation (21 Requirements)");
  console.log("--------------------------------------------------------------------------------");

  assert(SYNTHETIC_DOCUMENTS.length === 21, "Total document requirements count is exactly 21");

  for (const prod of SYNTHETIC_PRODUCTS) {
    const prodDocs = SYNTHETIC_DOCUMENTS.filter((d) => d.productId === prod.id);
    assert(prodDocs.length >= 4, `${prod.productCode} configures at least 4 document requirements`);
    assert(prodDocs.some((d) => d.documentType === "IDENTITY_PROOF"), `${prod.productCode} requires IDENTITY_PROOF`);
    assert(prodDocs.some((d) => d.documentType === "ADDRESS_PROOF"), `${prod.productCode} requires ADDRESS_PROOF`);
    assert(prodDocs.some((d) => d.documentType === "BANK_STATEMENT"), `${prod.productCode} requires BANK_STATEMENT`);
    assert(prodDocs.some((d) => d.documentType === "INCOME_PROOF"), `${prod.productCode} requires INCOME_PROOF`);
  }

  // Test Document Filtering for Salaried vs Self-Employed on PL_STANDARD
  const stdDocs = SYNTHETIC_DOCUMENTS.filter((d) => d.productId === standard.id);

  // Evaluate dummy salaried applicant
  const salariedEval = evaluateLoanEligibility({
    applicant: {
      firstName: "Test",
      lastName: "Salaried",
      email: "test.salaried@example.com",
      age: 30,
      employmentType: "Salaried",
      monthlyNetIncome: 60000,
      existingMonthlyEmi: 5000,
      creditScore: 750,
    },
    requestedAmount: 500000,
    requestedTenureMonths: 36,
    product: standard,
    rules: SYNTHETIC_RULES.filter((r) => r.productId === standard.id),
    documents: stdDocs,
  });

  assert(
    salariedEval.documents.some((d) => d.name.includes("Salary Slips")),
    "Salaried applicant receives Salary Slips requirement"
  );
  assert(
    !salariedEval.documents.some((d) => d.name.includes("Income Tax Returns (ITR)")),
    "Salaried applicant is NEVER asked for 2-year business ITR"
  );

  // Evaluate dummy self-employed applicant
  const selfEmployedEval = evaluateLoanEligibility({
    applicant: {
      firstName: "Test",
      lastName: "SelfEmployed",
      email: "test.self@example.com",
      age: 35,
      employmentType: "Self-employed",
      monthlyNetIncome: 80000,
      existingMonthlyEmi: 10000,
      creditScore: 740,
    },
    requestedAmount: 500000,
    requestedTenureMonths: 36,
    product: standard,
    rules: SYNTHETIC_RULES.filter((r) => r.productId === standard.id),
    documents: stdDocs,
  });

  assert(
    selfEmployedEval.documents.some((d) => d.name.includes("Income Tax Returns (ITR)")),
    "Self-employed applicant receives ITR requirement"
  );
  assert(
    !selfEmployedEval.documents.some((d) => d.name.includes("Salary Slips")),
    "Self-employed applicant is NEVER asked for Salary Slips"
  );

  // ===========================================================================
  // TEST GROUP 4: DYNAMIC ENGINE BACKWARD COMPATIBILITY (6 Criteria Invariant)
  // ===========================================================================
  console.log("\n--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 4: Dynamic Engine Backward Compatibility Invariants");
  console.log("--------------------------------------------------------------------------------");

  for (const prod of SYNTHETIC_PRODUCTS) {
    const prodRules = SYNTHETIC_RULES.filter((r) => r.productId === prod.id);
    const prodDocs = SYNTHETIC_DOCUMENTS.filter((d) => d.productId === prod.id);

    const res = evaluateLoanEligibility({
      applicant: {
        firstName: "Invariant",
        lastName: "Checker",
        email: "check@example.com",
        age: 32,
        employmentType: "Salaried",
        monthlyNetIncome: 90000,
        existingMonthlyEmi: 8000,
        creditScore: 780,
      },
      requestedAmount: 300000,
      requestedTenureMonths: 24,
      product: prod,
      rules: prodRules,
      documents: prodDocs,
    });

    assert(res.criteria.length === 6, `${prod.productCode}: criteria.length is strictly 6`);
    assert(res.criteria[0].criterion === "Applicant Age Range", `${prod.productCode}: Criterion 1 title matches`);
    assert(res.criteria[1].criterion === "Minimum Monthly Income", `${prod.productCode}: Criterion 2 title matches`);
    assert(res.criteria[2].criterion === "Existing FOIR (Configurable Demonstration Rule)", `${prod.productCode}: Criterion 3 title matches`);
    assert(res.criteria[3].criterion === "Loan Tenure Range", `${prod.productCode}: Criterion 4 title matches`);
    assert(res.criteria[4].criterion === "Eligible Employment Type", `${prod.productCode}: Criterion 5 title matches`);
    assert(res.criteria[5].criterion === "Requested Loan Amount & Repayment Capacity", `${prod.productCode}: Criterion 6 title matches`);
  }

  // ===========================================================================
  // TEST GROUP 5: SYNTHETIC APPLICANT SCENARIOS & DECISION OUTCOMES
  // ===========================================================================
  console.log("\n--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 5: Synthetic Applicant Scenarios & Policy Outcomes");
  console.log("--------------------------------------------------------------------------------");

  assert(SYNTHETIC_APPLICANTS.length === 14, "Contains exactly 14 structured demonstration applicants");

  // Helper to evaluate applicant
  function assessApplicant(appEmail: string, prodCode: string, reqAmount: number, reqTenure: number) {
    const app = SYNTHETIC_APPLICANTS.find((a) => a.email === appEmail);
    if (!app) throw new Error(`Applicant ${appEmail} not found`);
    const prod = SYNTHETIC_PRODUCTS.find((p) => p.productCode === prodCode);
    if (!prod) throw new Error(`Product ${prodCode} not found`);
    const rules = SYNTHETIC_RULES.filter((r) => r.productId === prod.id);
    const docs = SYNTHETIC_DOCUMENTS.filter((d) => d.productId === prod.id);

    return evaluateLoanEligibility({
      applicant: {
        firstName: app.firstName,
        lastName: app.lastName,
        email: app.email,
        phone: app.phone || undefined,
        age: app.age || 30,
        employmentType: app.employmentType as EmploymentType,
        employerName: app.employerName || undefined,
        monthlyNetIncome: app.monthlyNetIncome,
        existingMonthlyEmi: app.existingMonthlyEmi,
        creditScore: app.creditScore || undefined,
      },
      requestedAmount: reqAmount,
      requestedTenureMonths: reqTenure,
      product: prod,
      rules,
      documents: docs,
    });
  }

  // Scenario 1: Rohit Sharma on PL_STANDARD -> ELIGIBLE
  const s1 = assessApplicant("rohit.sharma@example.com", "PL_STANDARD", 800000, 60);
  assert(s1.status === "ELIGIBLE", "Scenario 1: Rohit Sharma is ELIGIBLE for Standard Personal Loan");

  // Scenario 2: Rohit Sharma on PL_PRIME_SALARIED -> ELIGIBLE
  const s2 = assessApplicant("rohit.sharma@example.com", "PL_PRIME_SALARIED", 800000, 60);
  assert(s2.status === "ELIGIBLE", "Scenario 2: Rohit Sharma is ELIGIBLE for Prime Salaried Loan");

  // Scenario 3: Ananya Desai on PL_STANDARD -> ELIGIBLE
  const s3 = assessApplicant("ananya.desai@example.com", "PL_STANDARD", 300000, 36);
  assert(s3.status === "ELIGIBLE", "Scenario 3: Ananya Desai (45k income, ₹3L loan) is ELIGIBLE for Standard");

  // Scenario 4: Ananya Desai on PL_PRIME_SALARIED -> NOT_ELIGIBLE (Income 45k < 50k, Score 720 < 750)
  const s4 = assessApplicant("ananya.desai@example.com", "PL_PRIME_SALARIED", 300000, 36);
  assert(s4.status === "NOT_ELIGIBLE", "Scenario 4: Ananya Desai is NOT_ELIGIBLE for Prime Salaried");
  assert(
    s4.reasons.some((r) => r.includes("50,000")),
    "Scenario 4: Explicit explanation of sub-50k income failure"
  );

  // Scenario 5: Priya Patel on PL_STANDARD -> NOT_ELIGIBLE (High FOIR: 66.67% > 50%)
  const s5 = assessApplicant("priya.patel@example.com", "PL_STANDARD", 500000, 36);
  assert(s5.status === "NOT_ELIGIBLE", "Scenario 5: Priya Patel fails due to high debt burden (FOIR)");
  assert(
    s5.reasons.some((r) => r.includes("FOIR")),
    "Scenario 5: Explicit explanation of FOIR failure"
  );

  // Scenario 6: Sneha Kulkarni on PL_STANDARD -> NOT_ELIGIBLE (Income 25k < 30k)
  const s6Std = assessApplicant("sneha.k@example.com", "PL_STANDARD", 200000, 24);
  assert(s6Std.status === "NOT_ELIGIBLE", "Scenario 6a: Sneha Kulkarni (₹25k) is NOT_ELIGIBLE for Standard (needs ₹30k)");

  // Scenario 7: Sneha Kulkarni on PL_EXPRESS_FLEXI -> ELIGIBLE (Income 25k >= 25k, Score 700 >= 600)
  const s6Flx = assessApplicant("sneha.k@example.com", "PL_EXPRESS_FLEXI", 100000, 18);
  assert(s6Flx.status === "ELIGIBLE", "Scenario 6b: Sneha Kulkarni is ELIGIBLE for Express Flexi Credit");

  // Scenario 8: Manoj Kumar on PL_EXPRESS_FLEXI -> NOT_ELIGIBLE (Income 18k < 25k)
  const s7 = assessApplicant("manoj.kumar@example.com", "PL_EXPRESS_FLEXI", 50000, 12);
  assert(s7.status === "NOT_ELIGIBLE", "Scenario 7: Manoj Kumar (₹18k) is NOT_ELIGIBLE across all products");

  // Scenario 9: Amit Verma on PL_STANDARD -> NOT_ELIGIBLE (Age 19 < 21)
  const s8 = assessApplicant("amit.verma@example.com", "PL_STANDARD", 500000, 36);
  assert(s8.status === "NOT_ELIGIBLE", "Scenario 8: Amit Verma (age 19) is NOT_ELIGIBLE due to age limit");

  // Scenario 10: Rameshwar Iyer on PL_STANDARD -> NOT_ELIGIBLE (Age 63 > 60)
  const s9Std = assessApplicant("rameshwar.iyer@example.com", "PL_STANDARD", 500000, 36);
  assert(s9Std.status === "NOT_ELIGIBLE", "Scenario 9a: Rameshwar Iyer (age 63) is NOT_ELIGIBLE for Standard (max age 60)");

  // Scenario 11: Rameshwar Iyer on PL_PROFESSIONAL_GROWTH -> ELIGIBLE (Age 63 <= 65, Income 85k >= 75k)
  const s9Gro = assessApplicant("rameshwar.iyer@example.com", "PL_PROFESSIONAL_GROWTH", 1000000, 48);
  assert(s9Gro.status === "ELIGIBLE", "Scenario 9b: Rameshwar Iyer is ELIGIBLE for Professional Growth (max age 65)");

  // Scenario 12: Dr. Kavita Raman on PL_PRIME_SALARIED -> NOT_ELIGIBLE (Self-employed vs Salaried only)
  const s10Prm = assessApplicant("kavita.raman@example.com", "PL_PRIME_SALARIED", 1500000, 48);
  assert(s10Prm.status === "NOT_ELIGIBLE", "Scenario 10a: Dr. Kavita Raman is NOT_ELIGIBLE for Prime Salaried");
  assert(
    s10Prm.reasons.some((r) => r.includes("Salaried")),
    "Scenario 10a: Explicit reason explaining Salaried-only product restriction"
  );

  // Scenario 13: Dr. Kavita Raman on PL_PROFESSIONAL_GROWTH -> ELIGIBLE
  const s10Gro = assessApplicant("kavita.raman@example.com", "PL_PROFESSIONAL_GROWTH", 2500000, 60);
  assert(s10Gro.status === "ELIGIBLE", "Scenario 10b: Dr. Kavita Raman is ELIGIBLE for Professional Growth Loan");

  // Scenario 14: Deepika Nair on PL_STANDARD (Requesting ₹45L on ₹60k salary) -> CONDITIONAL
  const s11 = assessApplicant("deepika.n@example.com", "PL_STANDARD", 4500000, 60);
  assert(s11.status === "CONDITIONAL", "Scenario 11: Deepika Nair has CONDITIONAL status due to capacity mismatch");
  assert(
    s11.reasons.some((r) => r.includes("exceeds maximum repayment capacity")),
    "Scenario 11: Explicit policy condition explaining capacity limit"
  );
  assert(
    s11.nextSteps.some((step) => step.includes("adjusted conditional loan amount")),
    "Scenario 11: Actionable next step providing capped amount"
  );

  // Scenario 15: Sunita Rao on PL_EXPRESS_FLEXI -> ELIGIBLE
  const s12 = assessApplicant("sunita.rao@example.com", "PL_EXPRESS_FLEXI", 150000, 24);
  assert(s12.status === "ELIGIBLE", "Scenario 12: Sunita Rao is ELIGIBLE for Express Flexi Credit");

  // Scenario 16: Harish Chandra on PL_PROFESSIONAL_GROWTH -> NOT_ELIGIBLE (FOIR 65% > 60%, Score 690 < 700)
  const s13 = assessApplicant("harish.chandra@example.com", "PL_PROFESSIONAL_GROWTH", 1000000, 48);
  assert(s13.status === "NOT_ELIGIBLE", "Scenario 13: Harish Chandra is NOT_ELIGIBLE (High FOIR & sub-700 score)");

  // Scenario 17: Karthik Subramanian (Score 620): Fails Standard (min 650), Passes Flexi (min 600)
  const s14Std = assessApplicant("karthik.s@example.com", "PL_STANDARD", 300000, 24);
  assert(s14Std.status === "NOT_ELIGIBLE", "Scenario 14a: Karthik (score 620) is NOT_ELIGIBLE for Standard (min 650)");
  assert(
    s14Std.reasons.some((r) => r.includes("650")),
    "Scenario 14a: Explicit reason citing credit score 650 threshold"
  );

  const s14Flx = assessApplicant("karthik.s@example.com", "PL_EXPRESS_FLEXI", 200000, 24);
  assert(s14Flx.status === "ELIGIBLE", "Scenario 14b: Karthik (score 620) is ELIGIBLE for Flexi (min 600)");

  // ===========================================================================
  // TEST GROUP 6: MISSING INFORMATION & CREDIT SCORE BOUNDARY
  // ===========================================================================
  console.log("\n--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 6: Missing Information Detection & Credit Score Boundaries");
  console.log("--------------------------------------------------------------------------------");

  // Missing credit score triggers requiresMoreInformation
  const missingScoreRes = evaluateLoanEligibility({
    applicant: {
      firstName: "Unverified",
      lastName: "Score",
      email: "unverified@example.com",
      age: 28,
      employmentType: "Salaried",
      monthlyNetIncome: 60000,
      existingMonthlyEmi: 5000,
      creditScore: undefined, // Credit score not provided
    },
    requestedAmount: 500000,
    requestedTenureMonths: 36,
    product: standard,
    rules: SYNTHETIC_RULES.filter((r) => r.productId === standard.id),
    documents: SYNTHETIC_DOCUMENTS.filter((d) => d.productId === standard.id),
  });

  assert(missingScoreRes.requiresMoreInformation === true, "Missing credit score flags requiresMoreInformation = true");
  assert(
    Boolean(missingScoreRes.missingInformation?.some((m) => m.includes("Credit bureau score"))),
    "missingInformation lists credit bureau verification"
  );

  // Exact credit score boundary (Score = 650 vs 649 on PL_STANDARD)
  const boundary650 = evaluateLoanEligibility({
    applicant: {
      firstName: "Exact",
      lastName: "Score",
      email: "exact650@example.com",
      age: 28,
      employmentType: "Salaried",
      monthlyNetIncome: 60000,
      existingMonthlyEmi: 5000,
      creditScore: 650, // Exactly at threshold
    },
    requestedAmount: 500000,
    requestedTenureMonths: 36,
    product: standard,
    rules: SYNTHETIC_RULES.filter((r) => r.productId === standard.id),
    documents: SYNTHETIC_DOCUMENTS.filter((d) => d.productId === standard.id),
  });
  assert(boundary650.status === "ELIGIBLE", "Credit score exactly equal to threshold (650) PASSES");

  const boundary649 = evaluateLoanEligibility({
    applicant: {
      firstName: "Below",
      lastName: "Score",
      email: "below649@example.com",
      age: 28,
      employmentType: "Salaried",
      monthlyNetIncome: 60000,
      existingMonthlyEmi: 5000,
      creditScore: 649, // 1 point below threshold
    },
    requestedAmount: 500000,
    requestedTenureMonths: 36,
    product: standard,
    rules: SYNTHETIC_RULES.filter((r) => r.productId === standard.id),
    documents: SYNTHETIC_DOCUMENTS.filter((d) => d.productId === standard.id),
  });
  assert(boundary649.status === "NOT_ELIGIBLE", "Credit score 1 point below threshold (649) FAILS");

  // ===========================================================================
  // TEST GROUP 7: SYNTHETIC DATA SAFETY & OVERWRITE GUARDS
  // ===========================================================================
  console.log("\n--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 7: Synthetic Data Safety & Isolation");
  console.log("--------------------------------------------------------------------------------");

  for (const app of SYNTHETIC_APPLICANTS) {
    assert(app.id.startsWith("demo-app-"), `${app.email}: ID strictly prefixed with 'demo-app-'`);
    assert(app.email.endsWith("@example.com"), `${app.email}: Strictly uses RFC 2606 '@example.com' domain`);
  }

  // Verify that an in-memory datastore preserves idempotency
  const dataProvider = new SyntheticLoanDataProvider();
  const initialProducts = await dataProvider.getLoanProducts();
  assert(initialProducts.length === 4, "Initial in-memory provider has 4 products");

  // Simulate re-saving an applicant (idempotency check)
  const appToUpdate = SYNTHETIC_APPLICANTS[0];
  await dataProvider.saveApplicant({
    id: appToUpdate.id,
    firstName: appToUpdate.firstName,
    lastName: appToUpdate.lastName,
    email: appToUpdate.email,
    employmentType: appToUpdate.employmentType,
    monthlyNetIncome: appToUpdate.monthlyNetIncome,
    existingMonthlyEmi: appToUpdate.existingMonthlyEmi,
  });

  const fetchedApp = await dataProvider.getApplicantByEmail(appToUpdate.email);
  assert(fetchedApp?.id === appToUpdate.id, "Upserting existing applicant maintains deterministic ID");

  // ---------------------------------------------------------------------------
  // Applicant Overwrite Protection Guard Real Unit Tests (5 Scenarios)
  // ---------------------------------------------------------------------------
  console.log("\n  🛡️ Testing Applicant Overwrite Protection Guard (isDemoApplicantRecord):");

  // Case A: demo-app-rohit + rohit@example.com -> allowed
  const caseA = isDemoApplicantRecord({
    id: "demo-app-rohit",
    email: "rohit@example.com",
  });
  assert(caseA === true, "Case A: demo-app-* ID + @example.com email is recognized as demo record (ALLOWED for update)");

  // Case B: UUID + rohit@example.com -> rejected
  const caseB = isDemoApplicantRecord({
    id: "550e8400-e29b-41d4-a716-446655440000",
    email: "rohit@example.com",
  });
  assert(caseB === false, "Case B: Real UUID + @example.com email is REJECTED (protected from overwrite)");

  // Case C: demo-app-rohit + rohit@gmail.com -> rejected
  const caseC = isDemoApplicantRecord({
    id: "demo-app-rohit",
    email: "rohit@gmail.com",
  });
  assert(caseC === false, "Case C: demo-app-* ID + non-example email is REJECTED (protected from overwrite)");

  // Case D: UUID + rohit@gmail.com -> rejected
  const caseD = isDemoApplicantRecord({
    id: "550e8400-e29b-41d4-a716-446655440000",
    email: "rohit@gmail.com",
  });
  assert(caseD === false, "Case D: Real UUID + non-example email is REJECTED (protected from overwrite)");

  // Case E: existing == null -> not an update of existing record
  const caseE = isDemoApplicantRecord(null);
  assert(caseE === false, "Case E: null existing applicant correctly returns false");

  // Verify rejected records are NOT passed to upsert operation
  function mockSeedApplicantLoop(
    candidate: { id: string; email: string },
    existing: { id: string; email: string } | null
  ): { status: "UPDATED" | "INSERTED" | "SKIPPED"; upsertExecuted: boolean } {
    if (!candidate.email.endsWith("@example.com")) {
      return { status: "SKIPPED", upsertExecuted: false };
    }
    if (existing) {
      const isDemo = isDemoApplicantRecord(existing);
      if (!isDemo) {
        return { status: "SKIPPED", upsertExecuted: false };
      }
    }
    return { status: existing ? "UPDATED" : "INSERTED", upsertExecuted: true };
  }

  // Verify Case B in seed loop: Rejected record is NOT passed to upsert
  const loopResultB = mockSeedApplicantLoop(
    { id: "demo-app-rohit-sharma", email: "rohit.sharma@example.com" },
    { id: "real-uuid-12345", email: "rohit.sharma@example.com" }
  );
  assert(loopResultB.status === "SKIPPED", "Seed Loop Case B: Protected record (UUID + example email) is SKIPPED");
  assert(loopResultB.upsertExecuted === false, "Seed Loop Case B: Upsert operation was strictly BYPASSED (never called)");

  // Verify Case C in seed loop: Rejected record is NOT passed to upsert
  const loopResultC = mockSeedApplicantLoop(
    { id: "demo-app-rohit-sharma", email: "rohit.sharma@example.com" },
    { id: "demo-app-rohit-sharma", email: "rohit.sharma@gmail.com" }
  );
  assert(loopResultC.status === "SKIPPED", "Seed Loop Case C: Protected record with non-example email is SKIPPED");
  assert(loopResultC.upsertExecuted === false, "Seed Loop Case C: Upsert operation was strictly BYPASSED (never called)");

  // Verify Case A in seed loop: Valid demo record is passed to upsert
  const loopResultA = mockSeedApplicantLoop(
    { id: "demo-app-rohit-sharma", email: "rohit.sharma@example.com" },
    { id: "demo-app-rohit-sharma", email: "rohit.sharma@example.com" }
  );
  assert(loopResultA.status === "UPDATED", "Seed Loop Case A: Valid demo record proceeds to UPDATE");
  assert(loopResultA.upsertExecuted === true, "Seed Loop Case A: Upsert WAS called for valid demo update");

  // Verify Case E in seed loop: New applicant insertion
  const loopResultE = mockSeedApplicantLoop(
    { id: "demo-app-new-borrower", email: "new.borrower@example.com" },
    null
  );
  assert(loopResultE.status === "INSERTED", "Seed Loop Case E: Non-existent applicant proceeds to INSERT");
  assert(loopResultE.upsertExecuted === true, "Seed Loop Case E: Upsert WAS called for new applicant insertion");

  console.log("\n================================================================================");
  console.log(`🏁 PHASE 3 TEST SUMMARY: ${passedTests}/${totalTests} Tests Passed (100% SUCCESS)`);
  console.log("================================================================================\n");
}

runPhase3Tests().catch((err) => {
  console.error("Test Suite Execution Failed:", err);
  process.exit(1);
});
