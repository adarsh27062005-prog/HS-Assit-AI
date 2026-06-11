import { NextRequest, NextResponse } from "next/server";
import { explainAnomaly } from "@/lib/agents/explain";
import type { AnomalyResult } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const check = body?.check as AnomalyResult | undefined;
    if (!check || !check.checkId) {
      return NextResponse.json({ error: "Missing 'check' in request body." }, { status: 400 });
    }
    const result = await explainAnomaly(check);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Explain error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate explanation." },
      { status: 500 }
    );
  }
}
