import { NextRequest, NextResponse } from "next/server";
import { parseExcelBuffer } from "@/lib/parseExcel";
import { runAllChecks } from "@/lib/anomalyChecks";
import type { AnalysisReport } from "@/types";

export const maxDuration = 30;
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls"].includes(ext ?? "")) {
      return NextResponse.json({ error: "Only .xlsx or .xls files are supported." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { sheets, sheetNames, columnMaps } = parseExcelBuffer(buffer);

    const checks = runAllChecks(sheets, columnMaps);

    const summary = {
      total: checks.length,
      passed: checks.filter((c) => c.status === "pass").length,
      failed: checks.filter((c) => c.status === "fail").length,
      warnings: checks.filter((c) => c.status === "warning" || c.status === "info").length,
    };

    // Determine run date from data
    const oli = sheets["Order_line_item"] ?? [];
    const loadDates = oli
      .map((r) => r["load_date"])
      .filter(Boolean)
      .map((d) => String(d));
    const runDate = loadDates.sort().reverse()[0] ?? new Date().toISOString().split("T")[0];

    const report: AnalysisReport = {
      filename: file.name,
      analyzedAt: new Date().toISOString(),
      runDate,
      sheetsFound: sheetNames,
      summary,
      checks,
    };

    return NextResponse.json(report);
  } catch (err) {
    console.error("Analysis error:", err);
    return NextResponse.json(
      { error: "Failed to analyze file. Please ensure it is a valid Master Tables Excel file." },
      { status: 500 }
    );
  }
}
