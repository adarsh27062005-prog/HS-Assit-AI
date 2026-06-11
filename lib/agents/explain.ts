import { getGroq, groqModel } from "./groq";
import { EXPLAIN_SYSTEM } from "./prompts";
import { retrieve } from "@/lib/rag/retriever";
import type { AnomalyResult, ExplainResponse } from "@/types";

export async function explainAnomaly(check: AnomalyResult): Promise<ExplainResponse> {
  const query = `${check.checkId} ${check.checkName} ${check.message}`;
  const context = await retrieve(query, 4);
  const contextText = context.map((c) => `[${c.source}]\n${c.text}`).join("\n\n---\n\n");

  const sampleDetails = (check.details ?? [])
    .slice(0, 8)
    .map(
      (d) =>
        `- ${d.cellRef ?? `row ${d.rowIndex ?? "?"}`} [${d.field ?? "?"}] value=${
          d.value ?? "(blank)"
        }: ${d.issue ?? ""}`
    )
    .join("\n");

  const userPrompt = [
    "Authoritative rule context:",
    contextText || "(none retrieved)",
    "",
    "Anomaly check result:",
    `ID: ${check.checkId}`,
    `Name: ${check.checkName}`,
    `Status: ${check.status}`,
    `Description: ${check.description}`,
    `Message: ${check.message}`,
    typeof check.count === "number" ? `Issues found: ${check.count}` : "",
    "",
    "Example offending rows/cells:",
    sampleDetails || "(none)",
    "",
    "Explain this result following the required sections.",
  ]
    .filter(Boolean)
    .join("\n");

  const groq = getGroq();
  const completion = await groq.chat.completions.create({
    model: groqModel(),
    temperature: 0.2,
    messages: [
      { role: "system", content: EXPLAIN_SYSTEM },
      { role: "user", content: userPrompt },
    ],
  });

  const explanation =
    completion.choices[0]?.message?.content?.trim() || "No explanation was generated.";

  return {
    checkId: check.checkId,
    explanation,
    sources: [...new Set(context.map((c) => c.source))],
  };
}
