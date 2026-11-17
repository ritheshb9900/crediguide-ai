"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  RotateCcw,
  Sparkles,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChatMessage,
  ConversationState,
  ExtractedApplicantData,
} from "@/services/ai/types";
import { DeterministicAssessmentResponse } from "@/types/domain";
import { MessageBubble, TypingIndicator } from "./message-bubble";
import { ProgressPanel } from "./progress-panel";
import { AssessmentResultCard } from "./assessment-result-card";
import { ScenarioExplorer } from "./scenario-explorer";

let messageSequence = 0;
function createChatMessage(role: "user" | "assistant" | "system", content: string): ChatMessage {
  messageSequence += 1;
  return {
    id: `${role}-${messageSequence}`,
    role,
    content,
    timestamp: new Date().toISOString(),
  };
}

const INITIAL_WELCOME_CONTENT = `Hello! I'm your Personal Loan Eligibility Assistant.

I can help you check your preliminary loan eligibility by collecting a few details.

You can provide your information naturally, for example:
'I need an 8 lakh personal loan.'

Note: This is a preliminary eligibility assessment based on the information provided. It is not a final loan approval or sanction.`;

const INITIAL_WELCOME_MESSAGE: ChatMessage = {
  id: "welcome-msg",
  role: "assistant",
  content: INITIAL_WELCOME_CONTENT,
  timestamp: "2026-09-26T10:00:00.000Z",
};

const INITIAL_CONVERSATION_STATE: ConversationState = {
  applicantProfile: {},
  collectedFields: [],
  missingFields: [
    "requestedAmount",
    "monthlyNetIncome",
    "employmentType",
    "existingMonthlyEmi",
    "age",
    "requestedTenureMonths",
  ],
  currentQuestion: null,
  conversationHistory: [INITIAL_WELCOME_MESSAGE],
};

const DEMO_PROMPTS = [
  "I need an 8 lakh personal loan.",
  "60000",
  "Salaried",
  "5000",
  "28",
  "5 years",
];

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_WELCOME_MESSAGE]);
  const [conversationState, setConversationState] = useState<ConversationState>(
    INITIAL_CONVERSATION_STATE
  );
  const [input, setInput] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<DeterministicAssessmentResponse | null>(null);
  const [showScenarioExplorer, setShowScenarioExplorer] = useState<boolean>(false);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto scroll to bottom when messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, assessment]);

  // Focus input on load
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSendMessage = async (textToSend?: string) => {
    const messageContent = (textToSend || input).trim();
    if (!messageContent || isLoading) return;

    setError(null);
    setInput("");

    const userMessage = createChatMessage("user", messageContent);

    // 1. Add user message to UI immediately
    const updatedHistory = [...messages, userMessage];
    setMessages(updatedHistory);
    setIsLoading(true);

    try {
      // 2. Send payload to POST /api/chat
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageContent,
          conversationState: {
            ...conversationState,
            conversationHistory: updatedHistory,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Sorry, I couldn't process your request. Please try again."
        );
      }

      // 3. Extract assistant response
      const assistantMessage = createChatMessage("assistant", data.message);

      setMessages((prev) => [...prev, assistantMessage]);

      // 4. Update conversation state with latest server data
      const newApplicantProfile: Partial<ExtractedApplicantData> = {
        ...conversationState.applicantProfile,
        ...(data.extractedData || {}),
      };

      setConversationState({
        applicantProfile: newApplicantProfile,
        collectedFields: data.collectedFields || [],
        missingFields: data.missingFields || [],
        currentQuestion: data.nextQuestion || null,
        conversationHistory: [...updatedHistory, assistantMessage],
      });

      // 5. If assessment returned by deterministic engine, show result
      if (data.assessment) {
        setAssessment(data.assessment);
      }
    } catch (err) {
      console.error("Chat communication error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while communicating with the assistant."
      );
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  };

  const handleReset = () => {
    setMessages([INITIAL_WELCOME_MESSAGE]);
    setConversationState(INITIAL_CONVERSATION_STATE);
    setAssessment(null);
    setShowScenarioExplorer(false);
    setError(null);
    setInput("");
    inputRef.current?.focus();
  };

  const handleScenarioAssessed = (newAssessment: DeterministicAssessmentResponse) => {
    setAssessment(newAssessment);
    // Add informational message in chat
    const infoMessage = createChatMessage(
      "assistant",
      `Scenario re-evaluated: For ₹${newAssessment.financialMetrics.requestedAmount.toLocaleString(
        "en-IN"
      )} over ${
        newAssessment.financialMetrics.requestedTenureMonths
      } months, your status is ${
        newAssessment.status
      } (Proposed EMI: ₹${newAssessment.financialMetrics.proposedMonthlyEmi.toLocaleString(
        "en-IN"
      )}).`
    );
    setMessages((prev) => [...prev, infoMessage]);
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-4">
      {/* Top Banner & Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-xs">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Personal Loan Eligibility Chatbot
              </h2>
              <Badge variant="success" className="text-[10px] font-semibold">
                Live Prototype
              </Badge>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Deterministic Credit Policy Engine &bull; AI Entity Extraction &bull; Zero External Keys
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* Mobile progress toggle */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsMobilePanelOpen(!isMobilePanelOpen)}
            className="lg:hidden text-xs flex items-center gap-1.5"
          >
            <span>Progress ({conversationState.collectedFields.length}/6)</span>
            {isMobilePanelOpen ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="text-xs text-slate-700 dark:text-slate-300 hover:text-rose-600 flex items-center gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Application</span>
          </Button>
        </div>
      </div>

      {/* Main Grid: Chat Area + Side Progress Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main Chat Area (8 cols on desktop) */}
        <div className="lg:col-span-8 flex flex-col h-[700px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          {/* Chat Header Status */}
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Loan Assistant Online
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              Interactive Stage 3C Interface
            </span>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {isLoading && <TypingIndicator />}

            {/* If Assessment is present, render prominent result card directly in chat */}
            {assessment && (
              <div className="my-6 space-y-4">
                <AssessmentResultCard
                  assessment={assessment}
                  onExploreScenario={() =>
                    setShowScenarioExplorer(!showScenarioExplorer)
                  }
                />

                {showScenarioExplorer && (
                  <ScenarioExplorer
                    initialAssessment={assessment}
                    onScenarioAssessed={handleScenarioAssessed}
                  />
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mx-4 mb-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Demo Suggestion Chips */}
          <div className="px-4 py-2 bg-slate-50/60 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 overflow-x-auto text-xs">
            <span className="text-[11px] font-semibold text-slate-400 shrink-0 flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-blue-500" /> Suggested:
            </span>
            {DEMO_PROMPTS.map((prompt, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(prompt)}
                disabled={isLoading}
                className="px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 text-slate-700 dark:text-slate-300 text-[11px] whitespace-nowrap transition-colors cursor-pointer disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Chat Input Bar */}
          <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message (e.g., 'I need an 8 lakh personal loan')..."
                disabled={isLoading}
                className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all disabled:opacity-50"
              />
              <Button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-colors shrink-0 font-medium"
              >
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline ml-1.5">Send</span>
              </Button>
            </form>
            <p className="text-[10px] text-slate-400 mt-2 text-center">
              Preliminary assessment demo &bull; Enter loan requests in natural language &bull; No credit bureau check conducted
            </p>
          </div>
        </div>

        {/* Side Panel: Application Progress (4 cols on desktop) */}
        <div
          className={`lg:col-span-4 ${
            isMobilePanelOpen ? "block" : "hidden lg:block"
          }`}
        >
          <div className="sticky top-20">
            <ProgressPanel
              collectedFields={conversationState.collectedFields}
              extractedData={conversationState.applicantProfile}
              readyForAssessment={
                conversationState.collectedFields.length >= 6
              }
              hasAssessment={!!assessment}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
