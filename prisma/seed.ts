import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  SYNTHETIC_PRODUCTS,
  SYNTHETIC_RULES,
  SYNTHETIC_DOCUMENTS,
  SYNTHETIC_APPLICANTS,
} from "../src/services/data/synthetic-data";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("❌ Cannot seed: DATABASE_URL is not defined in environment.");
    process.exit(1);
  }

  console.log("🌱 Starting database seeding with TCS Loan Eligibility dataset...");
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // 1. Seed Loan Products
    console.log(`📦 Seeding ${SYNTHETIC_PRODUCTS.length} loan products...`);
    for (const prod of SYNTHETIC_PRODUCTS) {
      await prisma.loanProduct.upsert({
        where: { productCode: prod.productCode },
        update: {
          name: prod.name,
          description: prod.description,
          minAmount: prod.minAmount,
          maxAmount: prod.maxAmount,
          minTenureMonths: prod.minTenureMonths,
          maxTenureMonths: prod.maxTenureMonths,
          minInterestRate: prod.minInterestRate,
          maxInterestRate: prod.maxInterestRate,
          processingFeePercentage: prod.processingFeePercentage,
          isActive: prod.isActive,
        },
        create: {
          id: prod.id,
          productCode: prod.productCode,
          name: prod.name,
          description: prod.description,
          minAmount: prod.minAmount,
          maxAmount: prod.maxAmount,
          minTenureMonths: prod.minTenureMonths,
          maxTenureMonths: prod.maxTenureMonths,
          minInterestRate: prod.minInterestRate,
          maxInterestRate: prod.maxInterestRate,
          processingFeePercentage: prod.processingFeePercentage,
          isActive: prod.isActive,
        },
      });
    }

    // 2. Seed Eligibility Rules
    console.log(`⚙️ Seeding ${SYNTHETIC_RULES.length} deterministic eligibility rules...`);
    for (const rule of SYNTHETIC_RULES) {
      await prisma.eligibilityRule.upsert({
        where: { id: rule.id },
        update: {
          productId: rule.productId,
          ruleCode: rule.ruleCode,
          name: rule.name,
          description: rule.description,
          category: rule.category,
          operator: rule.operator,
          thresholdValue: rule.thresholdValue,
          weight: rule.weight,
          isMandatory: rule.isMandatory,
          errorMessage: rule.errorMessage,
          isActive: rule.isActive,
        },
        create: {
          id: rule.id,
          productId: rule.productId,
          ruleCode: rule.ruleCode,
          name: rule.name,
          description: rule.description,
          category: rule.category,
          operator: rule.operator,
          thresholdValue: rule.thresholdValue,
          weight: rule.weight,
          isMandatory: rule.isMandatory,
          errorMessage: rule.errorMessage,
          isActive: rule.isActive,
        },
      });
    }

    // 3. Seed Document Requirements
    console.log(`📄 Seeding ${SYNTHETIC_DOCUMENTS.length} document requirements...`);
    for (const doc of SYNTHETIC_DOCUMENTS) {
      await prisma.documentRequirement.upsert({
        where: { id: doc.id },
        update: {
          productId: doc.productId,
          documentType: doc.documentType,
          name: doc.name,
          description: doc.description,
          isMandatory: doc.isMandatory,
          employmentType: doc.employmentType,
        },
        create: {
          id: doc.id,
          productId: doc.productId,
          documentType: doc.documentType,
          name: doc.name,
          description: doc.description,
          isMandatory: doc.isMandatory,
          employmentType: doc.employmentType,
        },
      });
    }

    // 4. Seed Synthetic Benchmark Applicants
    console.log(`👤 Seeding ${SYNTHETIC_APPLICANTS.length} synthetic applicants...`);
    for (const app of SYNTHETIC_APPLICANTS) {
      await prisma.applicant.upsert({
        where: { email: app.email },
        update: {
          firstName: app.firstName,
          lastName: app.lastName,
          phone: app.phone,
          age: app.age,
          employmentType: app.employmentType,
          employerName: app.employerName,
          monthlyNetIncome: app.monthlyNetIncome,
          existingMonthlyEmi: app.existingMonthlyEmi,
          creditScore: app.creditScore,
          city: app.city,
          state: app.state,
          pincode: app.pincode,
          residenceType: app.residenceType,
          workExperienceYears: app.workExperienceYears,
        },
        create: {
          id: app.id,
          firstName: app.firstName,
          lastName: app.lastName,
          email: app.email,
          phone: app.phone,
          age: app.age,
          employmentType: app.employmentType,
          employerName: app.employerName,
          monthlyNetIncome: app.monthlyNetIncome,
          existingMonthlyEmi: app.existingMonthlyEmi,
          creditScore: app.creditScore,
          city: app.city,
          state: app.state,
          pincode: app.pincode,
          residenceType: app.residenceType,
          workExperienceYears: app.workExperienceYears,
        },
      });
    }

    console.log("✅ Database seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error during database seeding:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
