"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AnalysisReport } from "@/types";
import UploadZone from "@/components/UploadZone";
import ReportView from "@/components/ReportView";
import ChatPanel from "@/components/ChatPanel";
import Image from "next/image"; 
import { supabase } from "../supabaseClient";
import { SchedulerLog } from "../types/database";

type AppState = "idle" | "uploading" | "analyzing" | "done" | "error";
type SourceType = "file" | "database";

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
  const [sourceType, setSourceType] = useState<SourceType>("file");

  // Email Administration Process State Tracking Vector
  const [emailStatus, setEmailStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  // Supabase Data States
  const [dbLogs, setDbLogs] = useState<SchedulerLog[]>([]);
  const [dbLoading, setDbLoading] = useState<boolean>(true);
  const [dbError, setDbError] = useState<string | null>(null);

  // Fetch real-time logs from Supabase on mount
  const fetchSupabaseLogs = async () => {
    try {
      setDbLoading(true);
      setDbError(null);
      const { data, error } = await supabase
        .from("scheduler_logs")
        .select("*")
        .order("run_date", { ascending: false })
        .limit(10);

      if (error) throw error;
      if (data) setDbLogs(data as SchedulerLog[]);
    } catch (err: any) {
      setDbError(err.message || "Failed to load database logs.");
    } finally {
      setDbLoading(false);
    }
  };

  useEffect(() => {
    fetchSupabaseLogs();
  }, []);

  // Option 1: Handle File Processing Route Pathway
  const handleFile = useCallback(async (file: File) => {
    setState("uploading");
    setErrorMsg("");
    setReport(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("sourceType", "file");
    formData.append("timeframeType", "all"); 

    try {
      setState("analyzing");
      
      const res = await fetch("/api/analyze", { 
        method: "POST", 
        body: formData 
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setReport(data as AnalysisReport);
      setState("done");
      
      fetchSupabaseLogs();
    } catch (err: any) {
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setState("error");
    }
  }, []);

  // Option 2: Fetch and Trace Direct Supabase Table Entries Path
  const handleDatabaseAnalysis = async () => {
    setState("analyzing");
    setErrorMsg("");
    setReport(null);

    const jsonPayload: Record<string, string> = {
      sourceType: "database",
      timeframeType: "all"
    };

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(jsonPayload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Database anomaly analysis extraction failed");
      
      setReport(data as AnalysisReport);
      setState("done");
    } catch (err: any) {
      setErrorMsg(err instanceof Error ? err.message : "Unknown database parsing error");
      setState("error");
    }
  };

  // FIXED: Synchronized with /api/cron GET architecture to generate and email the PDF layout automatically
  const handleEmailAdmin = async () => {
    setEmailStatus("loading");
    try {
      const secret = "mySuperSecretHSAssistKey2026!";
      console.log("Triggering automated secure email ledger broadcast pipeline...");
      
      // Requesting a clean GET execution sequence on the cron endpoint 
      const response = await fetch(`/api/cron?secret=${secret}`, {
        method: "GET"
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        console.log("Email package compiled and delivered cleanly by mail proxy.");
        setEmailStatus("success");
      } else {
        console.error("Backend pipeline reported processing error flags:", data?.error);
        setEmailStatus("error");
      }
    } catch (error) {
      console.error("Failed to trigger report broadcast dispatch sequence:", error);
      setEmailStatus("error");
    } finally {
      setTimeout(() => {
        setEmailStatus("idle");
      }, 5000);
    }
  };

  const handleReset = () => {
    setState("idle");
    setReport(null);
    setErrorMsg("");
    setEmailStatus("idle");
  };

  return (
    <main className="relative min-h-screen text-black bg-neutral-50/50">
      {/* FLUID FULL-WIDTH HEADER */}
      <header className="sticky top-0 z-30 w-full border-b border-orange-100 bg-white/70 backdrop-blur-xl">
        <div className="w-full flex items-center justify-between px-6 py-4 sm:px-10">
          
          {/* SECURE CONTAINER: Defends parent position layouts against scaling visual shifts */}
          <div 
            className="relative shrink-0 block"
            style={{ position: 'relative', width: '208px', height: '48px', minWidth: '208px' }}
          >
            <Image 
              src="/logo.jpg" 
              alt="ValueHealth Logo" 
              fill
              priority
              sizes="208px"
              style={{ objectFit: 'contain', objectPosition: 'left' }}
              className="scale-150 origin-left"
            />
          </div>

          {state === "done" && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleEmailAdmin}
                disabled={emailStatus === "loading"}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold shadow-sm transition-all ${
                  emailStatus === "success" ? "bg-green-500 text-white" :
                  emailStatus === "error" ? "bg-rose-500 text-white" :
                  "bg-orange-600 text-white hover:bg-orange-700"
                } ${emailStatus === "loading" ? "opacity-70 cursor-not-allowed" : ""}`}
              >
                {emailStatus === "idle" && (
                  <>
                    <svg className="h-4 w-4" style={{ width: '16px', height: '16px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Email Admin
                  </>
                )}
                {emailStatus === "loading" && "⏳ Sending..."}
                {emailStatus === "success" && "✅ Sent!"}
                {emailStatus === "error" && "❌ Failed"}
              </button>

              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-bold text-black shadow-sm transition-colors hover:bg-neutral-50"
              >
                <svg className="h-4 w-4 text-black" style={{ width: '16px', height: '16px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                New Analysis
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Workspace Dashboard Grid Layout */}
      <div className="mx-auto max-w-6xl px-6">
        <AnimatePresence mode="wait">
          {(state === "idle" || state === "error") && (
            <motion.div
              key="intro"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-10 py-12"
            >
              <section className="text-center space-y-4">
                <motion.p
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="inline-block rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-bold text-orange-800 shadow-sm"
                >
                  AI-powered · cell-level precision · RAG assistant
                </motion.p>
                <motion.h2
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.05 }}
                  className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-black sm:text-6xl"
                >
                  Catch every loyalty data <span className="text-gradient">anomaly</span>, down to the cell.
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.12 }}
                  className="mx-auto max-w-xl text-base font-bold text-black/70"
                >
                  Analyze your Master Tables across dynamic automated execution footprints from uploaded streams or databases.
                </motion.p>
              </section>

              {/* INGESTION INTERFACE ROUTE OPTIONS SELECTOR */}
              <div className="flex justify-center max-w-2xl mx-auto">
                <div className="grid w-full grid-cols-2 p-1 bg-neutral-100 rounded-xl border border-neutral-200/60">
                  <button
                    onClick={() => setSourceType("file")}
                    className={`py-2.5 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                      sourceType === "file" 
                        ? "bg-white text-orange-700 shadow-sm border border-neutral-200/40" 
                        : "text-neutral-500 hover:text-neutral-800"
                    }`}
                  >
                    📁 Upload CSV Dataset
                  </button>
                  <button
                    onClick={() => setSourceType("database")}
                    className={`py-2.5 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                      sourceType === "database" 
                        ? "bg-white text-orange-700 shadow-sm border border-neutral-200/40" 
                        : "text-neutral-500 hover:text-neutral-800"
                    }`}
                  >
                    🗄️ Fetch Live Supabase Tables
                  </button>
                </div>
              </div>

              {/* LIVE SUPABASE MONITORING PANEL */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15 }}
                className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm max-w-4xl mx-auto"
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-sm font-black text-neutral-800">⚡ Supabase Execution Log Streams</h4>
                    <p className="text-xs font-semibold text-neutral-400 mt-0.5">Direct connection to synchronized platform activity metrics.</p>
                  </div>
                  <button 
                    onClick={fetchSupabaseLogs}
                    className="p-1.5 hover:bg-neutral-100 rounded-lg text-xs font-bold transition-colors border border-neutral-200"
                  >
                    🔄 Refresh
                  </button>
                </div>

                {dbLoading && <p className="text-xs font-bold text-orange-600 animate-pulse">Syncing active database partitions...</p>}
                {dbError && <p className="text-xs font-bold text-rose-600">Error reading tables: {dbError}</p>}
                
                {!dbLoading && !dbError && (
                  <div className="overflow-x-auto rounded-xl border border-neutral-100">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 uppercase font-black tracking-wider text-[10px]">
                          <th className="p-3">ID</th>
                          <th className="p-3">Scheduler Process</th>
                          <th className="p-3">Matched Records</th>
                          <th className="p-3">Run Date</th>
                          <th className="p-3">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbLogs.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-4 text-center text-neutral-400 font-semibold">No records found. Check RLS public select permissions.</td>
                          </tr>
                        ) : (
                          dbLogs.map((log) => (
                            <tr key={log.id} className="border-b border-neutral-100 hover:bg-neutral-50/50 font-medium">
                              <td className="p-3 font-mono text-neutral-400">{log.id}</td>
                              <td className="p-3 font-bold text-neutral-800">{log.scheduler}</td>
                              <td className="p-3 text-neutral-600">{log.record_count}</td>
                              <td className="p-3 text-neutral-500">{log.run_date}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                  log.status === "Success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"
                                }`}>
                                  {log.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.18 }}
                className="glass rounded-3xl p-6 shadow-sm border border-neutral-200"
              >
                <h3 className="mb-4 text-xs font-black uppercase tracking-wider text-black/60">Checks performed during verification run</h3>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {CHECKS.map((c) => (
                    <div key={c.id} className="flex items-start gap-2.5">
                      <span className="mt-0.5 shrink-0 rounded-md bg-orange-500 px-1.5 py-0.5 font-mono text-[11px] font-black text-white">
                        {c.id}
                      </span>
                      <span className="text-sm font-semibold text-black">{c.label}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* DYNAMIC PROCESSING UI PANELS */}
              <div className="space-y-4 text-center max-w-xl mx-auto">
                <span className="text-xs font-black text-neutral-400 uppercase tracking-wider block">
                  Trigger Evaluation Check Sequence
                </span>
                
                {sourceType === "file" ? (
                  <UploadZone onFile={handleFile} />
                ) : (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={handleDatabaseAnalysis}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-600 to-orange-500 px-6 py-4 font-black text-sm text-white shadow-md hover:from-orange-700 hover:to-orange-600 active:scale-[0.99] transition-all border border-orange-700/20"
                  >
                    <span>🔍 Execute Real-time DB Anomaly Verification</span>
                  </motion.button>
                )}
              </div>

              {state === "error" && (
                <div className="flex items-start gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-4 shadow-sm max-w-xl mx-auto">
                  <svg className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" style={{ width: '20px', height: '20px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <p className="text-sm font-black text-rose-900">Analysis failed</p>
                    <p className="mt-0.5 text-sm font-bold text-rose-800">{errorMsg}</p>
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
                <div className="absolute inset-0 animate-spin rounded-full border-2 border-orange-500/20 border-t-orange-600" />
                <div className="absolute inset-2 animate-pulse rounded-full bg-orange-500/10" />
              </div>
              <div className="text-center">
                <p className="text-sm font-black text-black">
                  {state === "uploading" ? "Uploading file…" : "Running anomaly checks…"}
                </p>
                <p className="mt-1 text-xs font-bold text-black/60">
                  {sourceType === "file" 
                    ? "Isolating audit records using automated baseline detection." 
                    : "Fetching partitions directly from active Supabase instances."}
                </p>
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