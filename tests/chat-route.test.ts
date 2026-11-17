import { POST } from "../src/app/api/chat/route";
import { ConversationState } from "../src/services/ai/types";

async function testChatOrchestrationFlow() {
  console.log("================================================================================");
  console.log("🔄 Stage 3B: Testing End-to-End Chat Orchestration via POST /api/chat");
  console.log("================================================================================\n");

  let state: ConversationState = {
    applicantProfile: {},
    collectedFields: [],
    missingFields: [],
    currentQuestion: null,
    conversationHistory: [],
  };

  // Helper to simulate calling POST /api/chat
  async function sendChat(message: string) {
    const req = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, conversationState: state }),
    });
    const res = await POST(req);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Chat API error (${res.status}): ${JSON.stringify(data)}`);
    }
    // Update local state with returned state
    state = {
      ...state,
      applicantProfile: data.extractedData,
      collectedFields: data.collectedFields,
      missingFields: data.missingFields,
      currentQuestion: data.nextQuestion,
    };
    return data;
  }

  // ---------------------------------------------------------------------------
  // Turn 1
  // ---------------------------------------------------------------------------
  console.log("Turn 1 - User: 'I need an 8 lakh personal loan.'");
  const r1 = await sendChat("I need an 8 lakh personal loan.");
  console.log(`  Assistant: "${r1.message}"`);
  console.log(`  Ready: ${r1.readyForAssessment} | Engine Called: ${Boolean(r1.assessment)}`);
  if (r1.readyForAssessment || r1.assessment !== undefined || r1.extractedData.requestedAmount !== 800000) {
    throw new Error("Turn 1 failed: Should NOT trigger assessment when fields are missing");
  }

  // ---------------------------------------------------------------------------
  // Turn 2
  // ---------------------------------------------------------------------------
  console.log("\nTurn 2 - User: '60000'");
  const r2 = await sendChat("60000");
  console.log(`  Assistant: "${r2.message}"`);
  console.log(`  Ready: ${r2.readyForAssessment} | Income: ${r2.extractedData.monthlyNetIncome} | Engine Called: ${Boolean(r2.assessment)}`);
  if (r2.readyForAssessment || r2.assessment !== undefined || r2.extractedData.monthlyNetIncome !== 60000) {
    throw new Error("Turn 2 failed: Should NOT trigger assessment");
  }

  // ---------------------------------------------------------------------------
  // Turn 3
  // ---------------------------------------------------------------------------
  console.log("\nTurn 3 - User: 'Salaried'");
  const r3 = await sendChat("Salaried");
  console.log(`  Assistant: "${r3.message}"`);
  console.log(`  Ready: ${r3.readyForAssessment} | Employment: ${r3.extractedData.employmentType} | Engine Called: ${Boolean(r3.assessment)}`);
  if (r3.readyForAssessment || r3.assessment !== undefined || r3.extractedData.employmentType !== "Salaried") {
    throw new Error("Turn 3 failed: Should NOT trigger assessment");
  }

  // ---------------------------------------------------------------------------
  // Turn 4
  // ---------------------------------------------------------------------------
  console.log("\nTurn 4 - User: '5000'");
  const r4 = await sendChat("5000");
  console.log(`  Assistant: "${r4.message}"`);
  console.log(`  Ready: ${r4.readyForAssessment} | EMI: ${r4.extractedData.existingMonthlyEmi} | Engine Called: ${Boolean(r4.assessment)}`);
  if (r4.readyForAssessment || r4.assessment !== undefined || r4.extractedData.existingMonthlyEmi !== 5000) {
    throw new Error("Turn 4 failed: Should NOT trigger assessment");
  }

  // ---------------------------------------------------------------------------
  // Turn 5
  // ---------------------------------------------------------------------------
  console.log("\nTurn 5 - User: '28'");
  const r5 = await sendChat("28");
  console.log(`  Assistant: "${r5.message}"`);
  console.log(`  Ready: ${r5.readyForAssessment} | Age: ${r5.extractedData.age} | Engine Called: ${Boolean(r5.assessment)}`);
  if (r5.readyForAssessment || r5.assessment !== undefined || r5.extractedData.age !== 28) {
    throw new Error("Turn 5 failed: Should NOT trigger assessment");
  }

  // ---------------------------------------------------------------------------
  // Turn 6 - Final required parameter triggers deterministic engine!
  // ---------------------------------------------------------------------------
  console.log("\nTurn 6 - User: '5 years'");
  const r6 = await sendChat("5 years");
  console.log(`  Assistant Message:\n  "${r6.message}"`);
  console.log(`\n  Assessment Evaluation Summary:`);
  console.log(`    - readyForAssessment: ${r6.readyForAssessment}`);
  console.log(`    - status: ${r6.status}`);
  console.log(`    - Proposed EMI: ₹${r6.financialMetrics?.proposedMonthlyEmi}`);
  console.log(`    - Existing FOIR: ${r6.financialMetrics?.existingFoirPercentage}%`);
  console.log(`    - Total Proposed FOIR: ${r6.financialMetrics?.totalFoirPercentage}%`);
  console.log(`    - Max Eligible Capacity: ₹${r6.financialMetrics?.maxEligibleAmount}`);
  console.log(`    - Criteria evaluated: ${r6.criteria?.length}`);
  console.log(`    - Documents required: ${r6.documents?.length}`);

  if (!r6.readyForAssessment) {
    throw new Error("Turn 6 failed: readyForAssessment should be true after Turn 6");
  }
  if (!r6.assessment || r6.status !== "ELIGIBLE") {
    throw new Error(`Turn 6 failed: Expected status ELIGIBLE, got ${r6.status}`);
  }
  if (Math.abs(r6.financialMetrics.proposedMonthlyEmi - 17195.12) > 1.0) {
    throw new Error(`Turn 6 failed: Expected EMI ≈ 17195.12, got ${r6.financialMetrics.proposedMonthlyEmi}`);
  }
  if (Math.abs(r6.financialMetrics.totalFoirPercentage - 36.99) > 0.5) {
    throw new Error(`Turn 6 failed: Expected total FOIR ≈ 36.99%, got ${r6.financialMetrics.totalFoirPercentage}`);
  }

  // Verify neutral lender wording
  const nextStepsText = (r6.nextSteps || []).join(" ");
  if (!nextStepsText.includes("lender verification and formal underwriting")) {
    throw new Error("Turn 6 failed: Expected neutral lender underwriting text");
  }
  if (!nextStepsText.includes("applicable KYC verification with the lender")) {
    throw new Error("Turn 6 failed: Expected neutral lender KYC text");
  }
  if (nextStepsText.includes("TCS BFSI underwriting")) {
    throw new Error("Turn 6 failed: Found improper reference implying TCS is lender");
  }

  console.log("\n✅ Stage 3B 6-Turn Orchestration Flow Verified Perfectly!");

  // ---------------------------------------------------------------------------
  // Additional Test: Negative income rejected
  // ---------------------------------------------------------------------------
  console.log("\n▶ Testing Negative Income Rejection...");
  const invalidReq = new Request("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "My monthly income is -30000",
    }),
  });
  const resBad = await POST(invalidReq);
  const dataBad = await resBad.json();
  if (dataBad.extractedData?.monthlyNetIncome !== undefined || !dataBad.message.includes("negative")) {
    throw new Error("Failed to reject negative income");
  }
  console.log("✅ Passed: Negative income rejected safely without calling engine.");

  console.log("\n================================================================================");
  console.log("🎉 ALL STAGE 3B ORCHESTRATION TESTS PASSED (100% SUCCESS)!");
  console.log("================================================================================");
}

testChatOrchestrationFlow().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
