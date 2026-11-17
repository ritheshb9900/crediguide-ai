import { IAIService } from "./types";
import { MockAIService } from "./mock-ai-service";

let cachedAIService: IAIService | null = null;

/**
 * Returns the configured AI conversational service.
 * Supports:
 * - Local deterministic MOCK AI provider (default for offline hackathon execution)
 * - Future Gemini API provider when GEMINI_API_KEY is configured
 * 
 * Boundary Rule:
 * The AI service handles conversational parsing and entity extraction.
 * It NEVER performs or decides eligibility calculations.
 */
export function getAIService(): IAIService {
  if (cachedAIService) {
    return cachedAIService;
  }

  const aiProvider = process.env.AI_PROVIDER || "mock";
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (aiProvider === "gemini" && geminiApiKey && geminiApiKey.trim() !== "") {
    // Reserved for future Gemini integration in Stage 3B
    // Falls back to MockAIService if not initialized
    console.log("ℹ️ Gemini AI provider requested (future integration).");
  }

  // Default to local deterministic Mock AI service
  cachedAIService = new MockAIService();
  return cachedAIService;
}

export * from "./types";
export * from "./mock-ai-service";
