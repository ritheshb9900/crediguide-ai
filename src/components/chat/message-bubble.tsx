"use client";

import { useSyncExternalStore } from "react";
import { Bot, User } from "lucide-react";
import { ChatMessage } from "@/services/ai/types";

interface MessageBubbleProps {
  message: ChatMessage;
}

const emptySubscribe = () => () => {};

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  // Idiomatic React hydration detection to prevent server/client locale & timezone mismatches
  const isHydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const formattedTime = isHydrated
    ? new Date(message.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div
      className={`flex items-start gap-3 my-3 text-sm ${
        isUser ? "flex-row-reverse" : "flex-row"
      }`}
    >
      {/* Avatar */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-xs ${
          isUser
            ? "bg-slate-800 text-white"
            : "bg-gradient-to-br from-blue-600 to-indigo-700 text-white"
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>

      {/* Bubble Content */}
      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 shadow-xs space-y-1 ${
          isUser
            ? "bg-blue-600 text-white rounded-tr-xs"
            : "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-800 rounded-tl-xs"
        }`}
      >
        <div className="flex items-center justify-between gap-2 text-[10px] opacity-75 mb-1">
          <span className="font-semibold uppercase tracking-wider">
            {isUser ? "You" : "Loan Assistant"}
          </span>
          <span className="min-w-[45px] text-right font-mono text-[10px]">
            {formattedTime}
          </span>
        </div>

        <div className="whitespace-pre-line leading-relaxed text-sm">
          {message.content}
        </div>
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 my-3 text-sm">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-xs">
        <Bot className="h-4 w-4 animate-pulse" />
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl rounded-tl-xs px-4 py-3 shadow-xs flex items-center gap-2">
        <span className="text-xs text-slate-500 font-medium">
          Assistant is analyzing...
        </span>
        <div className="flex items-center gap-1">
          <div className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-bounce [animation-delay:-0.3s]" />
          <div className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-bounce [animation-delay:-0.15s]" />
          <div className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-bounce" />
        </div>
      </div>
    </div>
  );
}
