import { prisma } from "@/lib/prisma";
import {
  ILoanDataProvider,
  LoanProductData,
  EligibilityRuleData,
  DocumentRequirementData,
  ApplicantRecordData,
  AssessmentRecordData,
} from "./types";
import { SyntheticLoanDataProvider } from "./synthetic-adapter";

export class PrismaLoanDataProvider implements ILoanDataProvider {
  readonly providerName = "POSTGRESQL_PRISMA";
  private fallback = new SyntheticLoanDataProvider();

  async getLoanProducts(): Promise<LoanProductData[]> {
    try {
      const products = await prisma.loanProduct.findMany({
        where: { isActive: true },
        orderBy: { minAmount: "asc" },
      });
      if (products.length > 0) {
        return products.map((p) => ({
          id: p.id,
          productCode: p.productCode,
          name: p.name,
          description: p.description,
          minAmount: p.minAmount,
          maxAmount: p.maxAmount,
          minTenureMonths: p.minTenureMonths,
          maxTenureMonths: p.maxTenureMonths,
          minInterestRate: p.minInterestRate,
          maxInterestRate: p.maxInterestRate,
          processingFeePercentage: p.processingFeePercentage,
          isActive: p.isActive,
        }));
      }
      return this.fallback.getLoanProducts();
    } catch (error) {
      console.warn("⚠️ Prisma DB unavailable, using synthetic catalog:", (error as Error).message);
      return this.fallback.getLoanProducts();
    }
  }

  async getLoanProductByCode(code: string): Promise<LoanProductData | null> {
    try {
      const p = await prisma.loanProduct.findUnique({
        where: { productCode: code },
      });
      if (p) {
        return {
          id: p.id,
          productCode: p.productCode,
          name: p.name,
          description: p.description,
          minAmount: p.minAmount,
          maxAmount: p.maxAmount,
          minTenureMonths: p.minTenureMonths,
          maxTenureMonths: p.maxTenureMonths,
          minInterestRate: p.minInterestRate,
          maxInterestRate: p.maxInterestRate,
          processingFeePercentage: p.processingFeePercentage,
          isActive: p.isActive,
        };
      }
      return this.fallback.getLoanProductByCode(code);
    } catch (error) {
      console.warn("⚠️ Prisma DB unavailable, using synthetic product:", (error as Error).message);
      return this.fallback.getLoanProductByCode(code);
    }
  }

  async getEligibilityRules(productId: string): Promise<EligibilityRuleData[]> {
    try {
      const rules = await prisma.eligibilityRule.findMany({
        where: { productId, isActive: true },
        orderBy: { weight: "desc" },
      });
      if (rules.length > 0) {
        return rules.map((r) => ({
          id: r.id,
          productId: r.productId,
          ruleCode: r.ruleCode,
          name: r.name,
          description: r.description,
          category: r.category,
          operator: r.operator,
          thresholdValue: r.thresholdValue,
          weight: r.weight,
          isMandatory: r.isMandatory,
          errorMessage: r.errorMessage,
          isActive: r.isActive,
        }));
      }
      return this.fallback.getEligibilityRules(productId);
    } catch (error) {
      console.warn("⚠️ Prisma DB unavailable, using synthetic rules:", (error as Error).message);
      return this.fallback.getEligibilityRules(productId);
    }
  }

  async getDocumentRequirements(productId: string): Promise<DocumentRequirementData[]> {
    try {
      const docs = await prisma.documentRequirement.findMany({
        where: { productId },
      });
      if (docs.length > 0) {
        return docs.map((d) => ({
          id: d.id,
          productId: d.productId,
          documentType: d.documentType,
          name: d.name,
          description: d.description,
          isMandatory: d.isMandatory,
          employmentType: d.employmentType,
        }));
      }
      return this.fallback.getDocumentRequirements(productId);
    } catch (error) {
      console.warn("⚠️ Prisma DB unavailable, using synthetic documents:", (error as Error).message);
      return this.fallback.getDocumentRequirements(productId);
    }
  }

  async getApplicantById(id: string): Promise<ApplicantRecordData | null> {
    try {
      const a = await prisma.applicant.findUnique({
        where: { id },
      });
      if (a) {
        return {
          id: a.id,
          firstName: a.firstName,
          lastName: a.lastName,
          email: a.email,
          phone: a.phone,
          age: a.age,
          employmentType: a.employmentType,
          employerName: a.employerName,
          monthlyNetIncome: a.monthlyNetIncome,
          existingMonthlyEmi: a.existingMonthlyEmi,
          creditScore: a.creditScore,
          city: a.city,
          state: a.state,
          pincode: a.pincode,
          residenceType: a.residenceType,
          workExperienceYears: a.workExperienceYears,
        };
      }
      return this.fallback.getApplicantById(id);
    } catch (error) {
      console.warn("⚠️ Prisma DB unavailable, using synthetic applicant:", (error as Error).message);
      return this.fallback.getApplicantById(id);
    }
  }

  async getApplicantByEmail(email: string): Promise<ApplicantRecordData | null> {
    try {
      const a = await prisma.applicant.findUnique({
        where: { email },
      });
      if (a) {
        return {
          id: a.id,
          firstName: a.firstName,
          lastName: a.lastName,
          email: a.email,
          phone: a.phone,
          age: a.age,
          employmentType: a.employmentType,
          employerName: a.employerName,
          monthlyNetIncome: a.monthlyNetIncome,
          existingMonthlyEmi: a.existingMonthlyEmi,
          creditScore: a.creditScore,
          city: a.city,
          state: a.state,
          pincode: a.pincode,
          residenceType: a.residenceType,
          workExperienceYears: a.workExperienceYears,
        };
      }
      return this.fallback.getApplicantByEmail(email);
    } catch (error) {
      console.warn("⚠️ Prisma DB unavailable, using synthetic applicant:", (error as Error).message);
      return this.fallback.getApplicantByEmail(email);
    }
  }

  async saveApplicant(
    data: Omit<ApplicantRecordData, "id"> & { id?: string }
  ): Promise<ApplicantRecordData> {
    try {
      const upserted = await prisma.applicant.upsert({
        where: { email: data.email },
        update: {
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          age: data.age,
          employmentType: data.employmentType,
          employerName: data.employerName,
          monthlyNetIncome: data.monthlyNetIncome,
          existingMonthlyEmi: data.existingMonthlyEmi,
          creditScore: data.creditScore,
          city: data.city,
          state: data.state,
          pincode: data.pincode,
          residenceType: data.residenceType,
          workExperienceYears: data.workExperienceYears,
        },
        create: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
          age: data.age,
          employmentType: data.employmentType,
          employerName: data.employerName,
          monthlyNetIncome: data.monthlyNetIncome,
          existingMonthlyEmi: data.existingMonthlyEmi,
          creditScore: data.creditScore,
          city: data.city,
          state: data.state,
          pincode: data.pincode,
          residenceType: data.residenceType,
          workExperienceYears: data.workExperienceYears,
        },
      });

      return {
        id: upserted.id,
        firstName: upserted.firstName,
        lastName: upserted.lastName,
        email: upserted.email,
        phone: upserted.phone,
        age: upserted.age,
        employmentType: upserted.employmentType,
        employerName: upserted.employerName,
        monthlyNetIncome: upserted.monthlyNetIncome,
        existingMonthlyEmi: upserted.existingMonthlyEmi,
        creditScore: upserted.creditScore,
        city: upserted.city,
        state: upserted.state,
        pincode: upserted.pincode,
        residenceType: upserted.residenceType,
        workExperienceYears: upserted.workExperienceYears,
      };
    } catch (error) {
      console.warn("⚠️ Prisma DB unavailable, saving applicant to synthetic store:", (error as Error).message);
      return this.fallback.saveApplicant(data);
    }
  }

  async saveAssessment(data: AssessmentRecordData): Promise<AssessmentRecordData> {
    try {
      const created = await prisma.eligibilityAssessment.create({
        data: {
          applicantId: data.applicantId || null,
          productId: data.productId,
          requestedAmount: data.requestedAmount,
          requestedTenureMonths: data.requestedTenureMonths,
          status: data.status,
          eligibleAmount: data.eligibleAmount || null,
          indicativeInterestRate: data.indicativeInterestRate || null,
          indicativeEmi: data.indicativeEmi || null,
          foir: data.foir || null,
          confidenceScore: data.confidenceScore || null,
          riskTier: data.riskTier || null,
          summary: data.summary,
          disclaimer: data.disclaimer,
          source: data.source,
          criteria: data.criteria
            ? {
                create: data.criteria.map((c) => ({
                  criterionName: c.criterionName,
                  criterionCategory: c.criterionCategory,
                  passed: c.passed,
                  actualValue: c.actualValue,
                  expectedValue: c.expectedValue,
                  explanation: c.explanation,
                  isMandatory: c.isMandatory,
                })),
              }
            : undefined,
        },
        include: {
          criteria: true,
        },
      });

      return {
        id: created.id,
        applicantId: created.applicantId,
        productId: created.productId,
        requestedAmount: created.requestedAmount,
        requestedTenureMonths: created.requestedTenureMonths,
        status: created.status,
        eligibleAmount: created.eligibleAmount,
        indicativeInterestRate: created.indicativeInterestRate,
        indicativeEmi: created.indicativeEmi,
        foir: created.foir,
        confidenceScore: created.confidenceScore,
        riskTier: created.riskTier,
        summary: created.summary,
        disclaimer: created.disclaimer,
        source: created.source,
        criteria: created.criteria.map((c) => ({
          criterionName: c.criterionName,
          criterionCategory: c.criterionCategory,
          passed: c.passed,
          actualValue: c.actualValue,
          expectedValue: c.expectedValue,
          explanation: c.explanation,
          isMandatory: c.isMandatory,
        })),
      };
    } catch (error) {
      console.warn("⚠️ Prisma DB unavailable, saving assessment to synthetic store:", (error as Error).message);
      return this.fallback.saveAssessment(data);
    }
  }
}
