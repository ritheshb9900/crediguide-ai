# TCS Automated Loan Eligibility Chatbot (FinSmart LoanAssist)

A full-stack, enterprise-grade prototype designed for the **TCS Banking Challenge: Automated Loan Eligibility Chatbot**.

---

## 📌 Important Compliance Disclaimer
> **This application performs PRELIMINARY, INDICATIVE eligibility assessments.**  
> It does **NOT** constitute a final loan sanction, loan approval, or binding credit commitment. Real loan disbursement requires physical/digital KYC verification, underwriting risk assessment, and formal sanction letter issuance.

---

## 🏗️ Core Architectural Principle

```
+-------------------------------------------------------------+
|                 USER / APPLICANT INTERFACE                  |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|              CONVERSATIONAL AI LAYER (Gemini API)           |
|  - Natural language dialogue & polite customer engagement   |
|  - Entity extraction (income, existing EMI, age, etc.)      |
|  - Missing parameter identification & conversational nudges |
|  * STRICT RULE: AI NEVER calculates or decides eligibility  |
+-------------------------------------------------------------+
                               | Structured JSON Profile
                               v
+-------------------------------------------------------------+
|            DETERMINISTIC BANKING ENGINE (Backend)           |
|  - Input validation (Zod schemas)                           |
|  - Exact financial calculations:                            |
|      * Reducing-balance EMI formula                         |
|      * Fixed Obligation to Income Ratio (FOIR / DTI)        |
|      * Maximum borrowable headroom                          |
|  - Policy rule validation (Age, Income, CIBIL, FOIR, Exp)   |
|  - Document checklist generation                            |
|  - Auditable criteria-level pass/fail breakdown             |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|               PERSISTENCE & DATA ADAPTER LAYER              |
|  - PostgreSQL with Prisma ORM 7                             |
|  - In-memory synthetic datastore fallback for instant demo   |
|  - Extensible adapter interface for future CSV/Core Banking |
+-------------------------------------------------------------+
```

---

## 📦 Data Models (Prisma Schema)

- **`Applicant`**: Master record containing demographics, employment profile, net income, existing EMIs, and bureau credit score.
- **`LoanProduct`**: Catalog of credit products (e.g., *TCS Prime Salaried*, *TCS Express Flexi*, *TCS Professional Growth*) with ticket size ranges, tenures, and interest rates.
- **`EligibilityRule`**: Deterministic policy rules (e.g., `MIN_AGE`, `MAX_AGE`, `MIN_INCOME`, `MIN_CREDIT_SCORE`, `MAX_FOIR`, `MIN_WORK_EXP`) with evaluation operators and thresholds.
- **`EligibilityAssessment`**: Persisted assessment run recording requested amount, evaluated eligibility status, calculated EMI, FOIR, risk tier, and deterministic rationale.
- **`AssessmentCriterion`**: Itemized audit log of each individual rule evaluated (expected vs. actual value, pass/fail status, and explanation).
- **`DocumentRequirement`**: Mandatory and optional KYC/income proof documents per product and employment type.

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v20.19.0 or higher (v22+ recommended)
- **PostgreSQL**: (Optional for Stage 1 demo, required for full DB persistence)

### 2. Installation
```bash
# Clone or navigate to the repository
cd TCS_Loan_Eligibility_AI

# Install dependencies
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Configure your environment variables in `.env`:
- `DATABASE_URL`: PostgreSQL connection string (e.g., `postgresql://postgres:postgres@localhost:5432/tcs_loan_db?schema=public`)
- `GEMINI_API_KEY`: Google Gemini API key from [Google AI Studio](https://aistudio.google.com/) (required for Stage 3)

*(Note: If `DATABASE_URL` is omitted or points to an offline database during initial inspection, the system automatically falls back to the high-fidelity in-memory synthetic provider so the app remains fully functional).*

### 4. Database Setup & Seeding (When PostgreSQL is available)
```bash
# Push Prisma schema to PostgreSQL
npx prisma db push

# Seed products, policy rules, documents, and test applicants
npm run db:seed
```

### 5. Running the Application
```bash
# Start Next.js development server
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🛠️ Verification & Quality Checks

Run linting:
```bash
npm run lint
```

Run TypeScript compilation check:
```bash
npx tsc --noEmit
```

Run Stage 2 Deterministic Eligibility Engine Tests:
```bash
npm run test:engine
```

Run Stage 3A Mock AI Conversational Extraction Tests:
```bash
npm run test:ai
```

Build production bundle:
```bash
npm run build
```

---

## 📅 Hackathon Implementation Roadmap

- [x] **Stage 1**:
  - Next.js 16 + React 19 + TypeScript + Tailwind CSS setup.
  - Prisma 7 configuration & PostgreSQL schema with all required domain models.
  - Realistic synthetic seed dataset (Loan products, rules, document checklists, applicants).
  - Data-adapter abstraction layer (`ILoanDataProvider`).
  - Professional banking landing page & layout with compliance disclaimers.
  - Verified compilation, lint, and build.
- [x] **Stage 2**:
  - Deterministic Eligibility Engine (`evaluateLoanEligibility()`).
  - Standard financial math: reducing-balance EMI, existing FOIR, total FOIR, capacity headroom.
  - 6 policy criteria checks with 3-state output (`ELIGIBLE`, `CONDITIONAL`, `NOT_ELIGIBLE`).
  - `POST /api/eligibility` endpoint with Zod validation.
  - 5/5 verified deterministic test scenarios.
- [x] **Stage 3A (Current)**:
  - Provider-agnostic `IAIService` interface with `MockAIService` implementation.
  - Offline local deterministic NLP parser (normalizes Lakhs, k, years, employment, EMI).
  - Multi-turn conversation state persistence with missing field resolution.
  - `POST /api/chat` endpoint with Zod request/response validation.
  - 11/11 verified mock AI test scenarios with zero eligibility calculation leakage.
- [ ] **Stage 3B**: Chatbot UI and full interactive end-to-end integration.
- [ ] **Stage 4**: Final verification, report export, and submission package.
