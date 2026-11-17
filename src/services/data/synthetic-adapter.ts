import {
  ILoanDataProvider,
  LoanProductData,
  EligibilityRuleData,
  DocumentRequirementData,
  ApplicantRecordData,
  AssessmentRecordData,
} from "./types";
import {
  SYNTHETIC_PRODUCTS,
  SYNTHETIC_RULES,
  SYNTHETIC_DOCUMENTS,
  SYNTHETIC_APPLICANTS,
} from "./synthetic-data";

export class SyntheticLoanDataProvider implements ILoanDataProvider {
  readonly providerName = "SYNTHETIC_IN_MEMORY";

  private products: LoanProductData[] = [...SYNTHETIC_PRODUCTS];
  private rules: EligibilityRuleData[] = [...SYNTHETIC_RULES];
  private documents: DocumentRequirementData[] = [...SYNTHETIC_DOCUMENTS];
  private applicants: ApplicantRecordData[] = [...SYNTHETIC_APPLICANTS];
  private assessments: AssessmentRecordData[] = [];

  async getLoanProducts(): Promise<LoanProductData[]> {
    return this.products.filter((p) => p.isActive);
  }

  async getLoanProductByCode(code: string): Promise<LoanProductData | null> {
    return this.products.find((p) => p.productCode === code) || null;
  }

  async getEligibilityRules(productId: string): Promise<EligibilityRuleData[]> {
    return this.rules.filter((r) => r.productId === productId && r.isActive);
  }

  async getDocumentRequirements(productId: string): Promise<DocumentRequirementData[]> {
    return this.documents.filter((d) => d.productId === productId);
  }

  async getApplicantById(id: string): Promise<ApplicantRecordData | null> {
    return this.applicants.find((a) => a.id === id) || null;
  }

  async getApplicantByEmail(email: string): Promise<ApplicantRecordData | null> {
    return this.applicants.find((a) => a.email.toLowerCase() === email.toLowerCase()) || null;
  }

  async saveApplicant(
    data: Omit<ApplicantRecordData, "id"> & { id?: string }
  ): Promise<ApplicantRecordData> {
    const existingIndex = data.id
      ? this.applicants.findIndex((a) => a.id === data.id)
      : this.applicants.findIndex((a) => a.email.toLowerCase() === data.email.toLowerCase());

    const record: ApplicantRecordData = {
      ...data,
      id: data.id || `app-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    };

    if (existingIndex >= 0) {
      this.applicants[existingIndex] = record;
    } else {
      this.applicants.push(record);
    }
    return record;
  }

  async saveAssessment(data: AssessmentRecordData): Promise<AssessmentRecordData> {
    const saved: AssessmentRecordData = {
      ...data,
      id: data.id || `eval-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    };
    this.assessments.push(saved);
    return saved;
  }
}
