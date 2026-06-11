"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AnalysisReport, AnomalyResult, ExplainResponse } from "@/types";
import AnimatedCounter from "@/components/AnimatedCounter";

interface Props {
  report: AnalysisReport;
}

type Filter = "all" | "fail" | "pass" | "info";

export default function ReportView({ report }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = report.checks.filter((c) => {
    if (filter === "all") return true;
    if (filter === "fail") return c.status === "fail";
    if (filter === "pass") return c.status === "pass";
    if (filter === "info") return c.status === "warning" || c.status === "info";
    return true;
  });

  const handleExport = () => {
    const lines = [
      `Anomaly Check Report`,
      `File: ${report.filename}`,
      `Analyzed At: ${new Date(report.analyzedAt).toLocaleString()}`,
      `Run Date: ${report.runDate}`,
      ``,
      `Summary: ${report.summary.passed} passed / ${report.summary.failed} failed / ${report.summary.warnings} info-warn`,
      ``,
      ...report.checks.map((c) =>
        [
          `[${c.checkId}] ${c.checkName}`,
          `Status: ${c.status.toUpperCase()}`,
          `Message: ${c.message}`,
          c.details?.length
            ? `Details (first ${Math.min(c.details.length, 10)}):\n` +
              c.details
                .slice(0, 10)
                .map(
                  (d) =>
                    `  ${d.cellRef ?? `Row ${d.rowIndex ?? "-"}`} [${d.field ?? "-"}] value=${formatCellValue(
                      d.value
                    )} -> ${d.issue}`
                )
                .join("\n")
            : "",
          ``,
        ].join("\n")
      ),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `anomaly-report-${report.runDate}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-white">Analysis Report</h2>
          <p className="mt-1 text-sm text-white/50">
            {report.filename} · Run date:{" "}
            <span className="font-medium text-white/80">{report.runDate}</span> · Analyzed{" "}
            {new Date(report.analyzedAt).toLocaleString()}
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          Export
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Total Checks" value={report.summary.total} accent="from-white/10 to-white/5" text="text-white" />
        <SummaryCard label="Passed" value={report.summary.passed} accent="from-emerald-500/20 to-emerald-400/5" text="text-emerald-300" />
        <SummaryCard label="Failed" value={report.summary.failed} accent="from-rose-500/20 to-rose-400/5" text="text-rose-300" />
        <SummaryCard label="Info / Warn" value={report.summary.warnings} accent="from-amber-500/20 to-amber-400/5" text="text-amber-300" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-white/40">Sheets found:</span>
        {report.sheetsFound.map((s) => (
          <span key={s} className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-xs text-white/60">
            {s}
          </span>
        ))}
      </div>

      <div className="flex gap-1 border-b border-white/10">
        {(["all", "fail", "pass", "info"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm capitalize transition-colors ${
              filter === f
                ? "border-indigo-400 font-medium text-indigo-300"
                : "border-transparent text-white/50 hover:text-white/80"
            }`}
          >
            {f === "info" ? "Info / Warn" : f}
            <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-xs text-white/60">
              {f === "all"
                ? report.checks.length
                : f === "fail"
                ? report.summary.failed
                : f === "pass"
                ? report.summary.passed
                : report.summary.warnings}
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((check, i) => (
          <CheckCard
            key={check.checkId}
            check={check}
            index={i}
            expanded={expandedId === check.checkId}
            onToggle={() => setExpandedId(expandedId === check.checkId ? null : check.checkId)}
          />
        ))}
      </div>
    </div>
  );
}

function formatCellValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "(blank)";
  return String(value);
}

function SummaryCard({
  label,
  value,
  accent,
  text,
}: {
  label: string;
  value: number;
  accent: string;
  text: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`rounded-2xl border border-white/10 bg-gradient-to-br ${accent} p-5`}
    >
      <div className={`text-3xl font-bold ${text}`}>
        <AnimatedCounter value={value} />
      </div>
      <div className="mt-1 text-xs text-white/50">{label}</div>
    </motion.div>
  );
}

const STATUS_CONFIG = {
  pass: { dot: "bg-emerald-400", badge: "bg-emerald-500/15 text-emerald-300", label: "PASS", ring: "ring-emerald-500/20" },
  fail: { dot: "bg-rose-400", badge: "bg-rose-500/15 text-rose-300", label: "FAIL", ring: "ring-rose-500/20" },
  warning: { dot: "bg-amber-400", badge: "bg-amber-500/15 text-amber-300", label: "WARN", ring: "ring-amber-500/20" },
  info: { dot: "bg-sky-400", badge: "bg-sky-500/15 text-sky-300", label: "INFO", ring: "ring-sky-500/20" },
} as const;

function CheckCard({
  check,
  index,
  expanded,
  onToggle,
}: {
  check: AnomalyResult;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const cfg = STATUS_CONFIG[check.status];
  const [explain, setExplain] = useState<ExplainResponse | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState("");

  const runExplain = async () => {
    setExplainLoading(true);
    setExplainError("");
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ check }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to explain");
      setExplain(data as ExplainResponse);
    } catch (err) {
      setExplainError(err instanceof Error ? err.message : "Failed to explain");
    } finally {
      setExplainLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.3) }}
      className={`overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] ring-1 ${cfg.ring}`}
    >
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${cfg.dot}`} />
        <span className="shrink-0 font-mono text-xs text-white/40">{check.checkId}</span>
        <span className="flex-1 text-sm font-medium text-white">{check.checkName}</span>
        {check.count !== undefined && check.total !== undefined && (
          <span className="shrink-0 text-xs text-white/40">
            {check.count} / {check.total}
          </span>
        )}
        <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${cfg.badge}`}>
          {cfg.label}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-white/40 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="border-t border-white/10 bg-black/20"
          >
            <div className="space-y-4 px-5 py-4">
              <div>
                <p className="text-xs text-white/40">{check.description}</p>
                <p className="mt-2 text-sm font-medium text-white/90">{check.message}</p>
              </div>

              {check.details && check.details.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-white/50">
                    Issue details (showing first {Math.min(check.details.length, 50)} of{" "}
                    {check.count ?? check.details.length}):
                  </p>
                  <div className="max-h-72 overflow-auto rounded-xl border border-white/10">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-white/[0.06] backdrop-blur">
                        <tr className="border-b border-white/10">
                          <th className="px-3 py-2 text-left font-medium text-white/60">Row</th>
                          <th className="px-3 py-2 text-left font-medium text-white/60">Column</th>
                          <th className="px-3 py-2 text-left font-medium text-white/60">Cell</th>
                          <th className="px-3 py-2 text-left font-medium text-white/60">Bad value</th>
                          <th className="px-3 py-2 text-left font-medium text-white/60">Issue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {check.details.map((d, i) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-transparent" : "bg-white/[0.02]"}>
                            <td className="whitespace-nowrap px-3 py-1.5 font-mono text-white/50">{d.rowIndex ?? "-"}</td>
                            <td className="whitespace-nowrap px-3 py-1.5 font-mono text-white/70">{d.field ?? "-"}</td>
                            <td className="whitespace-nowrap px-3 py-1.5 font-mono text-cyan-300">{d.cellRef ?? "-"}</td>
                            <td className="whitespace-nowrap px-3 py-1.5 font-mono text-amber-200">{formatCellValue(d.value)}</td>
                            <td className="px-3 py-1.5 text-white/70">{d.issue ?? "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-indigo-400/20 bg-indigo-500/[0.06] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5L13 3z" />
                    </svg>
                    <span className="text-sm font-medium text-indigo-200">AI explanation</span>
                  </div>
                  <button
                    onClick={runExplain}
                    disabled={explainLoading}
                    className="rounded-lg bg-indigo-500/80 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {explainLoading ? "Analyzing…" : explain ? "Regenerate" : "Explain with AI"}
                  </button>
                </div>

                {explainError && <p className="mt-3 text-xs text-rose-300">{explainError}</p>}

                {explain && (
                  <div className="mt-3 space-y-2">
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">
                      {explain.explanation}
                    </div>
                    {explain.sources.length > 0 && (
                      <p className="text-[11px] text-white/40">Sources: {explain.sources.join(", ")}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
