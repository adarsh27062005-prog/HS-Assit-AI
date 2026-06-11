import type Groq from "groq-sdk";
import { getGroq, groqModel } from "./groq";
import { CHAT_SYSTEM } from "./prompts";
import { retrieve } from "@/lib/rag/retriever";
import type { ChatMessage, AnalysisReport } from "@/types";

function summarizeReport(report: AnalysisReport): string {
  const lines = [
    `File: ${report.filename} | Run date: ${report.runDate} | Sheets: ${report.sheetsFound.join(", ")}`,
    `Summary: ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.warnings} info/warn (of ${report.summary.total}).`,
    "",
    "Per-check results:",
    ...report.checks.map((c) => {
      const examples = (c.details ?? [])
        .slice(0, 3)
        .map((d) => `${d.cellRef ?? `row ${d.rowIndex ?? "?"}`} ${d.field ?? ""}=${d.value ?? "(blank)"}`)
        .join("; ");
      return `- ${c.checkId} ${c.checkName}: ${c.status.toUpperCase()} — ${c.message}${
        examples ? ` | e.g. ${examples}` : ""
      }`;
    }),
  ];
  return lines.join("\n");
}

export async function streamChat(messages: ChatMessage[], report: AnalysisReport | null) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const context = lastUser ? await retrieve(lastUser.content, 4) : [];
  const contextText = context.map((c) => `[${c.source}]\n${c.text}`).join("\n\n---\n\n");
  const reportSummary = report ? summarizeReport(report) : "No report has been uploaded yet.";

  const system = [
    CHAT_SYSTEM,
    "",
    "=== Knowledge base context ===",
    contextText || "(none)",
    "",
    "=== Current report ===",
    reportSummary,
  ].join("\n");

  const chatMessages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  const groq = getGroq();
  return groq.chat.completions.create({
    model: groqModel(),
    temperature: 0.3,
    stream: true,
    messages: chatMessages,
  });
}
