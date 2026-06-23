"use client";

import { useState, useEffect, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { AnalysisReport, AnomalyDetail, AnomalyResult, ExplainResponse, SheetMapping } from "@/types";
import AnimatedCounter from "@/components/AnimatedCounter";
import CheckChartViewer from "./CheckChartViewer";

interface Props {
  report: AnalysisReport & { rawSheetsData?: any };
}

type Filter = "all" | "fail" | "pass" | "info";

type CustomFilter = { id: string; label: string; query: string };

export default function ReportView({ report }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [mounted, setMounted] = useState(false); // ✅ Fixed typo here
  const [exportStatus, setExportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [exportMessage, setExportMessage] = useState('');
  const [selectedSheet, setSelectedSheet] = useState<string>('all');
  const [sheetMapping, setSheetMapping] = useState<SheetMapping>({});
  const [baselineSummary, setBaselineSummary] = useState<AnalysisReport['summary'] | null>(null);
  const [customFilterQuery, setCustomFilterQuery] = useState('');
  const [customFilters, setCustomFilters] = useState<CustomFilter[]>([]);
  const [activeCustomFilterId, setActiveCustomFilterId] = useState<string | null>(null);
  const [boardSnapshotStatus, setBoardSnapshotStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [boardSnapshotMessage, setBoardSnapshotMessage] = useState('');

  // Track client mounting to handle portal injection smoothly
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const raw = window.localStorage.getItem('hsassist_previous_summary');
      if (raw) {
        try {
          setBaselineSummary(JSON.parse(raw));
        } catch (error) {
          console.warn('Failed to parse previous summary', error);
        }
      }

      const savedState = window.localStorage.getItem('hsassist_report_state');
      if (savedState) {
        try {
          const parsed = JSON.parse(savedState);
          setFilter(parsed.filter ?? 'all');
          setSelectedSheet(parsed.selectedSheet ?? 'all');
          setSheetMapping(parsed.sheetMapping ?? {});
          setCustomFilters(parsed.customFilters ?? []);
          setActiveCustomFilterId(parsed.activeCustomFilterId ?? null);
        } catch (error) {
          console.warn('Failed to parse saved report state', error);
        }
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('hsassist_previous_summary', JSON.stringify(report.summary));
      window.localStorage.setItem('hsassist_report_state', JSON.stringify({
        filter,
        selectedSheet,
        sheetMapping,
        customFilters,
        activeCustomFilterId,
      }));
    }
  }, [report.summary, filter, selectedSheet, sheetMapping, customFilters, activeCustomFilterId]);

  const matchesCustomFilter = (check: AnomalyResult, query: string) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;
    if (check.checkName.toLowerCase().includes(normalizedQuery)) return true;
    if (check.checkId.toLowerCase().includes(normalizedQuery)) return true;
    if (check.description?.toLowerCase().includes(normalizedQuery)) return true;
    if (check.message?.toLowerCase().includes(normalizedQuery)) return true;
    if (check.details?.some((detail) =>
      String(detail.issue ?? '').toLowerCase().includes(normalizedQuery) ||
      String(detail.field ?? '').toLowerCase().includes(normalizedQuery) ||
      String(detail.value ?? '').toLowerCase().includes(normalizedQuery)
    )) return true;
    return false;
  };

  const addCustomFilter = () => {
    const trimmed = customFilterQuery.trim();
    if (!trimmed) return;
    const newFilter: CustomFilter = {
      id: `custom-filter-${Date.now()}`,
      label: trimmed.length > 24 ? `${trimmed.slice(0, 24)}...` : trimmed,
      query: trimmed,
    };
    setCustomFilters((prev) => [newFilter, ...prev]);
    setActiveCustomFilterId(newFilter.id);
    setCustomFilterQuery('');
  };

  const removeCustomFilter = (filterId: string) => {
    setCustomFilters((prev) => prev.filter((item) => item.id !== filterId));
    if (activeCustomFilterId === filterId) {
      setActiveCustomFilterId(null);
    }
  };

  const getBoardSnapshotText = () => {
    const activeFilter = customFilters.find((item) => item.id === activeCustomFilterId);
    const topIssue = report.checks.find((check) => check.status === 'fail') ?? report.checks.find((check) => check.status === 'warning');
    const summaryLines = [
      `Board-Ready Snapshot: ${report.filename}`,
      `Run Date: ${new Date(report.runDate).toLocaleString()}`,
      `Total Checks: ${report.summary.total}`,
      `Passed: ${report.summary.passed}`,
      `Failed: ${report.summary.failed}`,
      `Warnings: ${report.summary.warnings}`,
      `Top Issue Focus: ${topIssue?.checkName ?? 'No critical issues found'}`,
    ];

    if (activeFilter) {
      summaryLines.push(`Active Filter: ${activeFilter.label}`);
    }

    const topIssues = report.checks
      .filter((check) => check.status !== 'pass')
      .slice(0, 3)
      .map((check) => `- ${check.checkName} (${check.status})`);

    if (topIssues.length) {
      summaryLines.push('Top Issues:');
      summaryLines.push(...topIssues);
    }

    return summaryLines.join('\n');
  };

  const copyBoardSnapshot = async () => {
    try {
      await navigator.clipboard.writeText(getBoardSnapshotText());
      setBoardSnapshotStatus('success');
      setBoardSnapshotMessage('Board-ready snapshot copied to clipboard.');
    } catch (error: any) {
      setBoardSnapshotStatus('error');
      setBoardSnapshotMessage(error?.message || 'Failed to copy board-ready snapshot.');
    } finally {
      window.setTimeout(() => setBoardSnapshotStatus('idle'), 5000);
    }
  };

  const downloadBoardSnapshot = () => {
    const blob = new Blob([getBoardSnapshotText()], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Board_Ready_Snapshot_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    setBoardSnapshotStatus('success');
    setBoardSnapshotMessage('Board-ready snapshot downloaded.');
    window.setTimeout(() => setBoardSnapshotStatus('idle'), 5000);
  };

  const downloadReportPdf = async () => {
    if (!report?.checks?.length) {
      setExportStatus('error');
      setExportMessage('No report data is available to export.');
      return;
    }

    setExportStatus('loading');
    setExportMessage('Generating PDF...');

    try {
      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checks: report.checks }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'PDF generation failed.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `Data_Quality_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      setExportStatus('success');
      setExportMessage('PDF generated and downloaded successfully.');
    } catch (error: any) {
      setExportStatus('error');
      setExportMessage(error?.message || 'Failed to generate PDF.');
    } finally {
      window.setTimeout(() => setExportStatus('idle'), 5000);
    }
  };

  const downloadAnomalyCsv = () => {
    const csvHeader = [
      'Check ID',
      'Check Name',
      'Status',
      'Row',
      'Sheet',
      'Field',
      'Cell',
      'Bad Value',
      'Issue'
    ];

    const rows = [csvHeader.join(',')];

    report.checks.forEach((check) => {
      if (!check.details?.length) return;
      check.details.forEach((detail) => {
        const row = [
          check.checkId,
          `"${check.checkName.replace(/"/g, '""')}"`,
          check.status,
          detail.rowIndex ?? '',
          detail.sheet ?? '',
          detail.field ?? '',
          detail.cellRef ?? '',
          typeof detail.value === 'string' ? `"${detail.value.replace(/"/g, '""')}"` : detail.value ?? '',
          `"${String(detail.issue ?? '').replace(/"/g, '""')}"`
        ];
        rows.push(row.join(','));
      });
    });

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Data_Quality_Anomalies_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    setExportStatus('success');
    setExportMessage('Anomaly CSV exported successfully.');
    window.setTimeout(() => setExportStatus('idle'), 5000);
  };

  const copyReportSnapshot = async () => {
    try {
      const payload = {
        filename: report.filename,
        runDate: report.runDate,
        summary: report.summary,
        sheetMapping,
        checks: report.checks.map((check) => ({
          checkId: check.checkId,
          checkName: check.checkName,
          status: check.status,
          count: check.count,
          total: check.total,
        })),
      };

      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setExportStatus('success');
      setExportMessage('Report snapshot copied to clipboard.');
    } catch (error: any) {
      setExportStatus('error');
      setExportMessage(error?.message || 'Failed to copy snapshot.');
    } finally {
      window.setTimeout(() => setExportStatus('idle'), 5000);
    }
  };

  const activeCustomFilter = customFilters.find((item) => item.id === activeCustomFilterId);

  const filtered = report.checks.filter((c) => {
    if (filter === "fail" && c.status !== "fail") return false;
    if (filter === "pass" && c.status !== "pass") return false;
    if (filter === "info" && !(c.status === "warning" || c.status === "info")) return false;
    if (activeCustomFilter && activeCustomFilter.query) {
      return matchesCustomFilter(c, activeCustomFilter.query);
    }
    return true;
  });

  const filteredBySheet = selectedSheet === 'all'
    ? filtered
    : filtered.filter((c) => c.details?.some((d) => d.sheet === selectedSheet));

  const baselineDelta = baselineSummary ? {
    passed: report.summary.passed - baselineSummary.passed,
    failed: report.summary.failed - baselineSummary.failed,
    warnings: report.summary.warnings - baselineSummary.warnings,
  } : null;

  const sheetHeatmap = report.sheetsFound.map((sheet) => {
    const sheetCounts = report.checks.reduce(
      (acc, check) => {
        const matchingDetails = check.details?.filter((detail) => detail.sheet === sheet) ?? [];
        if (!matchingDetails.length) return acc;
        acc.total += matchingDetails.length;
        if (check.status === 'fail') acc.failed += matchingDetails.length;
        if (check.status === 'warning') acc.warnings += matchingDetails.length;
        if (check.status === 'info') acc.info += matchingDetails.length;
        return acc;
      },
      { sheet, total: 0, failed: 0, warnings: 0, info: 0 }
    );

    return {
      ...sheetCounts,
      density: sheetCounts.total / Math.max(1, report.summary.total),
    };
  });

  const topIssue = filteredBySheet.find((check) => check.status === 'fail')
    || filteredBySheet.find((check) => check.status === 'warning')
    || filteredBySheet[0];

  const executiveSummary = `This report scanned ${report.summary.total} checks across ${report.sheetsFound.length} sheets, finding ${report.summary.failed} failures and ${report.summary.warnings} warnings. ${baselineDelta ? `Compared to the previous run, failed checks changed by ${baselineDelta.failed >= 0 ? '+' : ''}${baselineDelta.failed}, warnings changed by ${baselineDelta.warnings >= 0 ? '+' : ''}${baselineDelta.warnings}. ` : ''}Top issue focus: ${topIssue?.checkName ?? 'No major issues found'}.`;

  const visibleChecks = filteredBySheet;
  const currentIndex = expandedId ? visibleChecks.findIndex((c) => c.checkId === expandedId) : -1;

  const goToNextIssue = () => {
    if (!visibleChecks.length) return;
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % visibleChecks.length;
    setExpandedId(visibleChecks[nextIndex].checkId);
  };

  const goToPreviousIssue = () => {
    if (!visibleChecks.length) return;
    const prevIndex = currentIndex <= 0 ? visibleChecks.length - 1 : currentIndex - 1;
    setExpandedId(visibleChecks[prevIndex].checkId);
  };

  return (
    <>
      <div id="reconciliation-report-root" className="space-y-8 text-neutral-900 bg-white p-2 rounded-2xl print:p-0 print:space-y-6 relative">
      
      {/* ====================================================================
          HTML DIRECT PORTAL TRIGGER (Escapes Framer Motion to prevent blocked clicks)
          ==================================================================== */}
      {mounted && createPortal(
        <div className="print:hidden">
          <div className="fixed bottom-24 right-24 z-[999999] flex flex-col items-end gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                downloadReportPdf();
              }}
              className="rounded-full bg-neutral-950 hover:bg-neutral-800 text-white font-black text-xs uppercase tracking-wider px-6 py-4 shadow-2xl transition-all transform active:scale-95 flex items-center gap-2"
              style={{
                cursor: 'pointer',
                pointerEvents: 'auto',
                border: 'none',
                boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.3), 0 8px 10px -6px rgb(0 0 0 / 0.3)'
              }}
            >
              <svg className="h-4 w-4 text-white shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              {exportStatus === 'loading' ? 'Generating PDF…' : 'Generate Report PDF'}
            </button>

            {exportStatus !== 'idle' && (
              <div className="w-[280px] rounded-2xl border border-neutral-800 bg-black/95 px-4 py-3 text-sm text-white shadow-2xl">
                {exportMessage}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ====================================================================
          1. SYSTEM AUDIT COVER TITLE (Visible ONLY inside saved PDF)
          ==================================================================== */}
      <div className="hidden print:block border-b-4 border-neutral-950 pb-6 mb-6 w-full">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">Data Integrity Ledger // Corporate Copy</p>
            <h1 className="text-3xl font-black tracking-tight text-neutral-950 uppercase">Analysis &amp; Reconciliation Audit Report</h1>
            <p className="text-xs text-neutral-600 font-medium">
              Source Matrix File: <span className="font-mono font-bold text-neutral-900">{report.filename}</span>
            </p>
          </div>
          <div className="text-right text-xs font-mono text-neutral-500 space-y-0.5">
            <div>RUN DATE: {report.runDate}</div>
            <div>COMPILED AT: {new Date(report.analyzedAt).toLocaleString()}</div>
            <div className="text-neutral-950 font-bold uppercase tracking-wider text-[10px] bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200 mt-1 inline-block">Verified Secure</div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-6 border-t border-neutral-200 pt-4 font-mono text-xs">
          <div><span className="text-neutral-400 block uppercase text-[9px] font-bold">Total Rules Scanned</span> <span className="text-base font-bold text-neutral-900">{report.summary.total}</span></div>
          <div><span className="text-neutral-400 block uppercase text-[9px] font-bold">Passed Parameters</span> <span className="text-base font-bold text-emerald-600">{report.summary.passed}</span></div>
          <div><span className="text-neutral-400 block uppercase text-[9px] font-bold">Flagged Anomalies</span> <span className="text-base font-bold text-rose-600">{report.summary.failed}</span></div>
          <div><span className="text-neutral-400 block uppercase text-[9px] font-bold">System Warnings</span> <span className="text-base font-bold text-amber-600">{report.summary.warnings}</span></div>
        </div>
      </div>

      {/* ====================================================================
          2. SCREEN INTERFACE SUMMARY TILES
          ==================================================================== */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 print:hidden">
        <SummaryCard label="Total Checks" value={report.summary.total} accent="from-neutral-100 to-neutral-50" text="text-neutral-900" />
        <SummaryCard label="Passed" value={report.summary.passed} accent="from-emerald-50 to-emerald-100/50" text="text-emerald-700" delta={baselineDelta?.passed} />
        <SummaryCard label="Failed" value={report.summary.failed} accent="from-rose-50 to-rose-100/50" text="text-rose-700" delta={baselineDelta?.failed} />
        <SummaryCard label="Info / Warn" value={report.summary.warnings} accent="from-amber-50 to-amber-100/50" text="text-amber-700" delta={baselineDelta?.warnings} />
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.4fr_1fr] print:hidden">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-3">Executive summary</p>
          <p className="text-sm leading-6 text-neutral-700">{executiveSummary}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Sheet heatmap</p>
            <span className="text-[10px] uppercase tracking-[0.3em] text-neutral-500">Density</span>
          </div>
          <div className="mt-4 space-y-3">
            {sheetHeatmap.map((sheet) => (
              <div key={sheet.sheet} className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3">
                <div className="flex items-center justify-between text-sm font-semibold text-neutral-800">
                  <span>{sheet.sheet}</span>
                  <span>{sheet.total} issues</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-200">
                  <div
                    className={`h-full rounded-full ${sheet.density > 0.5 ? 'bg-rose-500' : sheet.density > 0.25 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, Math.round(sheet.density * 100))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Custom filter builder</p>
            <p className="mt-1 text-sm text-neutral-600">Create and save custom anomaly filters for rapid board review.</p>
          </div>
          {activeCustomFilter && (
            <button
              type="button"
              onClick={() => setActiveCustomFilterId(null)}
              className="rounded-full border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Clear active filter
            </button>
          )}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1.3fr_auto]">
          <input
            type="text"
            value={customFilterQuery}
            onChange={(e) => setCustomFilterQuery(e.target.value)}
            placeholder="Search keyword, field, or issue text"
            className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-950"
          />
          <button
            type="button"
            onClick={addCustomFilter}
            className="rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-800 transition"
          >
            Save filter
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {customFilters.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveCustomFilterId(item.id)}
              className={`rounded-full border px-3 py-2 text-sm transition ${activeCustomFilterId === item.id ? 'border-neutral-950 bg-neutral-950 text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}
            >
              {item.label}
              <span
                className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-neutral-100 text-[10px] text-neutral-500"
                onClick={(event) => {
                  event.stopPropagation();
                  removeCustomFilter(item.id);
                }}
              >
                ×
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 print:border-none print:bg-white print:p-0">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50/50 px-3 py-2 print:border-none print:bg-white print:p-0">
          <span className="text-xs font-bold text-neutral-400 font-mono uppercase tracking-wide print:text-neutral-500">Sheets found:</span>
          {report.sheetsFound.map((s) => (
            <span key={s} className="rounded-md bg-white border border-neutral-200 px-2 py-0.5 font-mono text-xs text-neutral-600 shadow-sm print:shadow-none">
              {s}
            </span>
          ))}
        </div>

        <div className="grid gap-3 xl:grid-cols-3">
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-3">Sheet Mapping Wizard</p>
            <div className="space-y-3 text-sm text-neutral-700">
              <SheetSelect
                label="Order Item Sheet"
                value={sheetMapping.orderItemSheet ?? 'all'}
                sheets={report.sheetsFound}
                onChange={(value) => setSheetMapping((prev) => ({ ...prev, orderItemSheet: value === 'all' ? undefined : value }))}
              />
              <SheetSelect
                label="MPC Sheet"
                value={sheetMapping.mpcSheet ?? 'all'}
                sheets={report.sheetsFound}
                onChange={(value) => setSheetMapping((prev) => ({ ...prev, mpcSheet: value === 'all' ? undefined : value }))}
              />
              <SheetSelect
                label="Scheduler Sheet"
                value={sheetMapping.schedulerSheet ?? 'all'}
                sheets={report.sheetsFound}
                onChange={(value) => setSheetMapping((prev) => ({ ...prev, schedulerSheet: value === 'all' ? undefined : value }))}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-3">Export & Sharing</p>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={downloadAnomalyCsv}
                className="rounded-xl border border-neutral-200 bg-neutral-950 px-3 py-2 text-left text-sm font-semibold text-white hover:bg-neutral-800 transition"
              >
                Download anomaly CSV
              </button>
              <button
                type="button"
                onClick={copyReportSnapshot}
                className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left text-sm font-semibold text-neutral-900 hover:bg-neutral-50 transition"
              >
                Copy report summary
              </button>
              <button
                type="button"
                onClick={copyBoardSnapshot}
                className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left text-sm font-semibold text-neutral-900 hover:bg-neutral-50 transition"
              >
                Copy board snapshot
              </button>
              <button
                type="button"
                onClick={downloadBoardSnapshot}
                className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left text-sm font-semibold text-neutral-900 hover:bg-neutral-50 transition"
              >
                Download board snapshot
              </button>
              <p className="text-[11px] text-neutral-500">Use CSV for row-level exports, clipboard snapshot for report handoff, and board snapshot for executive briefing.</p>
              {boardSnapshotStatus !== 'idle' && (
                <div className={`rounded-2xl border px-3 py-2 text-sm ${boardSnapshotStatus === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                  {boardSnapshotMessage}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-3">Trend Baseline</p>
            {baselineSummary ? (
              <div className="space-y-2 text-sm text-neutral-700">
                <div className="text-[11px] text-neutral-500">Previous run summary saved locally</div>
                <BaselineRow label="Passed" current={report.summary.passed} previous={baselineSummary.passed} delta={baselineDelta?.passed ?? 0} />
                <BaselineRow label="Failed" current={report.summary.failed} previous={baselineSummary.failed} delta={baselineDelta?.failed ?? 0} />
                <BaselineRow label="Warnings" current={report.summary.warnings} previous={baselineSummary.warnings} delta={baselineDelta?.warnings ?? 0} />
              </div>
            ) : (
              <div className="text-xs text-neutral-500">No previous analysis found yet. Run another report to build the baseline.</div>
            )}
          </div>
        </div>
      </div>

      {/* ====================================================================
          3. NAVIGATION FILTER BAR TABS
          ==================================================================== */}
      <div className="flex flex-col gap-3 border-b border-neutral-200 pb-3 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1">
          {(["all", "fail", "pass", "info"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-bold capitalize transition-colors ${
                filter === f
                  ? "border-neutral-950 text-neutral-950 font-extrabold"
                  : "border-transparent text-neutral-400 hover:text-neutral-700"
              }`}
            >
              {f === "info" ? "Info / Warn" : f}
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${filter === f ? "bg-neutral-950 text-white" : "bg-neutral-100 text-neutral-500"}`}>
                {f === "all" ? report.checks.length : f === "fail" ? report.summary.failed : f === "pass" ? report.summary.passed : report.summary.warnings}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Issue navigator</span>
          <button
            type="button"
            disabled={!visibleChecks.length}
            onClick={goToPreviousIssue}
            className="rounded-full border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={!visibleChecks.length}
            onClick={goToNextIssue}
            className="rounded-full border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
          <span className="text-xs text-neutral-500">
            {visibleChecks.length > 0 ? `${currentIndex + 1 || 1} of ${visibleChecks.length}` : 'No checks to navigate'}
          </span>
        </div>
      </div>

      {/* ====================================================================
          4. VALIDATION CARDS PIPELINE LIST
          ==================================================================== */}
      <div className="space-y-3 print:space-y-6 print:block print:w-full">
        {filteredBySheet.map((check, i) => (
          <CheckCard
            key={check.checkId}
            check={check}
            index={i}
            reportRawSheetsData={report.rawSheetsData}
            sheetMapping={sheetMapping}
            expanded={expandedId === check.checkId || expandedId === '__all__'}
            onToggle={() => setExpandedId(expandedId === check.checkId ? null : check.checkId)}
          />
        ))}
      </div>
    </div>

    </>
  );
}

function formatCellValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "(blank)";
  return String(value);
}

function SummaryCard({ label, value, accent, text, delta }: { label: string; value: number; accent: string; text: string; delta?: number | null }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`rounded-2xl border border-neutral-200 bg-gradient-to-br ${accent} p-5 shadow-sm`}
    >
      <div className={`text-3xl font-bold ${text}`}>
        <AnimatedCounter value={value} />
      </div>
      {delta !== undefined && delta !== null && (
        <div className={`mt-1 text-xs font-semibold ${delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
          {delta >= 0 ? '+' : ''}{delta}
        </div>
      )}
      <div className="mt-1 text-xs font-medium text-neutral-500">{label}</div>
    </motion.div>
  );
}

function SheetSelect({ label, value, sheets, onChange }: { label: string; value: string; sheets: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm text-neutral-700">
      <span className="block text-[10px] font-bold uppercase tracking-wide text-neutral-400 mb-2">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm focus:border-neutral-900 focus:ring-2 focus:ring-neutral-100"
      >
        <option value="all">Auto select</option>
        {sheets.map((sheet) => (
          <option key={sheet} value={sheet}>{sheet}</option>
        ))}
      </select>
    </label>
  );
}

function BaselineRow({ label, current, previous, delta }: { label: string; current: number; previous: number; delta: number }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-neutral-400">{label}</div>
      <div className="mt-1 text-sm font-bold text-neutral-900">{current}</div>
      <div className="text-[11px] text-neutral-500">Previous: {previous}</div>
      <div className={`mt-1 text-[11px] font-semibold ${delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
        {delta >= 0 ? '+' : ''}{delta}
      </div>
    </div>
  );
}

const STATUS_CONFIG = {
  pass: { dot: "bg-emerald-500", badge: "bg-emerald-50 border-emerald-200 text-emerald-800", label: "PASSED" },
  fail: { dot: "bg-rose-500", badge: "bg-rose-50 border-rose-300 text-rose-800", label: "ANOMALY" },
  warning: { dot: "bg-amber-500", badge: "bg-amber-50 border-amber-200 text-amber-800", label: "WARN" },
  info: { dot: "bg-sky-500", badge: "bg-sky-50 border-sky-200 text-sky-800", label: "INFO" },
} as const;

interface CheckCardProps {
  check: AnomalyResult;
  index: number;
  reportRawSheetsData: any;
  sheetMapping: SheetMapping;
  expanded: boolean;
  onToggle: () => void;
}

function CheckCard({ check, index, reportRawSheetsData, sheetMapping, expanded, onToggle }: CheckCardProps) {
  const cfg = STATUS_CONFIG[check.status];
  const [explain, setExplain] = useState<ExplainResponse | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState("");
  const [selectedDetail, setSelectedDetail] = useState<AnomalyDetail | null>(null);

  const runExplain = async (e?: MouseEvent<HTMLButtonElement>) => {
    if (e) {
      e.stopPropagation();
    }
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
      const explanationText = data.explanation || data.aiExplanation || "No explanation available.";
      setExplain({ checkId: check.checkId, explanation: explanationText, sources: [] });
    } catch (err) {
      setExplainError(err instanceof Error ? err.message : "Failed to explain");
    } finally {
      setExplainLoading(false);
    }
  };

const isExpanded = expanded;

  useEffect(() => {
    if (isExpanded && !explain && !explainLoading && !explainError) {
      runExplain();
    }
  }, [isExpanded]);

  return (
    <div className={`overflow-hidden rounded-2xl border bg-white shadow-sm print:shadow-none print:border-neutral-300 print:break-inside-avoid ${
      isExpanded ? "border-neutral-900" : "border-neutral-200"
    }`}>
      <button 
        type="button"
        onClick={onToggle} 
        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-neutral-50/50 transition-colors print:bg-white print:cursor-default"
      >
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${cfg.dot}`} />
        <span className="shrink-0 font-mono text-xs text-neutral-400">{check.checkId}</span>
        <span className="flex-1 text-sm font-bold text-neutral-900 uppercase tracking-tight">{check.checkName}</span>
        {check.count !== undefined && check.total !== undefined && (
          <span className="shrink-0 text-xs font-mono font-bold text-neutral-500 bg-neutral-50 px-2 py-0.5 rounded-md border border-neutral-200 print:bg-white">
            {check.count} / {check.total} exceptions
          </span>
        )}
        <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-black tracking-wider ${cfg.badge}`}>
          {cfg.label}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform print:hidden ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs print:border-neutral-300 print:break-inside-avoid mt-3">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-2 mb-3 print:border-neutral-200">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 font-mono flex items-center gap-1.5">
                  Statistical Distribution Metrics Chart
                </h4>
                <span className="font-mono text-[9px] font-bold text-neutral-300">ID AXIS MAPPING // {check.checkId}</span>
              </div>
              <div className="w-full h-[280px] relative block" style={{ height: "280px" }} data-pdf-safe="true">
                <CheckChartViewer checkId={check.checkId} sheets={reportRawSheetsData} check={check} sheetMapping={sheetMapping} />
              </div>
            </div>

            <div className="border-t border-neutral-100 bg-neutral-50/30 px-5 py-4 space-y-4 print:bg-white print:border-neutral-200">
              <div className="border-l-2 border-neutral-900 pl-3 py-0.5">
                <p className="text-[10px] font-bold font-mono uppercase tracking-wider text-neutral-400">Parameter Bounds</p>
                <p className="text-xs text-neutral-600 mt-0.5">{check.description}</p>
                <p className="mt-1.5 text-xs font-bold text-neutral-900 bg-white border border-neutral-200 px-2.5 py-1.5 rounded-lg inline-block print:bg-white">{check.message}</p>
              </div>

              {(!explain && !explainLoading) && (
                <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs print:hidden">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-neutral-800" style={{ width: '16px', height: '16px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span className="text-xs font-bold uppercase tracking-wider text-neutral-800">Copilot Narrative Analytics</span>
                    </div>
                    <button
                      type="button"
                      onClick={runExplain}
                      className="rounded-lg bg-neutral-950 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-neutral-800"
                    >
                      Explain Exception
                    </button>
                  </div>
                </div>
              )}

              {explainLoading && <p className="text-xs font-mono font-bold text-neutral-400 print:hidden">Compiling copilot diagnostics...</p>}
              {explainError && <p className="text-xs font-mono font-bold text-rose-600 print:hidden">⚠️ {explainError}</p>}

              {explain && (
                <div className="rounded-xl border border-neutral-200 bg-white p-4 print:border-neutral-300">
                  <p className="text-[9px] font-bold font-mono uppercase tracking-wider text-neutral-400 border-b border-neutral-100 pb-1 mb-2">Automated Copilot Narrative Insight</p>
                  <div className="whitespace-pre-wrap text-xs leading-relaxed text-neutral-800">{explain.explanation}</div>
                </div>
              )}

              {check.details && check.details.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider font-mono text-neutral-400">
                    Detailed Discrepancy Register (Showing first {Math.min(check.details.length, 50)} captured exception items)
                  </p>
                  <div className="max-h-72 overflow-auto rounded-xl border border-neutral-200 bg-white print:max-h-none print:overflow-visible print:border-neutral-300">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="sticky top-0 bg-neutral-50 text-[10px] font-bold font-mono text-neutral-500 uppercase tracking-wider border-b border-neutral-200 z-10 print:static print:bg-neutral-100">
                        <tr>
                          <th className="px-4 py-2.5">Row</th>
                          <th className="px-4 py-2.5">Column</th>
                          <th className="px-4 py-2.5">Cell</th>
                          <th className="px-4 py-2.5">Bad value</th>
                          <th className="px-4 py-2.5">Issue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 font-medium text-neutral-700 print:divide-neutral-200">
                        {check.details.map((d, i) => (
                          <tr
                            key={i}
                            className="cursor-pointer hover:bg-neutral-50/40 transition-colors text-[11px] print:hover:bg-white"
                            onClick={() => setSelectedDetail(d)}
                          >
                            <td className="whitespace-nowrap px-4 py-2 font-mono text-neutral-400">{d.rowIndex ?? "-"}</td>
                            <td className="whitespace-nowrap px-4 py-2 font-mono text-neutral-950 font-bold print:font-semibold">{d.field ?? "-"}</td>
                            <td className="whitespace-nowrap px-4 py-2 font-mono text-neutral-600">{d.cellRef ?? "-"}</td>
                            <td className="whitespace-nowrap px-4 py-2 font-mono">
                              <span className="bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200 font-bold text-neutral-800 print:bg-white print:p-0 print:border-none">
                                {formatCellValue(d.value)}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-xs text-neutral-500 font-sans print:text-neutral-800">{d.issue ?? "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <AnimatePresence>
                {selectedDetail && (
                  <motion.div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <motion.div
                      className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-3xl border border-neutral-200 bg-white p-6 shadow-2xl"
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.95, opacity: 0 }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-bold text-neutral-900">Anomaly Drilldown</p>
                          <p className="text-xs text-neutral-500">Detail record from {selectedDetail.sheet ?? 'unknown sheet'}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedDetail(null)}
                          className="rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-50"
                        >
                          Close
                        </button>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                          <p className="text-[10px] uppercase tracking-wider text-neutral-400">Row</p>
                          <p className="mt-1 text-sm font-bold text-neutral-900">{selectedDetail.rowIndex ?? 'N/A'}</p>
                        </div>
                        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                          <p className="text-[10px] uppercase tracking-wider text-neutral-400">Field</p>
                          <p className="mt-1 text-sm font-bold text-neutral-900">{selectedDetail.field ?? 'N/A'}</p>
                        </div>
                        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                          <p className="text-[10px] uppercase tracking-wider text-neutral-400">Issue</p>
                          <p className="mt-1 text-sm font-bold text-neutral-900">{selectedDetail.issue ?? 'N/A'}</p>
                        </div>
                        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                          <p className="text-[10px] uppercase tracking-wider text-neutral-400">Value</p>
                          <p className="mt-1 text-sm font-bold text-neutral-900">{formatCellValue(selectedDetail.value)}</p>
                        </div>
                      </div>
                      <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-700">
                        <pre className="whitespace-pre-wrap break-words">{JSON.stringify(selectedDetail, null, 2)}</pre>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    }
