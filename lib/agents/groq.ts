import Groq from "groq-sdk";

let client: Groq | null = null;

export function getGroq(): Groq {
  if (!client) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY is not set. Add it to .env.local (see .env.example).");
    }
    client = new Groq({ apiKey });
  }
  return client;
}

export function groqModel(): string {
  return process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
}
