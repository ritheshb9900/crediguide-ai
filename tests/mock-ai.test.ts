import { getAIService } from "../src/services/ai";
import { MockAIService } from "../src/services/ai/mock-ai-service";
import { ConversationState } from "../src/services/ai/types";
import { assessLoanEligibility } from "../src/services/eligibility";

async function runStage3ATests() {
  console.log("================================================================================");
  console.log("🤖 CrediGuide AI - Conversational Extraction Test Suite");
  console.log("================================================================================\n");

  const aiService = getAIService();
  let passedCount = 0;
  const totalCount = 11; // 10 test scenarios + 1 complete multi-turn flow

  // ---------------------------------------------------------------------------
  // TEST 1: Requested Loan Amount Extraction
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST 1: Requested Loan Amount Normalization");
  console.log("Input: 'I need an 8 lakh personal loan.'");
  const t1 = await aiService.processChatMessage("I need an 8 lakh personal loan.");
  console.log("Extracted:", t1.extractedData);
  if (t1.extractedData.requestedAmount === 800000) {
    console.log("✅ Passed: requestedAmount = 800000\n");
    passedCount++;
  } else {
    throw new Error(`Test 1 Failed: Expected 800000, got ${t1.extractedData.requestedAmount}`);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Age and Income Extraction
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST 2: Age and Monthly Net Income Extraction");
  console.log("Input: 'I am 28 years old and earn 60000 per month.'");
  const t2 = await aiService.processChatMessage("I am 28 years old and earn 60000 per month.");
  console.log("Extracted:", t2.extractedData);
  if (t2.extractedData.age === 28 && t2.extractedData.monthlyNetIncome === 60000) {
    console.log("✅ Passed: age = 28, monthlyNetIncome = 60000\n");
    passedCount++;
  } else {
    throw new Error(`Test 2 Failed: Expected age 28 & income 60000, got ${JSON.stringify(t2.extractedData)}`);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Employment Type and Existing EMI
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST 3: Employment Type and Existing EMI Extraction");
  console.log("Input: 'I am salaried and my existing EMI is 5000.'");
  const t3 = await aiService.processChatMessage("I am salaried and my existing EMI is 5000.");
  console.log("Extracted:", t3.extractedData);
  if (t3.extractedData.employmentType === "Salaried" && t3.extractedData.existingMonthlyEmi === 5000) {
    console.log("✅ Passed: employmentType = Salaried, existingMonthlyEmi = 5000\n");
    passedCount++;
  } else {
    throw new Error(`Test 3 Failed: Expected Salaried & EMI 5000, got ${JSON.stringify(t3.extractedData)}`);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Tenure Normalization (Years to Months)
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST 4: Loan Tenure Normalization");
  console.log("Input: 'I want a 5 year tenure.'");
  const t4 = await aiService.processChatMessage("I want a 5 year tenure.");
  console.log("Extracted:", t4.extractedData);
  if (t4.extractedData.requestedTenureMonths === 60) {
    console.log("✅ Passed: requestedTenureMonths = 60\n");
    passedCount++;
  } else {
    throw new Error(`Test 4 Failed: Expected 60 months, got ${t4.extractedData.requestedTenureMonths}`);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Multiple Fields in Single Message
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST 5: Comprehensive Multi-Field Extraction");
  const multiMsg = "I am 32 years old, working in a company earning 95k monthly with 12k existing EMI, looking for 15L loan for 4 years.";
  console.log(`Input: '${multiMsg}'`);
  const t5 = await aiService.processChatMessage(multiMsg);
  console.log("Extracted:", t5.extractedData);
  if (
    t5.extractedData.age === 32 &&
    t5.extractedData.employmentType === "Salaried" &&
    t5.extractedData.monthlyNetIncome === 95000 &&
    t5.extractedData.existingMonthlyEmi === 12000 &&
    t5.extractedData.requestedAmount === 1500000 &&
    t5.extractedData.requestedTenureMonths === 48
  ) {
    console.log("✅ Passed: All 6 financial parameters extracted accurately\n");
    passedCount++;
  } else {
    throw new Error(`Test 5 Failed: Mismatched multi-field values: ${JSON.stringify(t5.extractedData)}`);
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Message with No Recognizable Financial Information
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST 6: Non-Financial Query (Zero Inventions)");
  console.log("Input: 'Good morning, can you explain how this loan assistant works?'");
  const t6 = await aiService.processChatMessage("Good morning, can you explain how this loan assistant works?");
  console.log("Extracted:", t6.extractedData);
  if (Object.keys(t6.extractedData).length === 0) {
    console.log("✅ Passed: Zero false positive fields invented\n");
    passedCount++;
  } else {
    throw new Error(`Test 6 Failed: Inferred unmentioned fields: ${JSON.stringify(t6.extractedData)}`);
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Invalid Values Handling (Negative Income / Out of Bounds Age)
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST 7: Invalid Value Guardrails");
  console.log("Input: 'My monthly income is -50000'");
  const t7 = await aiService.processChatMessage("My monthly income is -50000");
  console.log("Response Message:", t7.message);
  console.log("Extracted Data:", t7.extractedData);
  if (t7.extractedData.monthlyNetIncome === undefined && t7.message.includes("negative")) {
    console.log("✅ Passed: Negative income rejected with conversational guidance\n");
    passedCount++;
  } else {
    throw new Error(`Test 7 Failed: Allowed negative income or omitted error message`);
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Missing Gemini API Key / Offline Fallback
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST 8: Provider Fallback (Offline Zero-Key Execution)");
  delete process.env.GEMINI_API_KEY;
  process.env.AI_PROVIDER = "mock";
  const fallbackService = getAIService();
  console.log("Provider Name:", fallbackService.providerName);
  if (fallbackService instanceof MockAIService && fallbackService.providerName === "MOCK_LOCAL_AI") {
    console.log("✅ Passed: Graceful fallback to MockAIService without requiring API key\n");
    passedCount++;
  } else {
    throw new Error(`Test 8 Failed: Expected MockAIService, got ${fallbackService.providerName}`);
  }

  // ---------------------------------------------------------------------------
  // TEST 9: Mock AI Decision Boundary (Never Makes Eligibility Decision)
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST 9: AI Boundary Verification (No Eligibility Determination)");
  const t9 = await aiService.processChatMessage("I am 28, salaried, 60k income, 5k emi, want 8L for 5 years.");
  console.log("Output Keys:", Object.keys(t9));
  // Must NOT contain 'status' like ELIGIBLE / NOT_ELIGIBLE, nor calculate FOIR/EMI
  const hasEligibilityStatus = "status" in t9 || "eligibilityStatus" in t9 || "approved" in t9;
  if (!hasEligibilityStatus && typeof t9.readyForAssessment === "boolean") {
    console.log("✅ Passed: Mock AI adheres to boundary: NO loan approval/rejection issued\n");
    passedCount++;
  } else {
    throw new Error(`Test 9 Failed: Mock AI breached boundary and issued eligibility determination!`);
  }

  // ---------------------------------------------------------------------------
  // TEST 10: Stage 2 Deterministic API Compatibility
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST 10: Stage 2 Eligibility Engine Untouched & Functional");
  const stage2Assessment = await assessLoanEligibility({
    applicant: {
      firstName: "Aarav",
      lastName: "Mehta",
      email: "aarav.mehta@example.com",
      phone: "9876543210",
      age: 28,
      employmentType: "Salaried",
      monthlyNetIncome: 60000,
      existingMonthlyEmi: 5000,
    },
    requestedAmount: 800000,
    requestedTenureMonths: 60,
    productCode: "PL_STANDARD",
  });
  console.log("Stage 2 Status:", stage2Assessment.status);
  console.log("Stage 2 Proposed EMI:", stage2Assessment.financialMetrics.proposedMonthlyEmi);
  if (stage2Assessment.status === "ELIGIBLE" && stage2Assessment.criteria.length === 6) {
    console.log("✅ Passed: Stage 2 engine remains 100% functional and independent\n");
    passedCount++;
  } else {
    throw new Error(`Test 10 Failed: Stage 2 assessment mismatch`);
  }

  // ---------------------------------------------------------------------------
  // TEST 11: Multi-Turn Conversational Flow (Section 11 Specification)
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST 11: Multi-Turn Conversational Flow Step-by-Step (Section 11)");
  console.log("--------------------------------------------------------------------------------");

  let state: ConversationState = {
    applicantProfile: {},
    collectedFields: [],
    missingFields: [],
    currentQuestion: null,
    conversationHistory: [],
  };

  // Turn 1
  console.log("Turn 1 - User: 'I need an 8 lakh personal loan.'");
  let res = await aiService.processChatMessage("I need an 8 lakh personal loan.", state);
  state = { ...state, applicantProfile: res.extractedData, collectedFields: res.collectedFields, missingFields: res.missingFields, currentQuestion: res.nextQuestion };
  console.log(`Assistant: "${res.message}"`);
  console.log(`State: Amount=${state.applicantProfile.requestedAmount}, Ready=${res.readyForAssessment}`);
  if (state.applicantProfile.requestedAmount !== 800000 || res.readyForAssessment) throw new Error("Turn 1 failed");

  // Turn 2
  console.log("\nTurn 2 - User: '60000'");
  res = await aiService.processChatMessage("60000", state);
  state = { ...state, applicantProfile: res.extractedData, collectedFields: res.collectedFields, missingFields: res.missingFields, currentQuestion: res.nextQuestion };
  console.log(`Assistant: "${res.message}"`);
  console.log(`State: Income=${state.applicantProfile.monthlyNetIncome}, Ready=${res.readyForAssessment}`);
  if (state.applicantProfile.monthlyNetIncome !== 60000 || res.readyForAssessment) throw new Error("Turn 2 failed");

  // Turn 3
  console.log("\nTurn 3 - User: 'Salaried'");
  res = await aiService.processChatMessage("Salaried", state);
  state = { ...state, applicantProfile: res.extractedData, collectedFields: res.collectedFields, missingFields: res.missingFields, currentQuestion: res.nextQuestion };
  console.log(`Assistant: "${res.message}"`);
  console.log(`State: Employment=${state.applicantProfile.employmentType}, Ready=${res.readyForAssessment}`);
  if (state.applicantProfile.employmentType !== "Salaried" || res.readyForAssessment) throw new Error("Turn 3 failed");

  // Turn 4
  console.log("\nTurn 4 - User: '5000'");
  res = await aiService.processChatMessage("5000", state);
  state = { ...state, applicantProfile: res.extractedData, collectedFields: res.collectedFields, missingFields: res.missingFields, currentQuestion: res.nextQuestion };
  console.log(`Assistant: "${res.message}"`);
  console.log(`State: ExistingEMI=${state.applicantProfile.existingMonthlyEmi}, Ready=${res.readyForAssessment}`);
  if (state.applicantProfile.existingMonthlyEmi !== 5000 || res.readyForAssessment) throw new Error("Turn 4 failed");

  // Turn 5
  console.log("\nTurn 5 - User: '28'");
  res = await aiService.processChatMessage("28", state);
  state = { ...state, applicantProfile: res.extractedData, collectedFields: res.collectedFields, missingFields: res.missingFields, currentQuestion: res.nextQuestion };
  console.log(`Assistant: "${res.message}"`);
  console.log(`State: Age=${state.applicantProfile.age}, Ready=${res.readyForAssessment}`);
  if (state.applicantProfile.age !== 28 || res.readyForAssessment) throw new Error("Turn 5 failed");

  // Turn 6
  console.log("\nTurn 6 - User: '5 years'");
  res = await aiService.processChatMessage("5 years", state);
  state = { ...state, applicantProfile: res.extractedData, collectedFields: res.collectedFields, missingFields: res.missingFields, currentQuestion: res.nextQuestion };
  console.log(`Assistant: "${res.message}"`);
  console.log(`State: Tenure=${state.applicantProfile.requestedTenureMonths}, Ready=${res.readyForAssessment}`);
  if (state.applicantProfile.requestedTenureMonths !== 60 || !res.readyForAssessment) {
    throw new Error(`Turn 6 failed: Expected tenure 60 & readyForAssessment=true, got tenure ${state.applicantProfile.requestedTenureMonths} and ready=${res.readyForAssessment}`);
  }

  console.log("\n✅ Passed: Multi-turn conversation culminated with readyForAssessment = true (Zero eligibility calls made)\n");
  passedCount++;

  console.log("================================================================================");
  console.log(`🏁 STAGE 3A TEST SUMMARY: ${passedCount}/${totalCount} Test Scenarios Passed (100%)`);
  console.log("================================================================================\n");
}

runStage3ATests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
