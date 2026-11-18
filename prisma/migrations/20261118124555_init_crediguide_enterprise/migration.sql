-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('LOAN_APPLICANT', 'BANK_OFFICER', 'BANK_ADMIN');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'DOCUMENTS_REQUIRED', 'CONDITIONALLY_ELIGIBLE', 'RECOMMENDED', 'APPROVED', 'REJECTED', 'DISBURSED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('IDENTITY_PROOF', 'ADDRESS_PROOF', 'INCOME_PROOF', 'BANK_STATEMENT', 'EMPLOYMENT_ID', 'COLLATERAL_DEED', 'TAX_RETURN', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReviewStage" AS ENUM ('INITIAL_SCRUTINY', 'DOCUMENT_VERIFICATION', 'CREDIT_APPRAISAL', 'RISK_ASSESSMENT', 'FINAL_APPROVAL');

-- CreateEnum
CREATE TYPE "ReviewRecommendation" AS ENUM ('RECOMMEND_APPROVAL', 'RECOMMEND_REJECTION', 'REQUEST_MORE_INFO', 'ESCALATE_TO_COMMITTEE');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('APPROVED', 'REJECTED', 'DEFERRED', 'PENDING');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'LOAN_APPLICANT',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "officer_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "branchCode" TEXT,
    "designation" TEXT NOT NULL,
    "approvalLimitAmount" DECIMAL(14,2) NOT NULL DEFAULT 500000.00,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "officer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applicants" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "age" INTEGER,
    "employmentType" TEXT NOT NULL,
    "employerName" TEXT,
    "monthlyNetIncome" DECIMAL(14,2) NOT NULL,
    "existingMonthlyEmi" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "creditScore" INTEGER,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "residenceType" TEXT,
    "workExperienceYears" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applicants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_products" (
    "id" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "minAmount" DECIMAL(14,2) NOT NULL,
    "maxAmount" DECIMAL(14,2) NOT NULL,
    "minTenureMonths" INTEGER NOT NULL,
    "maxTenureMonths" INTEGER NOT NULL,
    "minInterestRate" DECIMAL(5,2) NOT NULL,
    "maxInterestRate" DECIMAL(5,2) NOT NULL,
    "processingFeePercentage" DECIMAL(5,2) NOT NULL DEFAULT 1.00,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eligibility_rules" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "thresholdValue" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eligibility_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eligibility_assessments" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT,
    "productId" TEXT NOT NULL,
    "requestedAmount" DECIMAL(14,2) NOT NULL,
    "requestedTenureMonths" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "eligibleAmount" DECIMAL(14,2),
    "indicativeInterestRate" DECIMAL(5,2),
    "indicativeEmi" DECIMAL(14,2),
    "foir" DECIMAL(5,2),
    "confidenceScore" DOUBLE PRECISION,
    "riskTier" TEXT,
    "summary" TEXT NOT NULL,
    "disclaimer" TEXT NOT NULL DEFAULT 'This is a preliminary, indicative loan eligibility assessment and does NOT constitute a formal loan approval, commitment, or credit offer.',
    "source" TEXT NOT NULL DEFAULT 'CHATBOT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eligibility_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_criteria" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "ruleId" TEXT,
    "criterionName" TEXT NOT NULL,
    "criterionCategory" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "actualValue" TEXT NOT NULL,
    "expectedValue" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_requirements" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "employmentType" TEXT DEFAULT 'ALL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_applications" (
    "id" TEXT NOT NULL,
    "applicationNumber" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "assessmentId" TEXT,
    "assignedOfficerId" TEXT,
    "requestedAmount" DECIMAL(14,2) NOT NULL,
    "requestedTenureMonths" INTEGER NOT NULL,
    "purpose" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "submissionDate" TIMESTAMP(3),
    "approvedAmount" DECIMAL(14,2),
    "approvedInterestRate" DECIMAL(5,2),
    "approvedTenureMonths" INTEGER,
    "decisionDate" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploaded_documents" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "requirementId" TEXT,
    "category" "DocumentCategory" NOT NULL DEFAULT 'OTHER',
    "storageKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "fileHash" TEXT,
    "verificationStatus" "DocumentVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedByUserId" TEXT,
    "rejectionReason" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uploaded_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_reviews" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "officerId" TEXT NOT NULL,
    "stage" "ReviewStage" NOT NULL DEFAULT 'INITIAL_SCRUTINY',
    "recommendation" "ReviewRecommendation" NOT NULL,
    "decision" "ReviewDecision" NOT NULL DEFAULT 'PENDING',
    "recommendedAmount" DECIMAL(14,2),
    "recommendedRate" DECIMAL(5,2),
    "recommendedTenure" INTEGER,
    "reviewNotes" TEXT NOT NULL,
    "conditions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_status_history" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fromStatus" "ApplicationStatus" NOT NULL,
    "toStatus" "ApplicationStatus" NOT NULL,
    "changedById" TEXT,
    "changeReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "details" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_isActive_idx" ON "users"("role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "officer_profiles_userId_key" ON "officer_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "officer_profiles_employeeCode_key" ON "officer_profiles"("employeeCode");

-- CreateIndex
CREATE INDEX "officer_profiles_branchCode_idx" ON "officer_profiles"("branchCode");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_tokenHash_key" ON "user_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "user_sessions_userId_idx" ON "user_sessions"("userId");

-- CreateIndex
CREATE INDEX "user_sessions_expiresAt_idx" ON "user_sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_tokenHash_key" ON "email_verification_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "email_verification_tokens_userId_idx" ON "email_verification_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "applicants_userId_key" ON "applicants"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "applicants_email_key" ON "applicants"("email");

-- CreateIndex
CREATE INDEX "applicants_userId_idx" ON "applicants"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "loan_products_productCode_key" ON "loan_products"("productCode");

-- CreateIndex
CREATE INDEX "loan_products_isActive_idx" ON "loan_products"("isActive");

-- CreateIndex
CREATE INDEX "eligibility_rules_productId_idx" ON "eligibility_rules"("productId");

-- CreateIndex
CREATE INDEX "eligibility_rules_ruleCode_idx" ON "eligibility_rules"("ruleCode");

-- CreateIndex
CREATE INDEX "eligibility_assessments_applicantId_idx" ON "eligibility_assessments"("applicantId");

-- CreateIndex
CREATE INDEX "eligibility_assessments_productId_idx" ON "eligibility_assessments"("productId");

-- CreateIndex
CREATE INDEX "eligibility_assessments_status_idx" ON "eligibility_assessments"("status");

-- CreateIndex
CREATE INDEX "assessment_criteria_assessmentId_idx" ON "assessment_criteria"("assessmentId");

-- CreateIndex
CREATE INDEX "assessment_criteria_ruleId_idx" ON "assessment_criteria"("ruleId");

-- CreateIndex
CREATE INDEX "document_requirements_productId_idx" ON "document_requirements"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "loan_applications_applicationNumber_key" ON "loan_applications"("applicationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "loan_applications_assessmentId_key" ON "loan_applications"("assessmentId");

-- CreateIndex
CREATE INDEX "loan_applications_applicantId_status_idx" ON "loan_applications"("applicantId", "status");

-- CreateIndex
CREATE INDEX "loan_applications_assignedOfficerId_status_idx" ON "loan_applications"("assignedOfficerId", "status");

-- CreateIndex
CREATE INDEX "loan_applications_status_idx" ON "loan_applications"("status");

-- CreateIndex
CREATE INDEX "loan_applications_createdAt_idx" ON "loan_applications"("createdAt");

-- CreateIndex
CREATE INDEX "uploaded_documents_applicationId_verificationStatus_idx" ON "uploaded_documents"("applicationId", "verificationStatus");

-- CreateIndex
CREATE INDEX "uploaded_documents_requirementId_idx" ON "uploaded_documents"("requirementId");

-- CreateIndex
CREATE INDEX "application_reviews_applicationId_stage_idx" ON "application_reviews"("applicationId", "stage");

-- CreateIndex
CREATE INDEX "application_reviews_officerId_idx" ON "application_reviews"("officerId");

-- CreateIndex
CREATE INDEX "application_status_history_applicationId_createdAt_idx" ON "application_status_history"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_timestamp_idx" ON "audit_logs"("actorId", "timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- AddForeignKey
ALTER TABLE "officer_profiles" ADD CONSTRAINT "officer_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eligibility_rules" ADD CONSTRAINT "eligibility_rules_productId_fkey" FOREIGN KEY ("productId") REFERENCES "loan_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eligibility_assessments" ADD CONSTRAINT "eligibility_assessments_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "applicants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eligibility_assessments" ADD CONSTRAINT "eligibility_assessments_productId_fkey" FOREIGN KEY ("productId") REFERENCES "loan_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_criteria" ADD CONSTRAINT "assessment_criteria_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "eligibility_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_criteria" ADD CONSTRAINT "assessment_criteria_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "eligibility_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "loan_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "applicants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_productId_fkey" FOREIGN KEY ("productId") REFERENCES "loan_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "eligibility_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_assignedOfficerId_fkey" FOREIGN KEY ("assignedOfficerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_documents" ADD CONSTRAINT "uploaded_documents_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "loan_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_documents" ADD CONSTRAINT "uploaded_documents_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "document_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_documents" ADD CONSTRAINT "uploaded_documents_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_reviews" ADD CONSTRAINT "application_reviews_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "loan_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_reviews" ADD CONSTRAINT "application_reviews_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "loan_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
