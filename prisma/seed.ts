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

/**
 * Evaluates whether an existing applicant record is safe to update via seed script.
 * An existing applicant can only be updated if BOTH conditions are strictly satisfied:
 * 1. existing.id starts with "demo-app-"
 * 2. existing.email ends with "@example.com"
 *
 * If either condition is false (or if existing is null/undefined), returns false.
 */
export function isDemoApplicantRecord(
  existing: { id: string; email: string } | null | undefined
): boolean {
  if (!existing) {
    return false;
  }
  const hasDemoId = typeof existing.id === "string" && existing.id.startsWith("demo-app-");
  const hasDemoEmail = typeof existing.email === "string" && existing.email.endsWith("@example.com");
  return hasDemoId && hasDemoEmail;
}

/**
 * Enterprise Database Seeding Script for CrediGuide AI
 *
 * Safety & Invariant Guarantees:
 * 1. Fully Idempotent: Can be executed repeatedly without generating duplicate records.
 * 2. Non-Destructive: Uses upsert operations and never executes TRUNCATE, DELETE, or DROP.
 * 3. Synthetic Isolation: Only updates demo applicants matching '@example.com' AND 'demo-app-*'.
 *    Real borrower records are strictly protected from overwrite.
 * 4. Atomic Transaction: Wrapped in a single interactive transaction (all-or-nothing).
 * 5. Audit Counters: Records and displays inserted, updated, and skipped counts.
 * 6. Secret Protection: Never prints connection string passwords to stdout or logs.
 */
export async function seedDatabase(prismaClient?: PrismaClient) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString && !prismaClient) {
    console.error("❌ Cannot seed: DATABASE_URL is not defined in environment.");
    process.exit(1);
  }

  // Safe host & database logging without exposing credentials
  if (connectionString) {
    try {
      const parsedUrl = new URL(connectionString);
      console.log(`🔌 Target Database: ${parsedUrl.pathname.replace("/", "")} on ${parsedUrl.hostname}:${parsedUrl.port}`);
    } catch {
      console.log("🔌 Target Database configured via environment variable.");
    }
  }

  console.log("🌱 Starting enterprise database seeding for CrediGuide AI...\n");
  const pool = prismaClient ? null : new Pool({ connectionString });
  const adapter = pool ? new PrismaPg(pool) : null;
  const prisma = prismaClient || new PrismaClient({ adapter: adapter! });

  const summary = {
    products: { inserted: 0, updated: 0, skipped: 0 },
    rules: { inserted: 0, updated: 0, skipped: 0 },
    documents: { inserted: 0, updated: 0, skipped: 0 },
    applicants: { inserted: 0, updated: 0, skipped: 0 },
  };

  try {
    // Execute all seed operations inside a single atomic Prisma transaction
    await prisma.$transaction(
      async (tx) => {
        // ---------------------------------------------------------------------
        // 1. Seed Loan Product Master Catalog (4 Distinct Products)
        // ---------------------------------------------------------------------
        console.log(`📦 1/4 Seeding ${SYNTHETIC_PRODUCTS.length} loan products...`);
        for (const prod of SYNTHETIC_PRODUCTS) {
          const existing = await tx.loanProduct.findUnique({
            where: { productCode: prod.productCode },
          });

          await tx.loanProduct.upsert({
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

          if (existing) {
            summary.products.updated++;
          } else {
            summary.products.inserted++;
          }
        }
        console.log(`   └─ Products: ${summary.products.inserted} created, ${summary.products.updated} updated.\n`);

        // ---------------------------------------------------------------------
        // 2. Seed Deterministic Eligibility Rules (24 Rules - 6 per Product)
        // ---------------------------------------------------------------------
        console.log(`⚙️  2/4 Seeding ${SYNTHETIC_RULES.length} deterministic eligibility rules...`);
        for (const rule of SYNTHETIC_RULES) {
          const existing = await tx.eligibilityRule.findUnique({
            where: { id: rule.id },
          });

          await tx.eligibilityRule.upsert({
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

          if (existing) {
            summary.rules.updated++;
          } else {
            summary.rules.inserted++;
          }
        }
        console.log(`   └─ Rules: ${summary.rules.inserted} created, ${summary.rules.updated} updated.\n`);

        // ---------------------------------------------------------------------
        // 3. Seed Comprehensive Document Requirements (21 Requirements)
        // ---------------------------------------------------------------------
        console.log(`📄 3/4 Seeding ${SYNTHETIC_DOCUMENTS.length} document requirements...`);
        for (const doc of SYNTHETIC_DOCUMENTS) {
          const existing = await tx.documentRequirement.findUnique({
            where: { id: doc.id },
          });

          await tx.documentRequirement.upsert({
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

          if (existing) {
            summary.documents.updated++;
          } else {
            summary.documents.inserted++;
          }
        }
        console.log(`   └─ Documents: ${summary.documents.inserted} created, ${summary.documents.updated} updated.\n`);

        // ---------------------------------------------------------------------
        // 4. Seed Structured Synthetic Demonstration Applicants (14 Profiles)
        // ---------------------------------------------------------------------
        console.log(`👤 4/4 Seeding ${SYNTHETIC_APPLICANTS.length} synthetic demonstration applicants...`);
        for (const app of SYNTHETIC_APPLICANTS) {
          // Safety Guard: Only proceed if candidate email strictly matches '@example.com'
          if (!app.email.endsWith("@example.com")) {
            console.warn(`   ⚠️ Refusing to seed non-example applicant email: ${app.email}`);
            summary.applicants.skipped++;
            continue;
          }

          const existing = await tx.applicant.findUnique({
            where: { email: app.email },
          });

          // Overwrite Protection Guard:
          // An existing applicant can only be updated if BOTH its ID starts with "demo-app-"
          // AND its email ends with "@example.com". If either is false, skip and protect.
          if (existing) {
            const isDemoRecord = isDemoApplicantRecord(existing);
            if (!isDemoRecord) {
              console.warn(`   ⚠️ Skipped ${app.email}: Protected genuine borrower record detected.`);
              summary.applicants.skipped++;
              continue;
            }
          }

          await tx.applicant.upsert({
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

          if (existing) {
            summary.applicants.updated++;
          } else {
            summary.applicants.inserted++;
          }
        }
        console.log(`   └─ Applicants: ${summary.applicants.inserted} created, ${summary.applicants.updated} updated, ${summary.applicants.skipped} skipped.\n`);
      },
      {
        timeout: 60000, // 60s timeout for complete catalog transaction
      }
    );

    // -------------------------------------------------------------------------
    // Seeding Audit Summary
    // -------------------------------------------------------------------------
    console.log("================================================================================");
    console.log("✅ CrediGuide AI Database Seeding Complete");
    console.log("================================================================================");
    console.log(`  📦 Loan Products:         ${summary.products.inserted} inserted, ${summary.products.updated} updated, ${summary.products.skipped} skipped`);
    console.log(`  ⚙️  Eligibility Rules:     ${summary.rules.inserted} inserted, ${summary.rules.updated} updated, ${summary.rules.skipped} skipped`);
    console.log(`  📄 Document Requirements: ${summary.documents.inserted} inserted, ${summary.documents.updated} updated, ${summary.documents.skipped} skipped`);
    console.log(`  👤 Synthetic Applicants:  ${summary.applicants.inserted} inserted, ${summary.applicants.updated} updated, ${summary.applicants.skipped} skipped`);
    console.log("================================================================================");
    return summary;
  } catch (error) {
    console.error("❌ Error during database seeding:", error);
    throw error;
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

// Direct CLI entrypoint check
if (require.main === module) {
  seedDatabase().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
