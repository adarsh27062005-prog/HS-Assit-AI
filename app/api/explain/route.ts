import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const check = body?.check;
    const { checkId, checkName, status, message, details } = check ?? {};

    // Craft a highly specific, context-aware prompt for the LLM
    let prompt = "";
    if (status === "pass") {
      prompt = `The database validation rule "${checkId}: ${checkName}" passed successfully.
      System context: "${message}".
      Provide a highly concise, professional analysis confirming why this validation indicates clean data integrity. Do not mention errors or failures. Keep it under 2 sentences.`;
    } else {
      prompt = `The database validation rule "${checkId}: ${checkName}" failed.
      Error message summary: "${message}".
      Raw mismatched error arrays/null logs: ${JSON.stringify(details || []).slice(0, 1500)}

      Analyze these raw data properties. Explain what went wrong neatly, clearly, and technically. Point out the exact invalid values or missing columns so a data engineer knows exactly what to fix. Keep the response compact and highly structured.`;
    }

    const response = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "You are an automated backend analytics agent for HS Assist AI. Explain execution log anomalies with technical precision, clarity, and structural brevity."
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.1, // Low temperature for factual, analytical results
    });

    const aiExplanation = response.choices[0]?.message?.content || "Unable to parse anomaly parameters.";
    return NextResponse.json({ explanation: aiExplanation });
  } catch (error: any) {
    console.error("Groq endpoint execution fault:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}