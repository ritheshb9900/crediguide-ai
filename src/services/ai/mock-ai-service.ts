import {
  IAIService,
  ExtractedApplicantData,
  ConversationState,
  ChatServiceResponse,
  ChatServiceResponseSchema,
  AIChatInput,
} from "./types";

/**
 * Core personal loan fields required to perform a preliminary eligibility assessment
 */
export const CORE_ASSESSMENT_FIELDS: (keyof ExtractedApplicantData)[] = [
  "requestedAmount",
  "monthlyNetIncome",
  "employmentType",
  "existingMonthlyEmi",
  "age",
  "requestedTenureMonths",
];

export const ALL_DEMO_FIELDS: (keyof ExtractedApplicantData)[] = [
  "requestedAmount",
  "monthlyNetIncome",
  "employmentType",
  "existingMonthlyEmi",
  "age",
  "requestedTenureMonths",
  "firstName",
  "lastName",
  "email",
  "phone",
];

export class MockAIService implements IAIService {
  readonly providerName = "MOCK_LOCAL_AI";

  /**
   * Processes a user chat message within the conversation state.
   */
  async processChatMessage(
    userMessage: string,
    existingState?: Partial<ConversationState>
  ): Promise<ChatServiceResponse> {
    const state: ConversationState = {
      applicantProfile: { ...(existingState?.applicantProfile || {}) },
      collectedFields: [...(existingState?.collectedFields || [])],
      missingFields: [...(existingState?.missingFields || [])],
      currentQuestion: existingState?.currentQuestion ?? null,
      conversationHistory: [...(existingState?.conversationHistory || [])],
    };

    // 1. Extract and normalize fields from user input
    const { extracted, validationError } = this.parseUserInput(
      userMessage,
      state.applicantProfile,
      state.currentQuestion
    );

    // Merge extracted data into applicant profile
    Object.assign(state.applicantProfile, extracted);

    // Update collected fields
    const updatedCollected = Object.keys(state.applicantProfile).filter(
      (k) => (state.applicantProfile as Record<string, unknown>)[k] !== undefined
    );
    state.collectedFields = Array.from(new Set([...state.collectedFields, ...updatedCollected]));

    // Determine missing core assessment fields
    const missingCore = CORE_ASSESSMENT_FIELDS.filter(
      (f) => (state.applicantProfile as Record<string, unknown>)[f] === undefined
    );
    state.missingFields = missingCore;

    // Check if ready for assessment
    const readyForAssessment = missingCore.length === 0;

    // 2. Formulate Next Question or Completion Response
    let nextQuestion: string | null = null;
    let assistantMessage = "";

    if (validationError) {
      assistantMessage = validationError;
      nextQuestion = state.currentQuestion;
    } else if (readyForAssessment) {
      assistantMessage =
        "Thank you! All required financial parameters have been gathered. Your profile is ready for preliminary eligibility evaluation.";
      nextQuestion = null;
    } else {
      const nextField = missingCore[0];
      const questionData = this.getQuestionForField(nextField, state.applicantProfile);
      nextQuestion = questionData.question;
      assistantMessage = questionData.conversationalPrefix
        ? `${questionData.conversationalPrefix} ${questionData.question}`
        : questionData.question;
    }

    state.currentQuestion = nextQuestion;

    const responsePayload: ChatServiceResponse = {
      message: assistantMessage,
      extractedData: { ...state.applicantProfile },
      collectedFields: state.collectedFields,
      missingFields: state.missingFields,
      nextQuestion,
      readyForAssessment,
    };

    // 3. Strict Zod Schema Validation before returning
    return ChatServiceResponseSchema.parse(responsePayload);
  }

  /**
   * Compatibility method for IAIService interface
   */
  async extractApplicantProfile(
    userInput: string,
    existingContext: Partial<ExtractedApplicantData>,
    currentQuestion?: string | null
  ): Promise<{
    extracted: Partial<ExtractedApplicantData>;
    missingFields: string[];
  }> {
    const { extracted } = this.parseUserInput(userInput, existingContext, currentQuestion);
    const merged = { ...existingContext, ...extracted };
    const missing = CORE_ASSESSMENT_FIELDS.filter((f) => merged[f] === undefined);
    return {
      extracted,
      missingFields: missing,
    };
  }

  /**
   * Compatibility method for IAIService interface
   */
  async generateConversationalReply(input: AIChatInput): Promise<{
    message: string;
    suggestedQuickReplies?: string[];
  }> {
    const lastUserMsg = input.messages.filter((m) => m.role === "user").pop()?.content || "";
    const res = await this.processChatMessage(lastUserMsg, {
      applicantProfile: input.currentExtractedData,
    });
    return {
      message: res.message,
      suggestedQuickReplies: res.readyForAssessment ? ["Check Preliminary Eligibility"] : undefined,
    };
  }

  /**
   * Internal deterministic NLP and Regex parser
   */
  private parseUserInput(
    rawText: string,
    existingProfile: Partial<ExtractedApplicantData>,
    currentQuestion?: string | null
  ): {
    extracted: Partial<ExtractedApplicantData>;
    validationError?: string;
  } {
    const text = rawText.trim();
    const extracted: Partial<ExtractedApplicantData> = {};

    // Check for negative numbers on input
    if (/-\s*\d+/.test(text)) {
      if (text.toLowerCase().includes("income") || currentQuestion?.includes("income")) {
        return { extracted: {}, validationError: "Monthly income cannot be negative. Please enter a positive amount." };
      }
      if (text.toLowerCase().includes("loan") || text.toLowerCase().includes("amount") || currentQuestion?.includes("borrow")) {
        return { extracted: {}, validationError: "Loan amount cannot be negative. Please enter a valid loan amount." };
      }
      if (text.toLowerCase().includes("age") || currentQuestion?.includes("age")) {
        return { extracted: {}, validationError: "Age cannot be negative. Please enter a valid age." };
      }
    }

    // 1. Context-Aware Fallback (when user responds to a specific single-field prompt)
    if (currentQuestion) {
      const qLower = currentQuestion.toLowerCase();

      // Asked for Monthly Income
      if (qLower.includes("income") || qLower.includes("salary") || qLower.includes("profit")) {
        const amt = this.parseAmount(text);
        if (amt !== null) {
          if (amt <= 0) {
            return { extracted: {}, validationError: "Monthly income must be greater than zero." };
          }
          extracted.monthlyNetIncome = amt;
        }
      }

      // Asked for Existing EMI
      else if (qLower.includes("emi") || qLower.includes("existing")) {
        if (/^(0|none|nil|no|zero|nothing|no emi|na)\b/i.test(text)) {
          extracted.existingMonthlyEmi = 0;
        } else {
          const amt = this.parseAmount(text);
          if (amt !== null) {
            if (amt < 0) {
              return { extracted: {}, validationError: "Existing monthly EMI cannot be negative." };
            }
            extracted.existingMonthlyEmi = amt;
          }
        }
      }

      // Asked for Age
      else if (qLower.includes("age") || qLower.includes("years old")) {
        const ageMatch = text.match(/\b(\d{1,3})\b/);
        if (ageMatch) {
          const val = parseInt(ageMatch[1], 10);
          if (val < 18 || val > 100) {
            return { extracted: {}, validationError: "Age must be between 18 and 100 years." };
          }
          extracted.age = val;
        }
      }

      // Asked for Tenure
      else if (qLower.includes("tenure") || qLower.includes("repayment")) {
        const tenureMonths = this.parseTenure(text, true);
        if (tenureMonths !== null) {
          if (tenureMonths <= 0) {
            return { extracted: {}, validationError: "Loan tenure must be greater than zero." };
          }
          extracted.requestedTenureMonths = tenureMonths;
        }
      }

      // Asked for Employment Type
      else if (qLower.includes("employment")) {
        const emp = this.parseEmployment(text);
        if (emp) {
          extracted.employmentType = emp;
        }
      }

      // Asked for Loan Amount
      else if (qLower.includes("borrow") || qLower.includes("loan amount")) {
        const amt = this.parseAmount(text);
        if (amt !== null) {
          if (amt <= 0) {
            return { extracted: {}, validationError: "Loan amount must be greater than zero." };
          }
          extracted.requestedAmount = amt;
        }
      }
    }

    // 2. Global Entity Extraction across full message

    // --- Age ---
    if (extracted.age === undefined) {
      const agePatterns = [
        /(?:i am|age is|age of|i'm)\s+(\d{1,3})(?:\s*years?\s*old|\s*yrs?|\s*yo)?/i,
        /(\d{1,3})\s*(?:years?\s*old|yrs?\s*old)/i,
      ];
      for (const pattern of agePatterns) {
        const match = text.match(pattern);
        if (match) {
          const val = parseInt(match[1], 10);
          if (val >= 18 && val <= 100) {
            extracted.age = val;
            break;
          }
        }
      }
    }

    // --- Income ---
    if (extracted.monthlyNetIncome === undefined) {
      const incomePatterns = [
        /(?:earn(?:ing|s)?|income|salary|make(?:s)?|take\s*home)\s*(?:is|of)?\s*(?:₹|rs\.?|inr)?\s*([0-9.,]+(?:\s*(?:k|lakh|lac|l))?)(?:\s*(?:per|\/)\s*month|\s*monthly|\s*pm)?/i,
        /monthly\s*(?:income|salary)\s*(?:is|of)?\s*(?:₹|rs\.?|inr)?\s*([0-9.,]+(?:\s*(?:k|lakh|lac|l))?)/i,
      ];
      for (const pattern of incomePatterns) {
        const match = text.match(pattern);
        if (match) {
          const amt = this.parseAmount(match[1]);
          if (amt !== null && amt > 0) {
            extracted.monthlyNetIncome = amt;
            break;
          }
        }
      }
    }

    // --- Existing EMI ---
    if (extracted.existingMonthlyEmi === undefined) {
      const emiPatterns = [
        /(?:existing\s*emi|already\s*pay|current\s*emi|emi\s*is|paying)\s*(?:₹|rs\.?|inr)?\s*([0-9.,]+(?:\s*(?:k|lakh|lac|l))?)(?:\s*emi)?/i,
        /([0-9.,]+(?:\s*(?:k|lakh|lac|l))?)\s*(?:existing\s*emi|as\s*emi)/i,
      ];
      for (const pattern of emiPatterns) {
        const match = text.match(pattern);
        if (match) {
          const amt = this.parseAmount(match[1]);
          if (amt !== null && amt >= 0) {
            extracted.existingMonthlyEmi = amt;
            break;
          }
        }
      }
      if (/no\s*existing\s*emi|zero\s*emi|no\s*loans/i.test(text)) {
        extracted.existingMonthlyEmi = 0;
      }
    }

    // --- Requested Loan Amount ---
    // Specifically matches loan amount requests without colliding with tenure
    if (extracted.requestedAmount === undefined) {
      const loanPatterns = [
        /(?:need|want|require|apply\s*for|looking\s*for)\s*(?:a|an)?\s*(?:personal\s*)?loan(?:\s*of)?\s*(?:₹|rs\.?|inr)?\s*([0-9.,]+(?:\s*(?:k|lakh|lac|l))?)/i,
        /(?:need|want|require|apply\s*for|looking\s*for)\s*(?:a|an)?\s*(?:₹|rs\.?|inr)?\s*([0-9.,]+(?:\s*(?:k|lakh|lac|l))?)\s*(?:personal\s*)?loan\b/i,
        /(?:loan\s*(?:amount|of))\s*(?:is|of)?\s*(?:₹|rs\.?|inr)?\s*([0-9.,]+(?:\s*(?:k|lakh|lac|l))?)/i,
        /\b([0-9.,]+(?:\s*(?:lakh|lac|l)))\s*(?:personal\s*)?loan\b/i,
      ];
      for (const pattern of loanPatterns) {
        const match = text.match(pattern);
        if (match) {
          const amt = this.parseAmount(match[1]);
          if (amt !== null && amt > 0) {
            extracted.requestedAmount = amt;
            break;
          }
        }
      }
    }

    // --- Tenure ---
    if (extracted.requestedTenureMonths === undefined) {
      const tenureMonths = this.parseTenure(text);
      if (tenureMonths !== null && tenureMonths > 0) {
        extracted.requestedTenureMonths = tenureMonths;
      }
    }

    // --- Employment Type ---
    if (extracted.employmentType === undefined) {
      const emp = this.parseEmployment(text);
      if (emp) {
        extracted.employmentType = emp;
      }
    }

    // --- Credit Score (Only if explicitly stated) ---
    const creditMatch = text.match(/(?:credit\s*score|cibil\s*score|cibil)\s*(?:is|of)?\s*(\d{3})\b/i);
    if (creditMatch) {
      const score = parseInt(creditMatch[1], 10);
      if (score >= 300 && score <= 900) {
        extracted.creditScore = score;
      }
    }

    // --- Email ---
    const emailMatch = text.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/);
    if (emailMatch) {
      extracted.email = emailMatch[1];
    }

    // --- Phone ---
    const phoneMatch = text.match(/\b([6-9]\d{9})\b/);
    if (phoneMatch) {
      extracted.phone = phoneMatch[1];
    }

    // --- Names ---
    const nameMatch = text.match(/(?:my name is|i am|this is)\s+([A-Za-z]+)\s+([A-Za-z]+)/i);
    if (nameMatch && !/salaried|employee|self|working/i.test(nameMatch[1])) {
      extracted.firstName = nameMatch[1];
      extracted.lastName = nameMatch[2];
    }

    return { extracted };
  }

  /**
   * Helper to parse Indian currency / numbers (lakhs, k, commas)
   */
  private parseAmount(str: string): number | null {
    if (!str) return null;
    const s = str.trim().toLowerCase().replace(/,/g, "").replace(/[₹$]/g, "").trim();

    // Handle "lakh", "lac", "l"
    const lakhMatch = s.match(/^([0-9.]+)\s*(?:lakhs?|lacs?|l)\b/);
    if (lakhMatch) {
      const num = parseFloat(lakhMatch[1]);
      return isNaN(num) ? null : Math.round(num * 100000);
    }

    // Handle "k" (e.g. 60k, 60 k)
    const kMatch = s.match(/^([0-9.]+)\s*k\b/);
    if (kMatch) {
      const num = parseFloat(kMatch[1]);
      return isNaN(num) ? null : Math.round(num * 1000);
    }

    // Handle standard numeric string
    const numMatch = s.match(/^([0-9]+(?:\.[0-9]+)?)/);
    if (numMatch) {
      const num = parseFloat(numMatch[1]);
      return isNaN(num) ? null : Math.round(num);
    }

    return null;
  }

  /**
   * Helper to parse tenure into months
   * Does NOT match when followed by 'old' or 'of age' to avoid colliding with applicant age
   */
  private parseTenure(str: string, isTenureContext = false): number | null {
    if (!str) return null;
    const s = str.toLowerCase();

    // Match e.g. "5 years", "5 year", "5 yrs", "5 yr", NOT followed by "old" or "of age"
    // Also requires word boundaries and looks for tenure context or for X years
    const yrMatches = Array.from(
      s.matchAll(/(?:for\s*|loan\s*for\s*|tenure\s*(?:of|is)?\s*)?([0-9.]+)\s*(?:years?|yrs?|yr)\b(?!\s*(?:old|of\s*age))/gi)
    );

    if (yrMatches.length > 0) {
      // Pick the match that is NOT an age specification
      for (const m of yrMatches) {
        const num = parseFloat(m[1]);
        if (!isNaN(num) && num > 0 && num <= 30) {
          // If the phrase isn't part of "I am X years", it's tenure
          const index = m.index ?? 0;
          const preceding = s.substring(Math.max(0, index - 15), index);
          if (!/i\s*am|age\s*is|age\s*of/i.test(preceding)) {
            return Math.round(num * 12);
          }
        }
      }
    }

    // Match e.g. "60 months", "60 month", "60 mos"
    const moMatch = s.match(/([0-9]+)\s*(?:months?|mos?|mo)\b/);
    if (moMatch) {
      const mos = parseInt(moMatch[1], 10);
      return isNaN(mos) ? null : mos;
    }

    // Bare numbers (e.g. "60", "36") only accepted when explicitly prompted for tenure
    if (isTenureContext) {
      const bareMatch = s.match(/^([0-9]{1,3})$/);
      if (bareMatch) {
        const val = parseInt(bareMatch[1], 10);
        if (val >= 6 && val <= 84) {
          return val;
        }
      }
    }

    return null;
  }

  /**
   * Helper to parse and normalize employment type
   */
  private parseEmployment(str: string): "Salaried" | "Self-employed" | null {
    const s = str.toLowerCase();

    // Salaried indicators
    if (
      /\b(?:salaried|salary\s*job|working\s*(?:in|at)\s*(?:a|an)?\s*company|corporate\s*job|employee)\b/.test(
        s
      )
    ) {
      return "Salaried";
    }

    // Self-employed indicators
    if (
      /\b(?:self[\s-]?employed|own\s*business|business\s*owner|proprietor|freelancer|consultant|run\s*(?:my\s*)?own\s*business)\b/.test(
        s
      )
    ) {
      return "Self-employed";
    }

    return null;
  }

  /**
   * Helper generating clear, friendly banking prompts for missing parameters
   */
  private getQuestionForField(
    field: keyof ExtractedApplicantData,
    profile: Partial<ExtractedApplicantData>
  ): { question: string; conversationalPrefix?: string } {
    switch (field) {
      case "requestedAmount":
        return {
          question: "How much personal loan amount are you looking to borrow?",
          conversationalPrefix: "Welcome to FinSmart LoanAssist!",
        };
      case "monthlyNetIncome":
        return {
          question: "What is your monthly net income (take-home salary or monthly business profit)?",
          conversationalPrefix: profile.requestedAmount
            ? "Sure."
            : undefined,
        };
      case "employmentType":
        return {
          question: "What is your employment type (Salaried or Self-employed)?",
          conversationalPrefix: "Thank you.",
        };
      case "existingMonthlyEmi":
        return {
          question: "Do you currently pay any monthly EMIs on existing loans or credit cards? (Enter 0 if none)",
          conversationalPrefix: "Got it.",
        };
      case "age":
        return {
          question: "What is your current age in years?",
          conversationalPrefix: "Thanks.",
        };
      case "requestedTenureMonths":
        return {
          question: "What repayment tenure do you prefer? (Between 1 and 7 years, e.g., '5 years' or '60 months')",
          conversationalPrefix: "Almost done.",
        };
      case "firstName":
      case "lastName":
        return {
          question: "May I have your full name for the application record?",
        };
      case "email":
        return {
          question: "Please provide your email address to receive your preliminary assessment summary.",
        };
      case "phone":
        return {
          question: "Please provide your 10-digit mobile number.",
        };
      default:
        return {
          question: `Could you please provide your ${field}?`,
        };
    }
  }
}
