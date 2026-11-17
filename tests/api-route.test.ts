import { POST } from "../src/app/api/eligibility/route";

async function testApiRoute() {
  console.log("================================================================================");
  console.log("🌐 Testing POST /api/eligibility Route Handler Directly");
  console.log("================================================================================\n");

  // 1. Test Valid Request (Prime Applicant)
  console.log("▶ Case 1: Valid payload (Eligible applicant)...");
  const validReq = new Request("http://localhost:3000/api/eligibility", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
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
      requestedTenureMonths: 60,
      productCode: "PL_STANDARD",
    }),
  });

  const res1 = await POST(validReq);
  const data1 = await res1.json();
  console.log(`  Response Status: ${res1.status}`);
  console.log(`  Assessment Status: ${data1.assessment?.status}`);
  console.log(`  Criteria count: ${data1.assessment?.criteria?.length}`);
  if (res1.status !== 200 || data1.assessment?.status !== "ELIGIBLE") {
    throw new Error(`Case 1 failed: Expected status 200 and ELIGIBLE, got ${res1.status} and ${data1.assessment?.status}`);
  }
  console.log("  ✅ Case 1 Passed!\n");

  // 2. Test Invalid Payload (Negative Income -> Zod Validation Failure)
  console.log("▶ Case 2: Zod schema validation rejection (Negative Income)...");
  const invalidReq = new Request("http://localhost:3000/api/eligibility", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      applicant: {
        firstName: "Invalid",
        lastName: "User",
        email: "invalid@example.com",
        age: 25,
        employmentType: "Salaried",
        monthlyNetIncome: -5000, // Invalid!
        existingMonthlyEmi: 0,
      },
      requestedAmount: 100000,
      requestedTenureMonths: 24,
    }),
  });

  const res2 = await POST(invalidReq);
  const data2 = await res2.json();
  console.log(`  Response Status: ${res2.status}`);
  console.log(`  Error Message: ${data2.error}`);
  console.log(`  Validation Details: ${JSON.stringify(data2.details?.fieldErrors)}`);
  if (res2.status !== 400 || !data2.details?.fieldErrors?.applicant) {
    throw new Error(`Case 2 failed: Expected status 400 with applicant field errors`);
  }
  console.log("  ✅ Case 2 Passed!\n");

  // 3. Test Invalid JSON syntax
  console.log("▶ Case 3: Malformed JSON payload rejection...");
  const malformedReq = new Request("http://localhost:3000/api/eligibility", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{ malformed json",
  });

  const res3 = await POST(malformedReq);
  const data3 = await res3.json();
  console.log(`  Response Status: ${res3.status}`);
  console.log(`  Error Message: ${data3.error}`);
  if (res3.status !== 400) {
    throw new Error(`Case 3 failed: Expected status 400 for malformed JSON`);
  }
  console.log("  ✅ Case 3 Passed!\n");

  console.log("================================================================================");
  console.log("🎉 ALL API ROUTE TESTS PASSED SUCCESSFULLY!");
  console.log("================================================================================");
}

testApiRoute().catch((err) => {
  console.error("API test failed:", err);
  process.exit(1);
});
