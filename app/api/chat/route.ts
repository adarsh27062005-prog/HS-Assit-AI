import { NextRequest } from "next/server";
import { streamChat } from "@/lib/agents/chat";
import type { ChatMessage, AnalysisReport } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages = (body?.messages ?? []) as ChatMessage[];
    const report = (body?.report ?? null) as AnalysisReport | null;

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response("No messages provided.", { status: 400 });
    }

    const completion = await streamChat(messages, report);
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const text = chunk.choices?.[0]?.delta?.content ?? "";
            if (text) controller.enqueue(encoder.encode(text));
          }
        } catch (err) {
          controller.enqueue(
            encoder.encode(`\n\n[error] ${err instanceof Error ? err.message : "stream failed"}`)
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (err) {
    console.error("Chat error:", err);
    return new Response(err instanceof Error ? err.message : "Chat failed.", { status: 500 });
  }
}
