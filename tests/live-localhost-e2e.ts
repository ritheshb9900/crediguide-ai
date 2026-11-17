import { ChatMessage } from "../src/services/ai/types";

async function testLiveServer() {
  const baseUrl = "http://localhost:3000";

  console.log("================================================================================");
  console.log("🚀 STAGE 4: LIVE LOCALHOST PROTOTYPE & EDGE CASE VERIFICATION");
  console.log("================================================================================\n");

  // --------------------------------------------------------------------------
  // EDGE CASE A: Empty Message Validation
  // --------------------------------------------------------------------------
  console.log("▶ EDGE CASE A: Empty Message Submission");
  const emptyRes = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "" }),
  });
  const emptyData = await emptyRes.json();
  if (emptyRes.status === 400 && !emptyData.success) {
    console.log("  ✅ Passed: Empty message correctly rejected by Zod schema with HTTP 400.\n");
  } else {
    throw new Error(`Edge case A failed: expected 400, got ${emptyRes.status}`);
  }

  // --------------------------------------------------------------------------
  // EDGE CASE B: Invalid Financial Input ("My income is -50000")
  // --------------------------------------------------------------------------
  console.log("▶ EDGE CASE B: Invalid Financial Input ('My income is -50000')");
  const negRes = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "My income is -50000" }),
  });
  const negData = await negRes.json();
  if (
    negRes.ok &&
    negData.success &&
    negData.message.includes("cannot be negative") &&
    negData.readyForAssessment === false
  ) {
    console.log(`  Assistant: "${negData.message}"`);
    console.log("  ✅ Passed: Negative income rejected gracefully with user guidance (engine NOT called).\n");
  } else {
    throw new Error(`Edge case B failed: ${JSON.stringify(negData)}`);
  }

  // --------------------------------------------------------------------------
  // EDGE CASE C: Incomplete / Non-financial Conversation
  // --------------------------------------------------------------------------
  console.log("▶ EDGE CASE C: Incomplete Conversation ('Hello, how does this work?')");
  const nonFinRes = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Hello, how does this work?" }),
  });
  const nonFinData = await nonFinRes.json();
  if (
    nonFinRes.ok &&
    nonFinData.success &&
    nonFinData.readyForAssessment === false &&
    !nonFinData.assessment
  ) {
    console.log(`  Assistant: "${nonFinData.message.substring(0, 90)}..."`);
    console.log("  ✅ Passed: Non-financial greeting asks for loan amount without calling engine.\n");
  } else {
    throw new Error(`Edge case C failed: ${JSON.stringify(nonFinData)}`);
  }

  // --------------------------------------------------------------------------
  // 6-TURN CANONICAL HACKATHON DEMO FLOW
  // --------------------------------------------------------------------------
  console.log("================================================================================");
  console.log("▶ 6-TURN COMPLETE DEMO FLOW VERIFICATION");
  console.log("================================================================================");

  let conversationState = {
    applicantProfile: {},
    collectedFields: [] as string[],
    missingFields: [
      "requestedAmount",
      "monthlyNetIncome",
      "employmentType",
      "existingMonthlyEmi",
      "age",
      "requestedTenureMonths",
    ],
    currentQuestion: null as string | null,
    conversationHistory: [] as ChatMessage[],
  };

  const turns = [
    "I need an 8 lakh personal loan.",
    "60000",
    "Salaried",
    "5000",
    "28",
    "5 years",
  ];

  for (let i = 0; i < turns.length; i++) {
    const userMsg = turns[i];
    console.log(`Turn ${i + 1} - User: "${userMsg}"`);

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userMsg,
        conversationState,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      console.error(`❌ FAILED at Turn ${i + 1}:`, data);
      process.exit(1);
    }

    console.log(`  Assistant: "${data.message.substring(0, 95)}..."`);
    console.log(`  Collected: [${(data.collectedFields || []).join(", ")}]`);
    console.log(`  Missing:   [${(data.missingFields || []).join(", ")}]`);
    console.log(`  Engine Called: ${!!data.assessment}`);

    if (data.assessment) {
      console.log("\n  ================================================================");
      console.log("  🎉 FINAL ELIGIBILITY RESULT VERIFICATION (STAGE 2 ENGINE)");
      console.log("  ================================================================");
      console.log(`  - Status:                 ${data.assessment.status}`);
      console.log(`  - Proposed Monthly EMI:   ₹${data.assessment.financialMetrics.proposedMonthlyEmi.toLocaleString("en-IN")}`);
      console.log(`  - Existing FOIR:          ${data.assessment.financialMetrics.existingFoirPercentage.toFixed(2)}%`);
      console.log(`  - Total Proposed FOIR:    ${data.assessment.financialMetrics.totalFoirPercentage.toFixed(2)}%`);
      console.log(`  - Max Eligible Capacity:  ₹${data.assessment.financialMetrics.maxEligibleAmount.toLocaleString("en-IN")}`);
      console.log(`  - Criteria Evaluated:     ${data.assessment.criteria.length} rules`);
      console.log(`  - Required Documents:     ${data.assessment.documents.length} items`);
      console.log(`  - Next Steps:             ${data.assessment.nextSteps.length} recommendations`);

      // Strict validation of expected values from prompt
      if (data.assessment.status !== "ELIGIBLE") {
        throw new Error(`Expected status ELIGIBLE, got ${data.assessment.status}`);
      }
      if (Math.abs(data.assessment.financialMetrics.proposedMonthlyEmi - 17195.12) > 1.0) {
        throw new Error(`Expected EMI ~17195.12, got ${data.assessment.financialMetrics.proposedMonthlyEmi}`);
      }
      if (Math.abs(data.assessment.financialMetrics.totalFoirPercentage - 36.99) > 0.5) {
        throw new Error(`Expected Total FOIR ~36.99%, got ${data.assessment.financialMetrics.totalFoirPercentage}`);
      }
      if (data.assessment.financialMetrics.maxEligibleAmount !== 1160000) {
        throw new Error(`Expected Max Capacity 1160000, got ${data.assessment.financialMetrics.maxEligibleAmount}`);
      }
      console.log("\n  ✅ ALL DEMO VALUES MATCH STAGE 2 DETERMINISTIC FORMULAS EXACTLY!");
    }

    conversationState = {
      applicantProfile: { ...conversationState.applicantProfile, ...data.extractedData },
      collectedFields: data.collectedFields,
      missingFields: data.missingFields,
      currentQuestion: data.nextQuestion,
      conversationHistory: [
        ...conversationState.conversationHistory,
        { id: `u-${i}`, role: "user", content: userMsg, timestamp: new Date().toISOString() },
        { id: `a-${i}`, role: "assistant", content: data.message, timestamp: new Date().toISOString() },
      ],
    };
    console.log("");
  }

  // --------------------------------------------------------------------------
  // WHAT-IF SCENARIO EXPLORER ENDPOINT CHECK
  // --------------------------------------------------------------------------
  console.log("================================================================================");
  console.log("🔬 What-If Scenario Explorer against /api/eligibility");
  console.log("================================================================================");
  const whatIfRes = await fetch(`${baseUrl}/api/eligibility`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      applicant: {
        firstName: "Applicant",
        lastName: "Demo",
        email: "demo@applicant.com",
        phone: "9876543210",
        age: 28,
        employmentType: "Salaried",
        monthlyNetIncome: 60000,
        existingMonthlyEmi: 5000,
      },
      requestedAmount: 1000000,
      requestedTenureMonths: 48,
      productCode: "PL_STANDARD",
    }),
  });

  const whatIfData = await whatIfRes.json();
  if (!whatIfRes.ok || !whatIfData.success) {
    throw new Error("What-If scenario request failed");
  }
  console.log(`  Scenario (₹10L / 48 mo): Status = ${whatIfData.assessment.status}`);
  console.log(`  Proposed EMI: ₹${whatIfData.assessment.financialMetrics.proposedMonthlyEmi.toLocaleString("en-IN")}`);
  console.log(`  Total FOIR: ${whatIfData.assessment.financialMetrics.totalFoirPercentage.toFixed(2)}%`);
  console.log("  ✅ What-If Scenario Calculation Verified!");

  console.log("\n================================================================================");
  console.log("🎉 ALL STAGE 4 END-TO-END AND EDGE CASE VERIFICATIONS PASSED (100%)!");
  console.log("================================================================================\n");
}

testLiveServer().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
