export interface LoanProductData {
  id: string;
  productCode: string;
  name: string;
  description: string;
  minAmount: number;
  maxAmount: number;
  minTenureMonths: number;
  maxTenureMonths: number;
  minInterestRate: number;
  maxInterestRate: number;
  processingFeePercentage: number;
  isActive: boolean;
}

export interface EligibilityRuleData {
  id: string;
  productId: string;
  ruleCode: string;
  name: string;
  description: string;
  category: string;
  operator: string;
  thresholdValue: string;
  weight: number;
  isMandatory: boolean;
  errorMessage: string;
  isActive: boolean;
}

export interface DocumentRequirementData {
  id: string;
  productId: string;
  documentType: string;
  name: string;
  description: string;
  isMandatory: boolean;
  employmentType: string | null;
}

export interface ApplicantRecordData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  age?: number | null;
  employmentType: string;
  employerName?: string | null;
  monthlyNetIncome: number;
  existingMonthlyEmi: number;
  creditScore?: number | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  residenceType?: string | null;
  workExperienceYears?: number | null;
}

export interface AssessmentRecordData {
  id?: string;
  applicantId?: string | null;
  productId: string;
  requestedAmount: number;
  requestedTenureMonths: number;
  status: string;
  eligibleAmount?: number | null;
  indicativeInterestRate?: number | null;
  indicativeEmi?: number | null;
  foir?: number | null;
  confidenceScore?: number | null;
  riskTier?: string | null;
  summary: string;
  disclaimer: string;
  source: string;
  criteria?: {
    criterionName: string;
    criterionCategory: string;
    passed: boolean;
    actualValue: string;
    expectedValue: string;
    explanation: string;
    isMandatory: boolean;
  }[];
}

/**
 * Data Adapter Interface
 * Allows seamless switching between:
 * - PostgreSQL via Prisma
 * - In-memory Synthetic Datastore (for hackathon offline execution)
 * - Future CSV bulk imports
 * - Future Core Banking REST APIs / LOS integrations
 */
export interface ILoanDataProvider {
  readonly providerName: string;

  getLoanProducts(): Promise<LoanProductData[]>;
  getLoanProductByCode(code: string): Promise<LoanProductData | null>;
  getEligibilityRules(productId: string): Promise<EligibilityRuleData[]>;
  getDocumentRequirements(productId: string): Promise<DocumentRequirementData[]>;
  getApplicantById(id: string): Promise<ApplicantRecordData | null>;
  getApplicantByEmail(email: string): Promise<ApplicantRecordData | null>;
  saveApplicant(data: Omit<ApplicantRecordData, "id"> & { id?: string }): Promise<ApplicantRecordData>;
  saveAssessment(data: AssessmentRecordData): Promise<AssessmentRecordData>;
}
