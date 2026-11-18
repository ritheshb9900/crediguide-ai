# CrediGuide AI — Autonomous Lending Intelligence & Policy Governance

[![Node.js Version](https://img.shields.io/badge/Node.js-v20%2B%20%7C%20v22%20LTS-brightgreen)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.3.6-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.8-blue)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7.10.0-indigo)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-blue)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

An enterprise-grade, full-stack personal loan origination and preliminary eligibility assessment platform. CrediGuide AI couples conversational natural language customer engagement with an isolated, deterministic banking calculations and policy engine, backed by an enterprise PostgreSQL schema managed through Prisma 7.

---

## Table of Contents

- [1. Important Regulatory and Compliance Disclaimer](#1-important-regulatory-and-compliance-disclaimer)
- [2. Project Overview](#2-project-overview)
- [3. Key Features](#3-key-features)
  - [3.1 Implemented & Verified Functionality](#31-implemented--verified-functionality)
  - [3.2 Planned & In-Progress Functionality](#32-planned--in-progress-functionality)
- [4. Architectural Design Principle](#4-architectural-design-principle)
- [5. System Architecture](#5-system-architecture)
- [6. Technology Stack](#6-technology-stack)
- [7. User Roles & Authorization Model](#7-user-roles--authorization-model)
- [8. Deterministic Loan Eligibility Engine](#8-deterministic-loan-eligibility-engine)
  - [8.1 Core Financial Mathematics](#81-core-financial-mathematics)
  - [8.2 Evaluated Policy Criteria](#82-evaluated-policy-criteria)
  - [8.3 Decision Outcomes](#83-decision-outcomes)
- [9. Database Architecture](#9-database-architecture)
  - [9.1 Schema Domains](#91-schema-domains)
  - [9.2 Implemented Prisma Models](#92-implemented-prisma-models)
- [10. Project Directory Structure](#10-project-directory-structure)
- [11. Installation and Local Setup](#11-installation-and-local-setup)
  - [11.1 Prerequisites](#111-prerequisites)
  - [11.2 Clone and Install](#112-clone-and-install)
  - [11.3 Environment Configuration](#113-environment-configuration)
  - [11.4 Database Setup & Migration](#114-database-setup--migration)
  - [11.5 Seeding Demonstration Data](#115-seeding-demonstration-data)
- [12. Running the Application](#12-running-the-application)
- [13. Testing and Verification](#13-testing-and-verification)
- [14. Security, Compliance, and Data Privacy](#14-security-compliance-and-data-privacy)
- [15. Implementation Status and Roadmap](#15-implementation-status-and-roadmap)
- [16. General Disclaimer](#16-general-disclaimer)

---

## 1. Important Regulatory and Compliance Disclaimer

> [!IMPORTANT]
> **PRELIMINARY, INDICATIVE ASSESSMENT ONLY**  
> CrediGuide AI conducts preliminary, indicative loan eligibility assessments based solely on applicant-declared financial information and pre-configured policy rules.  
> 
> - This platform **DOES NOT** issue final credit approvals, loan commitments, or binding sanction letters.
> - Final loan approval and fund disbursement strictly require independent Know Your Customer (KYC) verification, bank statement analysis, credit bureau score pulls, document verification, and formal credit appraisal conducted by authorized human banking officers.
> - CrediGuide AI is an independent software prototype and technology demonstration. It is not affiliated with, endorsed by, or operated on behalf of any commercial bank, non-banking financial company (NBFC), or regulatory body.

---

## 2. Project Overview

Retail lending workflows frequently suffer from a fundamental friction: prospective borrowers struggle through complex, opaque eligibility questionnaires, while credit underwriters spend extensive manual effort screening applicants who fail basic lending criteria. Conversely, conventional generative AI chatbots deployed in financial contexts introduce unacceptable risks of mathematical hallucination, arbitrary interest rate quotes, and regulatory non-compliance.

**CrediGuide AI** resolves this dichotomy by establishing a strict architectural separation:

1. **Conversational Front-End:** Uses natural language processing to greet borrowers, extract demographic and financial data points conversationally, guide users through missing parameters, and explain outcomes politely.
2. **Deterministic Banking Engine:** Completely isolated from generative AI inference. All financial mathematics (reducing-balance EMI calculations, debt-to-income/FOIR ratios, borrowing headroom) and policy evaluations (age boundaries, minimum income limits, bureau thresholds) are calculated deterministically using auditable, pure mathematical functions.
3. **Enterprise Data Persistence:** Built upon PostgreSQL 18 and Prisma 7, featuring a 16-model schema designed for banking-grade auditability, strict foreign-key integrity, and role-based access control.

---

## 3. Key Features

### 3.1 Implemented & Verified Functionality

- **Conversational Loan Assistant:**
  - Multi-turn interactive dialogue with conversational guidance.
  - Natural language extraction of declared monthly income, existing EMIs, age, employer, employment type, loan amount, and tenure.
  - Contextual normalization for Indian numbering systems (e.g., "5 Lakhs", "50k", "1.2L").
  - Real-time progress panel tracking captured loan assessment parameters.
- **Deterministic Loan Eligibility Engine:**
  - Standard reducing-balance EMI amortization formula.
  - Fixed Obligation to Income Ratio (FOIR / DTI) calculation.
  - Maximum borrowing headroom calculation based on allowable repayment capacity.
  - Policy rule evaluation against product-specific limits (Age, Income, FOIR, Credit Score, Tenure, Employment Type).
  - Four distinct eligibility outcomes: `ELIGIBLE`, `CONDITIONAL`, `NOT_ELIGIBLE`, and `requiresMoreInformation`.
  - Itemized criteria-level breakdown with explicit pass/fail explanations.
  - Tailored document requirement checklist generation based on employment category (Salaried vs. Self-Employed).
- **Loan Product Catalog:**
  - Four pre-configured loan products seeded in PostgreSQL:
    1. *Standard Personal Loan (`PL_STANDARD`)*
    2. *Prime Salaried Personal Loan (`PL_PRIME_SALARIED`)*
    3. *Express Flexi Credit Line (`PL_EXPRESS_FLEXI`)*
    4. *Professional & Business Growth Loan (`PL_PROFESSIONAL_GROWTH`)*
- **Interactive Web Interface:**
  - Responsive web portal built with Next.js 16 (App Router), React 19, and Tailwind CSS.
  - Interactive chat interface (`#chat-assistant`) with message history and quick prompts.
  - Scenario Explorer with pre-configured demographic profiles for rapid testing.
  - Loan product comparison catalog cards (`#products`).
  - Interactive formula breakdown and verified test-bench display.
- **Enterprise Database Layer (Prisma 7 + PostgreSQL 18):**
  - Production-ready 16-model schema with 7 native PostgreSQL enums.
  - Dual-provider data adapter pattern (`ILoanDataProvider`): PostgreSQL via `@prisma/adapter-pg` or zero-dependency in-memory synthetic provider fallback.
  - Seed system populating 63 verified records (4 products, 24 rules, 21 document requirements, 14 synthetic applicants).
  - Synthetic data safety guards preventing real user data from overwriting demonstration profiles.
- **Comprehensive Automated Test Suites:**
  - Over 250 unit, integration, and scenario tests covering financial mathematics, policy engine logic, conversational NLP extraction, and database seeding integrity.

### 3.2 Planned & In-Progress Functionality

- **Enterprise Authentication & RBAC (Phase 4):**
  - Argon2id password hashing via `@node-rs/argon2`.
  - Database-backed session management with SHA-256 hashed session secrets (`UserSession`).
  - Next.js 16 early-routing gatekeeper (`src/proxy.ts`).
  - Dedicated authentication pages (`/auth/login`, `/auth/register`, `/auth/forgot-password`).
  - *Current Status:* Database models are migrated and ready; auth service implementation is planned in Phase 4.
- **Underwriting & Officer Review Workflows (Phase 5):**
  - Loan application origination pipeline (`LoanApplication`).
  - Secure document upload and verification tracking (`UploadedDocument`).
  - Credit officer review stages, recommendations, and committee approval workflows (`ApplicationReview`).
  - Immutable status change history (`ApplicationStatusHistory`) and system audit logging (`AuditLog`).
  - *Current Status:* Database models and tables are provisioned; UI dashboards are planned in Phase 5.
- **Live Google Gemini API Integration:**
  - Direct integration with Google Gemini models via `@google/genai` (architecture provisioned via `AI_PROVIDER="gemini"`; currently running local deterministic mock extractor).

---

## 4. Architectural Design Principle

The core principle governing CrediGuide AI is **strict separation between language understanding and financial decisioning**:

```
+-------------------------------------------------------------+
|                 APPLICANT / USER INTERFACE                  |
|          (Next.js 16 App Router + React 19 UI)              |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|              CONVERSATIONAL AI LAYER (IAIService)           |
|  - Dialogue management and user engagement                  |
|  - Unstructured entity extraction (Income, Age, EMIs)       |
|  - Missing parameter identification & prompts               |
|  * STRICT MANDATE: AI NEVER computes or decides eligibility |
+-------------------------------------------------------------+
                               | Validated JSON Financial Profile
                               v
+-------------------------------------------------------------+
|          DETERMINISTIC BANKING ENGINE (Backend)             |
|  - Strict Zod schema input validation                       |
|  - Reducing-balance EMI amortization formula                |
|  - Exact FOIR (Debt-to-Income) calculations                 |
|  - Maximum borrowing headroom and capacity capping          |
|  - Product policy rule evaluation (Age, CIBIL, Income)      |
|  - Itemized criteria pass/fail audit generation             |
|  - Document checklist generation                            |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|               PERSISTENCE & DATA ADAPTER LAYER              |
|  - PostgreSQL 18 with Prisma 7 (@prisma/adapter-pg)         |
|  - In-Memory Synthetic Datastore fallback                   |
|  - Extensible ILoanDataProvider abstraction                 |
+-------------------------------------------------------------+
```

---

## 5. System Architecture

The following diagram details the runtime data flow across the presentation, application, calculation, and database tiers:

```mermaid
flowchart TD
    subgraph ClientTier["Presentation Tier (Client)"]
        UI["Web Portal (Next.js 16 / React 19)"]
        ChatUI["Interactive Chat Assistant"]
        CatalogUI["Product Showcase & Calculator"]
    end

    subgraph APITier["Application & API Tier"]
        ChatRoute["POST /api/chat"]
        EligRoute["POST /api/eligibility"]
        Orchestrator["Chat Orchestration Service"]
    end

    subgraph AITier["Conversational Intelligence Layer"]
        AIService["IAIService Interface"]
        MockAI["Deterministic MockAIService (Active Offline)"]
        GeminiAPI["Google Gemini API (Configurable)"]
    end

    subgraph EngineTier["Deterministic Banking & Policy Engine"]
        ZodValidator["Zod Schema Validation"]
        FinancialMath["Financial Math Core\n(Reducing-Balance EMI, FOIR, Headroom)"]
        PolicyEvaluator["Policy Rule Evaluator\n(Age, Income, Credit Score, FOIR, Tenure)"]
        DocGenerator["Document Requirement Generator"]
    end

    subgraph DataTier["Data & Persistence Tier"]
        DataProvider["ILoanDataProvider Interface"]
        PrismaAdapter["PrismaLoanDataProvider\n(@prisma/adapter-pg)"]
        SyntheticAdapter["SyntheticLoanDataProvider\n(In-Memory Fallback)"]
        PostgresDB[("PostgreSQL 18 Database\n(crediguide_db)")]
    end

    UI --> ChatRoute
    UI --> EligRoute
    ChatRoute --> Orchestrator
    Orchestrator --> AIService
    AIService --> MockAI
    AIService -.-> GeminiAPI
    Orchestrator --"Extracted Profile"--> ZodValidator
    EligRoute --> ZodValidator
    ZodValidator --> FinancialMath
    FinancialMath --> PolicyEvaluator
    PolicyEvaluator --> DocGenerator
    PolicyEvaluator <--> DataProvider
    DataProvider --> PrismaAdapter
    DataProvider --> SyntheticAdapter
    PrismaAdapter --> PostgresDB
```

---

## 6. Technology Stack

### Core Frameworks & Runtimes
- **Runtime Environment:** [Node.js](https://nodejs.org/) (v20.19.0+ / v22 LTS recommended)
- **Application Framework:** [Next.js](https://nextjs.org/) `16.3.6` (App Router architecture)
- **User Interface Library:** [React](https://react.dev/) `19.2.8`
- **Programming Language:** [TypeScript](https://www.typescriptlang.org/) `5.x`

### Database & Persistence
- **Database Engine:** [PostgreSQL](https://www.postgresql.org/) 18.x
- **Object-Relational Mapping (ORM):** [Prisma ORM](https://www.prisma.io/) `7.10.0`
- **Prisma Driver Adapter:** `@prisma/adapter-pg` `^7.10.0` with `pg` `^8.23.0` connection pool

### Validation & Cryptography
- **Schema Validation:** [Zod](https://zod.dev/) `^4.6.5` (strict runtime type assertions)
- **Entropy & Hashing:** Built-in Node.js `node:crypto` (SHA-256 session digests, secure random bytes)

### Styling & Design System
- **CSS Framework:** [Tailwind CSS](https://tailwindcss.com/) `4.x` with `@tailwindcss/postcss`
- **Component Utilities:** `clsx`, `tailwind-merge`, `class-variance-authority`
- **Icons:** [Lucide React](https://lucide.dev/) `^1.48.0`

### Tooling & Quality Assurance
- **TypeScript Execution:** [tsx](https://github.com/privatenumber/tsx) `^4.23.15`
- **Linting:** ESLint 9 (`eslint-config-next`)

---

## 7. User Roles & Authorization Model

CrediGuide AI defines three distinct user roles governed by the `UserRole` PostgreSQL enum:

| User Role | Description | Implemented & Planned Responsibilities |
| :--- | :--- | :--- |
| **`LOAN_APPLICANT`** | Borrowers seeking loan eligibility and applying for personal credit. | - Engage with conversational loan assistant.<br>- Declare demographics, financial details, and loan parameters.<br>- Review deterministic preliminary eligibility reports.<br>- Access only their own profile and loan applications (Planned Phase 4/5). |
| **`BANK_OFFICER`** | Credit officers and underwriters responsible for evaluating loan applications. | - Review submitted loan applications across review stages (Planned Phase 5).<br>- Verify uploaded identity, income, and bank statement proofs.<br>- Record structured review recommendations (`RECOMMEND_APPROVAL`, `RECOMMEND_REJECTION`).<br>- Strictly barred from modifying system-wide products or policies. |
| **`BANK_ADMIN`** | System administrators and lending policy governors. | - Configure loan products, ticket size boundaries, and interest rate brackets.<br>- Author and tune deterministic eligibility rules and thresholds.<br>- Provision and deactivate bank officer profiles (Planned Phase 4).<br>- Access immutable system audit trails and compliance logs. |

---

## 8. Deterministic Loan Eligibility Engine

### 8.1 Core Financial Mathematics

The calculation engine implements standard Indian retail banking formulas without reliance on floating-point approximations:

#### 1. Reducing-Balance EMI Amortization
$$\text{EMI} = \frac{P \times r \times (1 + r)^N}{(1 + r)^N - 1}$$
Where:
- $P$ = Loan principal amount in INR.
- $r$ = Monthly interest rate ($\frac{\text{Annual Rate}}{12 \times 100}$).
- $N$ = Loan tenure in months.

#### 2. Fixed Obligation to Income Ratio (FOIR / DTI)
$$\text{Existing FOIR (\%)} = \left(\frac{\text{Existing Monthly EMIs}}{\text{Declared Monthly Net Income}}\right) \times 100$$
$$\text{Total Projected FOIR (\%)} = \left(\frac{\text{Existing EMIs} + \text{Proposed Loan EMI}}{\text{Declared Monthly Net Income}}\right) \times 100$$

#### 3. Maximum Borrowing Headroom (Capacity)
$$\text{Max Allowable Monthly EMI} = (\text{Monthly Net Income} \times \text{FOIR Benchmark}) - \text{Existing EMIs}$$
$$\text{Max Eligible Loan Amount} = \text{Present Value of Max Allowable EMI amortized over tenure at product interest rate}$$

### 8.2 Evaluated Policy Criteria

Every preliminary assessment dynamically evaluates product-specific rules against six core criteria:

1. **Age Requirement:** Validates that applicant age falls within product limits (e.g., 21 to 60 years).
2. **Monthly Net Income:** Validates minimum income threshold (e.g., $\ge ₹30,000$ for standard loans; $\ge ₹50,000$ for prime salaried).
3. **Debt Burden (FOIR):** Verifies that total projected obligations do not breach policy ceilings (typically $50.00\%$).
4. **Credit Bureau Score (CIBIL):** Checks that bureau score satisfies minimum product thresholds (e.g., $\ge 650$ or $\ge 700$).
5. **Requested Loan Tenure:** Verifies tenure falls within allowable boundaries (e.g., 12 to 60 months).
6. **Repayment Capacity Headroom:** Evaluates if allowable EMI headroom supports the full requested loan amount.

### 8.3 Decision Outcomes

- **`ELIGIBLE`:** All policy rules pass and debt burden remains within the allowable FOIR ceiling.
- **`CONDITIONAL`:** Basic eligibility checks pass, but the requested loan amount exceeds borrowable headroom. The engine computes and returns a capped maximum eligible loan amount.
- **`NOT_ELIGIBLE`:** One or more mandatory policy rules fail (e.g., sub-threshold income, underage/overage, or excessive debt burden).
- **`requiresMoreInformation`:** Set when critical underwriting variables (such as credit bureau score) are unprovided, guiding the applicant toward verification.

---

## 9. Database Architecture

The enterprise database architecture is implemented in PostgreSQL 18 and managed via Prisma 7.

### 9.1 Schema Domains

The 16 models are partitioned into three functional domains:

1. **Identity, Authentication & Security:** User accounts, officer profiles, hashed sessions, password reset tokens, and email verification tokens.
2. **Core Lending, Products & Deterministic Eligibility:** Master borrower profiles, loan product catalog, configurable eligibility rules, document requirements, and itemized assessment audit logs.
3. **Application Lifecycle, Underwriting & Auditing:** Originated loan applications, uploaded documents with integrity hashes, multi-stage officer reviews, application status transition history, and audit logging.

### 9.2 Implemented Prisma Models

| Domain | Prisma Model | Table Name | Key Purpose & Attributes |
| :--- | :--- | :--- | :--- |
| **Identity & Security** | `User` | `users` | Master authentication identity; stores role, status, and lockout flags. |
| | `OfficerProfile` | `officer_profiles` | Lending officer metadata, department, designation, and approval limits. |
| | `UserSession` | `user_sessions` | Database-backed sessions storing SHA-256 hashed session tokens. |
| | `PasswordResetToken` | `password_reset_tokens` | Secure, time-bound, one-time hashed password recovery tokens. |
| | `EmailVerificationToken` | `email_verification_tokens` | Secure tokens for email address verification. |
| **Core Lending** | `Applicant` | `applicants` | Borrower demographic, employment, income, EMI, and credit score records. |
| | `LoanProduct` | `loan_products` | Product catalog with ticket sizes, tenures, rates, and fees. |
| | `EligibilityRule` | `eligibility_rules` | Configurable policy rules, operators, thresholds, and error messages. |
| | `DocumentRequirement` | `document_requirements` | Mandatory and optional document lists by product and employment type. |
| | `EligibilityAssessment` | `eligibility_assessments` | Persisted assessment runs with calculated metrics, FOIR, and risk tier. |
| | `AssessmentCriterion` | `assessment_criteria` | Itemized audit log of each evaluated rule (expected vs. actual value, pass/fail). |
| **Lifecycle & Audit** | `LoanApplication` | `loan_applications` | Originated application tracking (`DRAFT`, `SUBMITTED`, `APPROVED`, etc.). |
| | `UploadedDocument` | `uploaded_documents` | File storage references with verification status and SHA-256 checksums. |
| | `ApplicationReview` | `application_reviews` | Credit officer stage reviews, recommendations, and decisions. |
| | `ApplicationStatusHistory`| `application_status_history`| Immutable append-only audit trail of application state changes. |
| | `AuditLog` | `audit_logs` | Comprehensive security and administrative action audit logs. |

---

## 10. Project Directory Structure

```
crediguide-ai/
├── prisma/
│   ├── migrations/                  # Versioned PostgreSQL migration SQL
│   ├── schema.prisma                # Enterprise 16-model Prisma schema
│   └── seed.ts                      # Idempotent database seeder with synthetic safeguards
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat/route.ts        # POST /api/chat (Conversational AI orchestrator)
│   │   │   └── eligibility/route.ts # POST /api/eligibility (Deterministic policy engine)
│   │   ├── favicon.ico
│   │   ├── globals.css              # Tailwind CSS styling
│   │   ├── layout.tsx               # Root layout with compliance headers
│   │   └── page.tsx                 # Homepage, chat interface, and product showcase
│   ├── components/
│   │   ├── chat/
│   │   │   ├── assessment-result-card.tsx # Visual loan decision card & criteria breakdown
│   │   │   ├── chat-interface.tsx         # Main conversational UI component
│   │   │   ├── message-bubble.tsx         # Chat message renderer
│   │   │   ├── progress-panel.tsx         # Real-time applicant data extraction tracker
│   │   │   └── scenario-explorer.tsx      # Pre-configured test scenario quick-loader
│   │   ├── layout/
│   │   │   ├── disclaimer-banner.tsx      # Regulatory compliance warning banner
│   │   │   ├── footer.tsx                 # Enterprise footer
│   │   │   └── header.tsx                 # Navigation header
│   │   └── ui/                            # Reusable UI primitives (Button, Card, Badge)
│   ├── generated/
│   │   └── prisma/                  # Generated type-safe Prisma 7 Client
│   ├── lib/
│   │   ├── financial.ts             # Financial utility functions
│   │   ├── prisma.ts                # PrismaClient singleton with @prisma/adapter-pg
│   │   └── utils.ts                 # Formatting utilities (INR currency, percentages)
│   ├── services/
│   │   ├── ai/                      # AI conversational extraction (Mock & Gemini interfaces)
│   │   ├── data/                    # Data providers (PostgreSQL adapter & Synthetic fallback)
│   │   ├── eligibility/             # Deterministic financial math & rule evaluation engine
│   │   └── orchestration/           # End-to-end conversational assessment workflow
│   └── types/
│       └── domain.ts                # Domain models, Zod validation schemas, and enums
├── tests/
│   ├── api-route.test.ts            # Integration test for /api/eligibility
│   ├── chat-route.test.ts           # Multi-turn conversational flow tests
│   ├── deterministic-engine.test.ts # Core eligibility engine unit tests
│   ├── financial.test.ts            # Financial math boundary tests
│   ├── mock-ai.test.ts              # Natural language parsing and entity extraction tests
│   └── seed-data.test.ts            # 259-test suite for seed data and policy outcomes
├── .env.example                     # Sanitized environment variable template
├── package.json                     # Project scripts and dependencies
├── prisma.config.ts                 # Prisma 7 CLI configuration
└── tsconfig.json                    # TypeScript configuration
```

---

## 11. Installation and Local Setup

### 11.1 Prerequisites
- **Node.js**: v20.19.0 or higher (v22 LTS recommended)
- **npm**: v10+ (bundled with Node.js)
- **PostgreSQL**: v16+ (v18 recommended; required for full database persistence)

> [!NOTE]
> If a live PostgreSQL database is not configured, CrediGuide AI automatically falls back to its built-in in-memory synthetic provider, allowing full evaluation of conversational and calculation features without external dependencies.

### 11.2 Clone and Install

```bash
# Clone the repository
git clone https://github.com/ritheshb9900/crediguide-ai.git

# Navigate into the project directory
cd crediguide-ai

# Install dependencies
npm install
```

### 11.3 Environment Configuration

Copy the example configuration file:

```bash
cp .env.example .env
```

Configure the environment variables in `.env`:

```env
# PostgreSQL Connection URL
# Replace credentials, host, port, and database name with your local PostgreSQL settings
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crediguide_db?schema=public"

# AI Provider Configuration ('mock' for offline execution; 'gemini' for future live API)
AI_PROVIDER="mock"
MOCK_AI_TOKEN="mock-local-token"

# Optional: Google Gemini API Key (Required only if AI_PROVIDER="gemini")
GEMINI_API_KEY=""

# Application URL
NEXT_PUBLIC_APP_NAME="CrediGuide AI - Autonomous Lending Intelligence Platform"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 11.4 Database Setup & Migration

When connecting to an active PostgreSQL instance:

```bash
# Generate the type-safe Prisma client
npm run db:generate

# Deploy the reviewed initial enterprise migration
npx prisma migrate deploy
```

### 11.5 Seeding Demonstration Data

Populate the database with the pre-configured loan catalog, eligibility rules, document requirements, and synthetic test applicants:

```bash
npm run db:seed
```

This populates:
- **4** Loan Products
- **24** Eligibility Rules (6 per product, including credit score requirements)
- **21** Document Requirements
- **14** Synthetic Demonstration Applicants (`demo-app-001` through `demo-app-014`, strictly using RFC 2606 `@example.com` domains)

---

## 12. Running the Application

Start the local development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your web browser.

To verify a production build:

```bash
npm run build
npm run start
```

---

## 13. Testing and Verification

CrediGuide AI features comprehensive automated test suites executed via `tsx`:

| Test Command | Description | Key Areas Covered |
| :--- | :--- | :--- |
| `npm run test:engine` | Deterministic Engine Unit Tests | Reducing-balance EMI, FOIR calculations, age/income thresholds, and borrowing headroom caps. |
| `npm run test:financial` | Financial Math & Boundary Tests | Rounding precision, zero-interest edge cases, high-income scale tests, and floating-point stability. |
| `npm run test:ai` | Conversational NLP Extraction Tests | Extraction of Indian salary formats ("₹60,000", "5 Lakhs", "50k"), EMIs, age, employer, and employment type. |
| `npm run test:chat` | Multi-Turn Chat Orchestration Tests | Interactive conversational state persistence, missing field prompts, and handoff to the calculation engine. |
| `npm run test:seed` | Enterprise Seed & Scenario Suite | 259 automated tests verifying product catalog rules, document isolation, synthetic applicant scenarios, and overwrite protection guards. |

### Code Quality and Static Analysis

```bash
# Run TypeScript compilation check
npx tsc --noEmit

# Run ESLint check
npm run lint
```

---

## 14. Security, Compliance, and Data Privacy

- **Deterministic Isolation:** Generative AI is structurally restricted from performing calculations or issuing credit decisions, eliminating risk of mathematical hallucination or arbitrary rate quotes.
- **Strict Input Validation:** All API inputs (`/api/eligibility`, `/api/chat`) are parsed and validated server-side using Zod schemas with bounded numerical constraints.
- **Synthetic Data Safety:** All demonstration applicants use deterministic identifiers (`demo-app-*`) and RFC 2606 reserved domains (`@example.com`). The database seeder includes safety guards (`isDemoApplicantRecord`) that prevent overwriting genuine borrower records.
- **Credential Protection:** Connection strings, API tokens, and passwords are read exclusively from environment variables and never logged or exposed to client-side bundles.
- **Database-Backed Session Architecture (Planned Phase 4):** Session secrets are generated with 256 bits of cryptographic entropy; only SHA-256 digests (`tokenHash`) are persisted in PostgreSQL, preventing session replay from database backups.

---

## 15. Implementation Status and Roadmap

| Phase | Milestone | Scope & Deliverables | Status |
| :---: | :--- | :--- | :---: |
| **Phase 1** | Project Branding & Structure | Next.js 16 setup, TypeScript configuration, UI primitives, and compliance layout. | ✅ Completed |
| **Phase 2A** | Enterprise Prisma Schema | 16-model enterprise relational schema, 7 PostgreSQL enums, Prisma 7 configuration. | ✅ Completed |
| **Phase 2A.1**| Data Adapter & Decimal Boundary | Type-safe Decimal-to-number adapter boundary, financial precision tests. | ✅ Completed |
| **Phase 2B** | Initial PostgreSQL Migration | Reviewed initial migration deployed to PostgreSQL 18 (`crediguide_db`). | ✅ Completed |
| **Phase 3** | Enterprise Seeding & Safety | 4 products, 24 rules, 21 documents, 14 synthetic applicants, 259/259 automated tests. | ✅ Completed |
| **Phase 4** | Authentication & RBAC | Argon2id password hashing, database-backed sessions, role guards, admin provisioning. | ⏳ Planned |
| **Phase 5** | Officer Review & Underwriting | Application review dashboard, document upload pipeline, committee approval flows. | ⏳ Planned |
| **Phase 6** | Live AI & External Integrations | Google Gemini API live streaming, Core Banking System (CBS) adapter integration. | ⏳ Planned |

---

## 16. General Disclaimer

CrediGuide AI is an independent software prototype developed for technological demonstration and evaluation purposes. 

1. **No Commercial Banking Affiliation:** CrediGuide AI is not affiliated with, authorized by, or an agent of the Reserve Bank of India (RBI), any commercial bank, licensed financial institution, or credit bureau.
2. **Indicative Outcomes:** All calculation outputs, indicative EMI estimates, interest rate ranges, and criteria evaluations are illustrative and subject to final credit underwriting, risk assessment, and verification by a regulated financial institution.
3. **No Financial or Legal Advice:** Content and calculations provided by this software do not constitute financial, investment, or legal advice.

---

<p align="center">
  <strong>CrediGuide AI</strong> — Autonomous Lending Intelligence & Policy Governance<br>
  Built with Next.js 16, React 19, TypeScript, Prisma 7, and PostgreSQL 18.
</p>
