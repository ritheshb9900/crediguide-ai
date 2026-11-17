import { NextResponse } from "next/server";
import { ChatApiRequestSchema, ChatServiceResponseSchema } from "@/services/ai/types";
import { orchestrateChatAssessment } from "@/services/orchestration";

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid JSON in request payload.",
        },
        { status: 400 }
      );
    }

    // 1. Validate request payload using Zod
    const validationResult = ChatApiRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation error: Message is required and conversationState must be valid.",
          details: validationResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { message, conversationState } = validationResult.data;

    // 2. Invoke chat orchestrator
    // (MockAIService extraction -> state check -> deterministic eligibility engine if ready)
    const chatResponse = await orchestrateChatAssessment(message, conversationState);

    // 3. Strictly validate orchestrated response using Zod before returning
    const validatedResponse = ChatServiceResponseSchema.parse(chatResponse);

    return NextResponse.json(
      {
        success: true,
        ...validatedResponse,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in /api/chat handler:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error in conversational AI processing.",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
