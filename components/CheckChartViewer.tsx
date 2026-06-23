"use client";

import React, { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis, ReferenceLine
} from "recharts";
import type { SheetMapping } from "@/types";

interface ChartViewerProps {
  checkId: string;
  sheets: any; // Raw dynamic sheets data passed from frontend upload state
  check: any;  // Anomaly check payload metadata containing status and issues count
  sheetMapping?: SheetMapping;
}

const normalizeSheetKey = (key: string) => String(key).trim().toLowerCase().replace(/[_\s-]+/g, "");

function sheetHasHeaders(rows: any[], headers: string[]): boolean {
  if (!rows.length || typeof rows[0] !== "object") return false;
  const keys = Object.keys(rows[0]).map((k) => String(k).trim().toLowerCase());
  return headers.some((header) => keys.includes(header.toLowerCase()));
}

export default function CheckChartViewer({ checkId, sheets, check, sheetMapping }: ChartViewerProps) {
  // Client default is a high-level simplified health snapshot to prevent confusion
  const [viewMode, setViewMode] = useState<"simplified" | "detailed">("simplified");

  const findSheetRows = (names: string[], headerFallback: string[] = []) => {
    if (!sheets || typeof sheets !== "object") {
      return { rows: [] as any[], sourceSheetName: null };
    }

    const normalizedNames = names.map(normalizeSheetKey);
    const sheetEntries = Object.entries(sheets)
      .filter(([, value]) => Array.isArray(value)) as [string, any][];

    // 1) Direct exact key match, prefer non-empty sheets first
    for (const name of names) {
      if (Object.prototype.hasOwnProperty.call(sheets, name) && Array.isArray(sheets[name]) && sheets[name].length > 0) {
        return { rows: sheets[name], sourceSheetName: name };
      }
    }
    for (const name of names) {
      if (Object.prototype.hasOwnProperty.call(sheets, name) && Array.isArray(sheets[name])) {
        return { rows: sheets[name], sourceSheetName: name };
      }
    }

    // 2) Normalized name match, prefer non-empty sheets first
    for (const [key, value] of sheetEntries) {
      const normalizedKey = normalizeSheetKey(key);
      if (normalizedNames.includes(normalizedKey) && value.length > 0) {
        return { rows: value, sourceSheetName: key };
      }
    }
    for (const [key, value] of sheetEntries) {
      const normalizedKey = normalizeSheetKey(key);
      if (normalizedNames.includes(normalizedKey)) {
        return { rows: value, sourceSheetName: key };
      }
    }

    // 3) Partial human-friendly name match (e.g. order / line / item, scheduler / logs)
    for (const [key, value] of sheetEntries) {
      const normalizedKey = normalizeSheetKey(key);
      if ((normalizedKey.includes("order") && normalizedKey.includes("line") && normalizedKey.includes("item")) && value.length > 0) {
        return { rows: value, sourceSheetName: key };
      }
      if ((normalizedKey.includes("scheduler") && normalizedKey.includes("log")) && value.length > 0) {
        return { rows: value, sourceSheetName: key };
      }
    }
    for (const [key, value] of sheetEntries) {
      const normalizedKey = normalizeSheetKey(key);
      if (normalizedKey.includes("order") && normalizedKey.includes("line") && normalizedKey.includes("item")) {
        return { rows: value, sourceSheetName: key };
      }
      if (normalizedKey.includes("scheduler") && normalizedKey.includes("log")) {
        return { rows: value, sourceSheetName: key };
      }
    }

    // 4) Header-based fallback
    if (headerFallback.length > 0) {
      for (const [key, value] of sheetEntries) {
        if (sheetHasHeaders(value, headerFallback)) {
          return { rows: value, sourceSheetName: key };
        }
      }
    }

    // 5) Fallback to the first valid array sheet
    if (sheetEntries.length > 0) {
      return { rows: sheetEntries[0][1], sourceSheetName: sheetEntries[0][0] };
    }

    return { rows: [] as any[], sourceSheetName: null };
  };

  const { rows: oliRows, sourceSheetName } = useMemo<{ rows: any[]; sourceSheetName: string | null }>(
    () => findSheetRows([
      "Order_line_item",
      "Order_Line_Item",
      "order_line_item",
      "Order Line Item",
      "Order_line_item",
      "OLI"
    ], ["order_line_step_code", "points_left_to_redeem", "total_redeemable_points"]),
    [sheets]
  );

  const { rows: mpcRows } = useMemo<{ rows: any[] }>(
    () => findSheetRows([
      "mpc",
      "MPC",
      "Mpc"
    ], ["product_primary_class_id", "redemption_percentage"]),
    [sheets]
  );

  const { rows: schedRows } = useMemo<{ rows: any[] }>(
    () => findSheetRows([
      "scheduler_logs",
      "Scheduler_logs",
      "scheduler logs",
      "Scheduler Logs",
      "Scheduler"
    ], ["scheduler", "record_count", "run_date"]),
    [sheets]
  );

  const availableSheetNames = sheets && typeof sheets === "object" ? Object.keys(sheets) : [];

  if (!oliRows.length) {
    return (
      <div className="text-xs text-neutral-400 p-4 italic bg-neutral-50 rounded-xl border border-neutral-200">
        📊 No chart data found for the report sheets.
        {availableSheetNames.length > 0 && (
          <div className="mt-2 text-[11px] text-neutral-500">
            Recognized sheets: {availableSheetNames.join(", ")}.
          </div>
        )}
        {sourceSheetName && (
          <div className="mt-2 text-[11px] text-orange-600">
            Sheet fallback used: {sourceSheetName} (no rows matched expected headers for Order Line Item).
          </div>
        )}
      </div>
    );
  }

  const totalRows = oliRows.length;
  const anomalyRows = Number(check?.count ?? 0);
  const healthyRows = Math.max(0, totalRows - anomalyRows);
  const isPassing = check?.status?.toUpperCase() === "PASS" || anomalyRows === 0;

  // ==========================================
  // VIEW MODE 1: CLIENT SIMPLIFIED HEALTH STATE
  // ==========================================
  if (viewMode === "simplified") {
    const summaryData = [
      { name: "Healthy Verified Records", count: healthyRows, fill: "#10b981" },
      { name: "Anomalies Flagged", count: anomalyRows, fill: "#ef4444" }
    ];

    return (
      <div className="w-full" data-pdf-safe="true"> {/* 🔥 Wrap the chart container */}
        <div className="space-y-4">
          {/* Toggle Panel Header */}
          <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Executive Health Overview</span>
            </div>
            <button 
              onClick={() => setViewMode("detailed")}
              className="text-xs px-3 py-1.5 font-semibold bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg transition shadow-sm"
            >
              Switch to Technical Analytics View ➔
            </button>
          </div>

          {/* Executive Quick-Read Status Card */}
          <div className={`p-4 rounded-xl border flex items-center justify-between ${isPassing ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
            <div className="space-y-0.5">
              <h4 className="text-sm font-bold flex items-center gap-1.5">
                {isPassing ? "✓ Data Sync Validated" : "⚠️ Discrepancies Detected"}
              </h4>
              <p className="text-xs opacity-90 leading-relaxed">
                {isPassing 
                  ? `Successfully cross-referenced all ${totalRows} entries with zero computation faults found.` 
                  : `Identified ${anomalyRows} active outliers out of ${totalRows} target database entries.`}
              </p>
            </div>
            <div className="text-right pl-4">
              <span className="block text-2xl font-black leading-none">{((healthyRows / totalRows) * 100).toFixed(1)}%</span>
              <span className="text-[10px] font-medium uppercase tracking-wider opacity-75">Pass Rate</span>
            </div>
          </div>

          {/* High Level Pure Distribution Chart */}
          <div className="h-[200px] w-full bg-white p-4 border border-neutral-200 rounded-xl">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summaryData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#4b5563', fontWeight: 500 }} label={{ value: 'Record Type', position: 'insideBottom', offset: -5, fill: '#475569', fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} label={{ value: 'Records', angle: -90, position: 'insideLeft', offset: 0, fill: '#475569', fontSize: 11 }} />
                <Tooltip cursor={{ fill: '#f8fafc' }} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} iconType="circle" />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={45}>
                  {summaryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW MODE 2: DETAILED RULE SPECIFIC STATE
  // ==========================================
  return (
    <div className="w-full" data-pdf-safe="true"> {/* 🔥 Wrap the chart container */}
      <div className="space-y-4">
        {/* Toggle Panel Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
          <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Detailed Diagnostic View (Rule {checkId})</span>
          <button 
            onClick={() => setViewMode("simplified")}
            className="text-xs px-3 py-1.5 font-semibold bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg transition"
          >
            ➔ Back to Executive Summary
          </button>
        </div>

        {/* Dynamic Rule Implementation Switches */}
        {(() => {
          switch (checkId) {
            
            case "C1": {
              const targetFields = ["order_line_number", "order_line_step_code", "points_left_to_redeem", "total_redeemable_points", "load_date"];
              const chartData = targetFields.map(field => {
                const validCount = oliRows.filter(r => r[field] !== null && r[field] !== undefined && String(r[field]).trim() !== "").length;
                return {
                  "Database Attribute": field.replace(/_/g, " "),
                  "Populated Records": validCount,
                  "Missing Fields Anomaly": totalRows - validCount
                };
              });

              return (
                <div className="space-y-3">
                  <div className="h-[250px] w-full bg-white p-4 border border-neutral-200 rounded-xl">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="Database Attribute" tick={{ fontSize: 10, fill: '#64748b' }} label={{ value: 'Attribute', position: 'insideBottom', offset: -5, fill: '#475569', fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} label={{ value: 'Row Count', angle: -90, position: 'insideLeft', offset: 0, fill: '#475569', fontSize: 11 }} />
                        <Tooltip cursor={{ fill: '#f8fafc' }} />
                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} iconType="circle" />
                        <Bar dataKey="Populated Records" stackId="integrity" fill="#10b981" barSize={30} />
                        <Bar dataKey="Missing Fields Anomaly" stackId="integrity" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={30} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-neutral-500 bg-neutral-50 p-3 rounded-lg border border-neutral-100">
                    <strong>Rule C1 Metric Blueprint:</strong> Outlines attribute density profiles across {totalRows} rows. Look for red blocks to locate fields missing core parameters.
                  </p>
                </div>
              );
            }

            case "C2": {
              const mpcMap: Record<string, number> = {};
              mpcRows.forEach(row => {
                const id = String(row["product_primary_class_id"] ?? "").trim();
                const pct = Number(row["redemption_percentage"] ?? 0);
                if (id) mpcMap[id] = pct;
              });

              const processedLines = oliRows.map((row, idx) => {
                const classId = String(row["product_primary_class_id"] ?? "").trim();
                const pct = mpcMap[classId] ?? 0;
                const sales = Number(row["extended_sales_amount"] ?? 0);
                const systemPoints = Number(row["total_redeemable_points"] ?? 0);
                const calculatedPoints = Math.floor(((sales * pct / 100) / 0.005));
                return {
                  id: `Ln ${idx + 1}`,
                  "System Value": systemPoints,
                  "MPC Expected Value": calculatedPoints,
                  hasAnomaly: systemPoints !== calculatedPoints
                };
              });

              const displaySnapshot = processedLines.slice(0, 25);

              return (
                <div className="space-y-3">
                  <div className="h-[250px] w-full bg-white p-4 border border-neutral-200 rounded-xl">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={displaySnapshot} margin={{ top: 10, right: 15, left: -10, bottom: 5 }}>
                        <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
                        <XAxis dataKey="id" tick={{ fontSize: 10 }} label={{ value: 'Line Record', position: 'insideBottom', offset: -5, fill: '#475569', fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 10 }} label={{ value: 'Amount', angle: -90, position: 'insideLeft', offset: -5, fill: '#475569', fontSize: 11 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} iconType="circle" />
                        <Line type="monotone" dataKey="System Value" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 2 }} />
                        <Line type="monotone" dataKey="MPC Expected Value" stroke="#ea580c" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-neutral-500 bg-neutral-50 p-3 rounded-lg border border-neutral-100">
                    <strong>Rule C2 Metric Blueprint:</strong> Compares systemic values with manual product margin calculations. Variances between lines flag live calculation anomalies.
                  </p>
                </div>
              );
            }

            case "C3": {
              const distribution: Record<string, number> = {};
              oliRows.forEach(r => {
                const code = String(r["order_line_step_code"] ?? "UNASSIGNED").trim().toUpperCase();
                distribution[code] = (distribution[code] || 0) + 1;
              });
              const chartData = Object.entries(distribution).map(([name, value]) => ({ name, value }));
              const COLOR_PALETTE = ["#2563eb", "#10b981", "#f59e0b", "#d97706", "#7c3aed", "#db2777"];

              return (
                <div className="space-y-3">
                  <div className="h-[260px] w-full bg-white flex flex-col items-center justify-center border border-neutral-200 rounded-xl p-4">
                    <ResponsiveContainer width="100%" height="80%">
                      <PieChart>
                        <Pie 
                          data={chartData} 
                          cx="50%" 
                          cy="50%" 
                          innerRadius={50} 
                          outerRadius={75} 
                          paddingAngle={5} 
                          dataKey="value" 
                          label={(props: any) => `${props.name}: ${props.value}`}
                          labelLine={true}
                        >
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLOR_PALETTE[index % COLOR_PALETTE.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] font-medium text-neutral-500 overflow-y-auto max-h-[20%] pt-2">
                      {chartData.map((entry, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLOR_PALETTE[idx % COLOR_PALETTE.length] }} />
                          <span>{entry.name} ({((entry.value / totalRows) * 100).toFixed(1)}%)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-neutral-500 bg-neutral-50 p-3 rounded-lg border border-neutral-100">
                    <strong>Rule C3 Metric Blueprint:</strong> Breaks down document distribution across existing step codes to check pipeline processing consistency.
                  </p>
                </div>
              );
            }

            case "C4": {
              const chartData = oliRows.map((row, idx) => {
                const systemPLTR = Number(row["points_left_to_redeem"] ?? 0);
                const total = Number(row["total_redeemable_points"] ?? 0);
                const redeemed = Number(row["points_redeemed"] ?? 0);
                const manualCalculated = total - redeemed;
                
                return { 
                  CalculatedValue: manualCalculated, 
                  SystemValue: systemPLTR, 
                  recordId: `Row ${idx + 1}`
                };
              });

              const displayScatterData = chartData.slice(0, 50);
              const maxVal = Math.max(...displayScatterData.map(d => Math.max(d.CalculatedValue, d.SystemValue)), 100);

              return (
                <div className="space-y-3">
                  <div className="h-[280px] w-full bg-white p-4 border border-neutral-200 rounded-xl">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 15, right: 15, left: -15, bottom: 15 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis type="number" dataKey="CalculatedValue" domain={[0, maxVal]} name="Calculated (Total - Redeemed)" tick={{ fontSize: 10 }} label={{ value: 'Manual Balance Calculation', position: 'bottom', offset: -5, fontSize: 10, fill: '#4b5563' }} />
                        <YAxis type="number" dataKey="SystemValue" domain={[0, maxVal]} name="System Logged Value" tick={{ fontSize: 10 }} label={{ value: 'System Balance Field', angle: -90, position: 'insideLeft', offset: -5, fontSize: 10, fill: '#4b5563' }} />
                        <ZAxis dataKey="recordId" name="Source Record" />
                        <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                        <Legend wrapperStyle={{ fontSize: 11, paddingBottom: 10 }} verticalAlign="top" iconType="circle" />
                        
                        <ReferenceLine segment={[{ x: 0, y: 0 }, { x: maxVal, y: maxVal }]} stroke="#94a3b8" strokeDasharray="3 3" strokeWidth={1.5} label={{ value: 'Perfect Axis', fill: '#94a3b8', fontSize: 9, position: 'insideTopLeft' }} />
                        
                        <Scatter name="Row Coordination Plots" data={displayScatterData} fill="#7c3aed" />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-neutral-500 bg-neutral-50 p-3 rounded-lg border border-neutral-100">
                    <strong>Rule C4 Metric Blueprint:</strong> Verifies remaining balances. Points plotted away from the center diagonal validation line highlight active tracking mismatches.
                  </p>
                </div>
              );
            }

            case "C8": {
              const countedEligibleFromFile = oliRows.filter(r => r["date_of_transaction"] !== null && String(r["date_of_transaction"]).trim() !== "").length;
              const targetLogEntry = schedRows.find(r => String(r["scheduler"] ?? "").includes("Calc_of_points"));
              const loggedCountFromLogs = targetLogEntry ? Number(targetLogEntry["record_count"] ?? targetLogEntry["mapped_count"] ?? 0) : 0;

              const chartData = [
                { name: "Scheduler Log Target", "Expected Audited Records": loggedCountFromLogs },
                { name: "File Row Count", "Actual Parsed Records": countedEligibleFromFile }
              ];

              const matchesPerfectly = loggedCountFromLogs === countedEligibleFromFile;

              return (
                <div className="space-y-3">
                  <div className="h-[240px] w-full bg-white p-4 border border-neutral-200 rounded-xl">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 15, right: 10, left: -15, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: "bold" }} label={{ value: 'Metric', position: 'insideBottom', offset: -5, fill: '#475569', fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 10 }} label={{ value: 'Value', angle: -90, position: 'insideLeft', offset: 0, fill: '#475569', fontSize: 11 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} iconType="circle" />
                        <Bar dataKey="Expected Audited Records" fill="#3b82f6" barSize={45} radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Actual Parsed Records" fill={matchesPerfectly ? "#10b981" : "#ef4444"} barSize={45} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-neutral-500 bg-neutral-50 p-3 rounded-lg border border-neutral-100">
                    <strong>Rule C8 Metric Blueprint:</strong> Audits systemic transaction ingestion continuity. Unequal heights denote that lines were dropped during transmission.
                  </p>
                </div>
              );
            }

            case "C9": {
              const counts: Record<string, number> = {};
              oliRows.forEach(r => {
                const dateStr = r["load_date"] ? String(r["load_date"]).split("T")[0].trim() : "No Date Data";
                counts[dateStr] = (counts[dateStr] || 0) + 1;
              });
              
              const chartData = Object.entries(counts)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([date, count]) => ({ date, "Ingested Row Volume": count }));
              
              return (
                <div className="space-y-3">
                  <div className="h-[240px] w-full bg-white p-4 border border-neutral-200 rounded-xl">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} label={{ value: 'Date', position: 'insideBottom', offset: -5, fill: '#475569', fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 10 }} label={{ value: 'Volume', angle: -90, position: 'insideLeft', offset: 0, fill: '#475569', fontSize: 11 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} iconType="circle" />
                        <Bar dataKey="Ingested Row Volume" fill="#db2777" radius={[4, 4, 0, 0]} barSize={25} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-neutral-500 bg-neutral-50 p-3 rounded-lg border border-neutral-100">
                    <strong>Rule C9 Metric Blueprint:</strong> Tracks document velocity profiles chronologically by ingestion date.
                  </p>
                </div>
              );
            }

            default: {
              const activeRows = oliRows.filter(r => r["date_of_transaction"] && String(r["date_of_transaction"]).trim() !== "").length;
              const chartData = [
                { name: "Total Rows Ingested", "Execution Row Split": totalRows, fill: "#4b5563" },
                { name: "Eligible Transactions", "Execution Row Split": activeRows, fill: "#2563eb" },
                { name: "Ineligible Null State", "Execution Row Split": totalRows - activeRows, fill: "#ea580c" }
              ];
              
              return (
                <div className="space-y-3">
                  <div className="h-[240px] w-full bg-white p-4 border border-neutral-200 rounded-xl">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 15, right: 10, left: -15, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} label={{ value: 'Metric', position: 'insideBottom', offset: -5, fill: '#475569', fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 10 }} label={{ value: 'Count', angle: -90, position: 'insideLeft', offset: 0, fill: '#475569', fontSize: 11 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} iconType="circle" />
                        <Bar dataKey="Execution Row Split" radius={[4, 4, 0, 0]} barSize={40}>
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-neutral-500 bg-neutral-50 p-3 rounded-lg border border-neutral-100">
                    <strong>System Validation Metric Blueprint:</strong> Displays data-split volumes parsed from the active matrix.
                  </p>
                </div>
              );
            }
          }
        })()}
      </div>
    </div>
  );
}