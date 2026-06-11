"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AnalysisReport } from "@/types";
import UploadZone from "@/components/UploadZone";
import ReportView from "@/components/ReportView";
import ChatPanel from "@/components/ChatPanel";

type AppState = "idle" | "uploading" | "analyzing" | "done" | "error";

const CHECKS = [
  { id: "C1", label: "Column completeness — no blank/NULL in mapped columns" },
  { id: "C2", label: "Total redeemable points (manual) = system-calculated" },
  { id: "C3", label: "Order step code must be post, cncl, or open" },
  { id: "C4", label: "manual_PLTR = points_left_to_redeem" },
  { id: "C5", label: "Business unit description present for posted orders" },
  { id: "C6", label: "Non-earning records only for dormant accounts" },
  { id: "C7", label: "Date of transaction NULL vs NOT NULL (B − C = D)" },
  { id: "C8", label: "Scheduler count matches output count" },
  { id: "C9", label: "Job run date consistency (load date = previous day)" },
];

export default function Home() {
  const [state, setState] = useState<AppState>("idle");
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const handleFile = useCallback(async (file: File) => {
    setState("uploading");
    setErrorMsg("");
    setReport(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      setState("analyzing");
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setReport(data as AnalysisReport);
      setState("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setState("error");
    }
  }, []);

  const handleReset = () => {
    setState("idle");
    setReport(null);
    setErrorMsg("");
  };

  return (
    <main className="relative min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V13a2 2 0 00-2-2H5a2 2 0 00-2 2v6m6 0a2 2 0 002 2h2m-4-2V9a2 2 0 012-2h2a2 2 0 012 2v10m0 0a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2h-2a2 2 0 00-2 2v14" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white">Anomaly Intelligence</h1>
              <p className="text-[11px] text-white/40">Mapping_id_Calc_of_points_OL · Step 1</p>
            </div>
          </div>
          {state === "done" && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/10"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              New file
            </button>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6">
        <AnimatePresence mode="wait">
          {(state === "idle" || state === "error") && (
            <motion.div
              key="intro"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-12 py-16"
            >
              <section className="text-center">
                <motion.p
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="mb-4 inline-block rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-white/60"
                >
                  AI-powered · cell-level precision · RAG assistant
                </motion.p>
                <motion.h2
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.05 }}
                  className="mx-auto max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-white sm:text-6xl"
                >
                  Catch every loyalty data <span className="text-gradient">anomaly</span>, down to the cell.
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.12 }}
                  className="mx-auto mt-5 max-w-xl text-base text-white/55"
                >
                  Upload your daily Master Tables workbook to run all 9 data-quality checks. Get the
                  exact row, column, and cell of every problem — then ask the AI to explain and fix it.
                </motion.p>
              </section>

              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.18 }}
                className="glass rounded-3xl p-6"
              >
                <h3 className="mb-4 text-sm font-semibold text-white/70">Checks performed on upload</h3>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {CHECKS.map((c) => (
                    <div key={c.id} className="flex items-start gap-2.5">
                      <span className="mt-0.5 shrink-0 rounded-md bg-white/8 px-1.5 py-0.5 font-mono text-[11px] text-indigo-300">
                        {c.id}
                      </span>
                      <span className="text-xs text-white/60">{c.label}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              <UploadZone onFile={handleFile} />

              {state === "error" && (
                <div className="flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4">
                  <svg className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-rose-200">Analysis failed</p>
                    <p className="mt-0.5 text-sm text-rose-300/80">{errorMsg}</p>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {(state === "uploading" || state === "analyzing") && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center gap-5 py-32"
            >
              <div className="relative h-16 w-16">
                <div className="absolute inset-0 animate-spin rounded-full border-2 border-indigo-500/30 border-t-indigo-400" />
                <div className="absolute inset-2 animate-pulse rounded-full bg-indigo-500/10" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-white/80">
                  {state === "uploading" ? "Uploading file…" : "Running anomaly checks…"}
                </p>
                <p className="mt-1 text-xs text-white/40">Analyzing all 9 data-quality rules</p>
              </div>
            </motion.div>
          )}

          {state === "done" && report && (
            <motion.div
              key="report"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="py-12"
            >
              <ReportView report={report} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ChatPanel report={report} />
    </main>
  );
}
