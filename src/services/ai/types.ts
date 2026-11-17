import { z } from "zod";
import {
  PreliminaryAssessmentResult,
  DeterministicAssessmentResponse,
  EligibilityStatus,
  EligibilityStatusEnum,
  FinancialMetrics,
  ExplainedCriterion,
  DocumentItem,
} from "@/types/domain";

/**
 * Message in conversation history
 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  timestamp: z.string(),
});

/**
 * Extracted Partial Applicant Data from free-text user messages
 */
export interface ExtractedApplicantData {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  age?: number;
  employmentType?: string;
  employerName?: string;
  monthlyNetIncome?: number;
  existingMonthlyEmi?: number;
  creditScore?: number;
  city?: string;
  requestedAmount?: number;
  requestedTenureMonths?: number;
  workExperienceYears?: number;
  confidence?: number;
}

export const ExtractedApplicantDataSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  age: z.number().int().optional(),
  employmentType: z.string().optional(),
  employerName: z.string().optional(),
  monthlyNetIncome: z.number().optional(),
  existingMonthlyEmi: z.number().optional(),
  creditScore: z.number().int().optional(),
  city: z.string().optional(),
  requestedAmount: z.number().optional(),
  requestedTenureMonths: z.number().int().optional(),
  workExperienceYears: z.number().optional(),
  confidence: z.number().optional(),
});

/**
 * Conversation State persisted across chat turns
 */
export interface ConversationState {
  applicantProfile: Partial<ExtractedApplicantData>;
  collectedFields: string[];
  missingFields: string[];
  currentQuestion: string | null;
  conversationHistory: ChatMessage[];
}

export const ConversationStateSchema = z.object({
  applicantProfile: ExtractedApplicantDataSchema.default({}),
  collectedFields: z.array(z.string()).default([]),
  missingFields: z.array(z.string()).default([]),
  currentQuestion: z.string().nullable().default(null),
  conversationHistory: z.array(ChatMessageSchema).default([]),
});

/**
 * Structured Chat Service Output validated by Zod
 */
export interface ChatServiceResponse {
  message: string;
  extractedData: Partial<ExtractedApplicantData>;
  collectedFields: string[];
  missingFields: string[];
  nextQuestion: string | null;
  readyForAssessment: boolean;
  assessment?: DeterministicAssessmentResponse;
  status?: EligibilityStatus;
  financialMetrics?: FinancialMetrics;
  criteria?: ExplainedCriterion[];
  reasons?: string[];
  nextSteps?: string[];
  documents?: DocumentItem[];
}

export const ChatServiceResponseSchema = z.object({
  message: z.string(),
  extractedData: ExtractedApplicantDataSchema,
  collectedFields: z.array(z.string()),
  missingFields: z.array(z.string()),
  nextQuestion: z.string().nullable(),
  readyForAssessment: z.boolean(),
  assessment: z.any().optional(),
  status: EligibilityStatusEnum.optional(),
  financialMetrics: z.any().optional(),
  criteria: z.array(z.any()).optional(),
  reasons: z.array(z.string()).optional(),
  nextSteps: z.array(z.string()).optional(),
  documents: z.array(z.any()).optional(),
});

/**
 * Request payload for POST /api/chat
 */
export const ChatApiRequestSchema = z.object({
  message: z.string().min(1, "Message cannot be empty"),
  conversationState: ConversationStateSchema.optional(),
});

export type ChatApiRequest = z.infer<typeof ChatApiRequestSchema>;

/**
 * AI Response Generation Input (backward compatibility)
 */
export interface AIChatInput {
  messages: ChatMessage[];
  currentExtractedData: Partial<ExtractedApplicantData>;
  missingFields: string[];
  preliminaryAssessment?: PreliminaryAssessmentResult;
}

/**
 * AI Service Contract
 * 
 * IMPORTANT ARCHITECTURE PRINCIPLE:
 * The AI Service is solely responsible for:
 * 1. Conversational dialogue & polite customer engagement
 * 2. Natural language entity extraction into structured data
 * 3. Explaining missing parameters required to complete an assessment
 * 
 * The AI MUST NEVER independently compute or decide final preliminary eligibility.
 * All eligibility calculations and determinations are strictly owned by the Deterministic Engine.
 */
export interface IAIService {
  readonly providerName: string;

  /**
   * Processes a user chat message within the conversation state,
   * performs extraction & normalization, and determines the next question.
   */
  processChatMessage(
    userMessage: string,
    state?: Partial<ConversationState>
  ): Promise<ChatServiceResponse>;

  /**
   * Identifies and extracts applicant financial profile parameters from free-form chat.
   */
  extractApplicantProfile(
    userInput: string,
    existingContext: Partial<ExtractedApplicantData>,
    currentQuestion?: string | null
  ): Promise<{
    extracted: Partial<ExtractedApplicantData>;
    missingFields: string[];
  }>;

  /**
   * Generates a conversational reply based on chat input context.
   */
  generateConversationalReply(input: AIChatInput): Promise<{
    message: string;
    suggestedQuickReplies?: string[];
  }>;
}
