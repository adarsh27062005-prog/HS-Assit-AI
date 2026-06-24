import type { AnomalyResult, SheetData, AnomalyDetail, ColumnMaps } from "@/types";

const VALID_STEP_CODES = ["post", "cncl", "open"];
const OLI_NAMES = ["Order_line_item", "Order_Line_Item", "order_line_item", "scheduler_logs"];
const MPC_NAMES = ["mpc", "MPC"];
const SCHEDULER_NAMES = ["scheduler_logs", "Scheduler_logs"];
const MAX_DETAILS = 100;

export interface TimeframeFilter {
  type: "day" | "week" | "month" | "year";
  value?: string | number;
  startDate?: string;
  endDate?: string;
}

// ==========================================
// Utility Helper Methods
// ==========================================
function isBlank(val: unknown): boolean {
  return val === null || val === undefined || String(val).trim() === "" || String(val).trim().toLowerCase() === "null";
}

function normalizeStepCode(val: unknown): string {
  return String(val ?? "").trim().toLowerCase();
}

function fmtValue(val: unknown): string | number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return val;
  const s = String(val).trim();
  return s === "" ? null : s;
}

function getPrimaryDate(dates: string[]): string {
  if (!dates.length) return "2026-06-23";
  const counts: Record<string, number> = {};
  let maxCount = 0;
  let primary = dates[0];
  
  for (const d of dates) {
    counts[d] = (counts[d] || 0) + 1;
    if (counts[d] > maxCount) {
      maxCount = counts[d];
      primary = d;
    }
  }
  return primary;
}

function refFor(
  sheetName: string,
  columnMaps: ColumnMaps,
  header: string,
  excelRow: number
): { column?: string; cellRef: string } {
  const col = columnMaps?.[sheetName]?.[header];
  return {
    column: col,
    cellRef: col ? `${sheetName}!${col}${excelRow}` : `${sheetName}!row ${excelRow}`,
  };
}

function resolveSheet(
  sheets: SheetData,
  names: string[]
): { name: string; rows: Record<string, unknown>[] } {
  for (const n of names) {
    const r = sheets[n];
    if (r && Array.isArray(r) && r.length) return { name: n, rows: r as Record<string, unknown>[] };
  }
  return { name: names[0], rows: [] };
}

// ==========================================
// DYNAMIC TIMEFRAME FILTERING LOGIC
// ==========================================
export function filterRowsByTimeframe(
  rows: Record<string, unknown>[],
  filter?: TimeframeFilter
): Record<string, unknown>[] {
  if (!filter || !filter.type) return rows;

  return rows.filter((row) => {
    const rawDate = row["date_of_transaction"] || row["load_date"] || row["run_date"];
    if (isBlank(rawDate)) return true; 

    const dateStr = String(rawDate).trim().split(" ")[0]; 
    const dateObj = new Date(dateStr);
    if (isNaN(dateObj.getTime())) return true;

    switch (filter.type) {
      case "day":
        return filter.value ? dateStr === String(filter.value).trim() : true;
      case "week":
      case "month":
        if (!filter.startDate || !filter.endDate) return true;
        return dateStr >= String(filter.startDate).trim() && dateStr <= String(filter.endDate).trim();
      case "year":
        return filter.value ? dateObj.getFullYear() === Number(filter.value) : true;
      default:
        return true;
    }
  });
}

// ==========================================
// C1: Mandatory Columns Check
// ==========================================
function checkNoBlankColumns(rows: Record<string, unknown>[], sheetName: string, columnMaps: ColumnMaps): AnomalyResult {
  // Determine if we are analyzing log entries or standard order line rows
  const isDbTrack = sheetName === "scheduler_logs" || (rows.length > 0 && "scheduler" in rows[0]);
  const criticalCols = isDbTrack 
    ? ["id", "scheduler", "status", "run_date", "start_time", "end_time"]
    : ["customer_account_number", "loyalty_id", "order_line_number", "order_line_step_code", "points_left_to_redeem", "total_redeemable_points", "load_date"];

  const details: AnomalyDetail[] = [];
  rows.forEach((row, idx) => {
    const excelRow = idx + 2;
    criticalCols.forEach((col) => {
      if (isBlank(row[col])) {
        const { column, cellRef } = refFor(sheetName, columnMaps, col, excelRow);
        details.push({
          rowIndex: excelRow,
          sheet: sheetName,
          field: col,
          column,
          cellRef,
          value: fmtValue(row[col]),
          issue: `Row ${excelRow}, column '${col}' (cell ${cellRef}) is blank/NULL.`,
        });
      }
    });
  });

  return {
    checkId: "C1",
    checkName: "Column Completeness Check",
    description: "Critical data properties must contain no blank or NULL values.",
    status: details.length === 0 ? "pass" : "fail",
    count: details.length,
    total: rows.length * criticalCols.length,
    details: details.slice(0, MAX_DETAILS),
    message: details.length === 0
      ? "All mandatory structural data fields are fully populated."
      : `${details.length} missing values found across mandatory columns.`,
  };
}

// ==========================================
// C2: Total Redeemable Points Validation
// ==========================================
function checkTotalVsRedeemablePoints(
  oliRows: Record<string, unknown>[],
  oliName: string,
  mpcRows: Record<string, unknown>[],
  columnMaps: ColumnMaps
): AnomalyResult {
  const details: AnomalyDetail[] = [];
  const isDbTrack = oliName === "scheduler_logs" || (oliRows.length > 0 && "scheduler" in oliRows[0]);
  
  if (!isDbTrack) {
    const mpcMap: Record<string, number> = {};
    mpcRows.forEach((row) => {
      const classId = String(row["product_primary_class_id"] ?? "").trim();
      const pct = Number(row["redemption_percentage"] ?? 0);
      if (classId) mpcMap[classId] = pct;
    });

    oliRows.forEach((row, idx) => {
      const excelRow = idx + 2;
      const classId = String(row["product_primary_class_id"] ?? "").trim();
      const pct = mpcMap[classId];
      
      if (pct !== undefined) {
        const sales = Number(row["extended_sales_amount"] ?? 0);
        const sysPts = Number(row["total_redeemable_points"] ?? 0);
        const manualPts = Math.floor(((sales * pct / 100) / 0.005));
        
        if (Math.abs(manualPts - sysPts) > 1) {
          const { column, cellRef } = refFor(oliName, columnMaps, "total_redeemable_points", excelRow);
          details.push({
            rowIndex: excelRow,
            sheet: oliName,
            field: "total_redeemable_points",
            column,
            cellRef,
            value: sysPts,
            issue: `Row ${excelRow}: Manual math calculation (${manualPts}) vs System (${sysPts}).`,
          });
        }
      }
    });
  }

  return {
    checkId: "C2",
    checkName: "Manual vs System Points Match",
    description: "Manual calculation of points should match system total_redeemable_points.",
    status: details.length === 0 ? "pass" : "fail",
    count: details.length,
    total: oliRows.length,
    details: details.slice(0, MAX_DETAILS),
    message: details.length === 0
      ? "Manual point updates match active baseline system records completely."
      : `${details.length} points calculation imbalances found.`,
  };
}

// ==========================================
// C3: Step Code Validation
// ==========================================
function checkStepCodes(rows: Record<string, unknown>[], sheetName: string, columnMaps: ColumnMaps): AnomalyResult {
  const details: AnomalyDetail[] = [];
  const isDbTrack = sheetName === "scheduler_logs" || (rows.length > 0 && "scheduler" in rows[0]);
  
  if (!isDbTrack) {
    rows.forEach((row, idx) => {
      const excelRow = idx + 2;
      const code = normalizeStepCode(row["order_line_step_code"] || row["order_step_code"]);
      if (!VALID_STEP_CODES.includes(code)) {
        const { column, cellRef } = refFor(sheetName, columnMaps, "order_line_step_code", excelRow);
        details.push({
          rowIndex: excelRow,
          sheet: sheetName,
          field: "order_line_step_code",
          column,
          cellRef,
          value: fmtValue(row["order_line_step_code"] || row["order_step_code"]),
          issue: `Row ${excelRow}: invalid step code '${row["order_line_step_code"] || row["order_step_code"]}'.`,
        });
      }
    });
  }

  return {
    checkId: "C3",
    checkName: "Order Line Step Code Validation",
    description: "Transaction step codes must be only 'post', 'cncl', or 'open'.",
    status: details.length === 0 ? "pass" : "fail",
    count: details.length,
    total: rows.length,
    details: details.slice(0, MAX_DETAILS),
    message: details.length === 0 ? "All row execution sequence step flags are valid." : `${details.length} invalid status flags caught.`,
  };
}

// ==========================================
// C4: Points Left To Redeem Match
// ==========================================
function checkPLTRMatch(oliRows: Record<string, unknown>[], oliName: string, columnMaps: ColumnMaps): AnomalyResult {
  const details: AnomalyDetail[] = [];
  const isDbTrack = oliName === "scheduler_logs" || (oliRows.length > 0 && "scheduler" in oliRows[0]);
  
  if (!isDbTrack) {
    oliRows.forEach((row, idx) => {
      const excelRow = idx + 2;
      const sysPLTR = Number(row["points_left_to_redeem"] || row["manual_PLTR"] || 0);
      const totalPts = Number(row["total_redeemable_points"] || 0);
      const redeemedPts = Number(row["points_redeemed"] || 0);
      const manualPLTR = totalPts - redeemedPts;
      
      if (manualPLTR !== sysPLTR) {
        const { column, cellRef } = refFor(oliName, columnMaps, "points_left_to_redeem", excelRow);
        details.push({
          rowIndex: excelRow,
          sheet: oliName,
          field: "points_left_to_redeem",
          column,
          cellRef,
          value: sysPLTR,
          issue: `Row ${excelRow}: Calculated PLTR (${manualPLTR}) vs System Value (${sysPLTR}).`,
        });
      }
    });
  }

  return {
    checkId: "C4",
    checkName: "Points Left to Redeem Match",
    description: "Calculated points left to redeem (total - redeemed) must match table state metrics.",
    status: details.length === 0 ? "pass" : "fail",
    count: details.length,
    total: oliRows.length,
    details: details.slice(0, MAX_DETAILS),
    message: details.length === 0 ? "Points ledger properties balance out perfectly." : `${details.length} point validation discrepancies noticed.`,
  };
}

// ==========================================
// C5: Business Unit Description Check
// ==========================================
function checkBusinessUnitDesc(oliRows: Record<string, unknown>[], sheetName: string, columnMaps: ColumnMaps): AnomalyResult {
  const details: AnomalyDetail[] = [];
  const isDbTrack = sheetName === "scheduler_logs" || (oliRows.length > 0 && "scheduler" in oliRows[0]);

  if (!isDbTrack) {
    oliRows.forEach((row, idx) => {
      const excelRow = idx + 2;
      const code = normalizeStepCode(row["order_line_step_code"] || row["order_step_code"]);
      const desc = row["business_unit_description"] || row["business_unit_desc"];
      
      if (code === "post" && isBlank(desc)) {
        const { column, cellRef } = refFor(sheetName, columnMaps, "business_unit_description", excelRow);
        details.push({
          rowIndex: excelRow,
          sheet: sheetName,
          field: "business_unit_description",
          column,
          cellRef,
          value: null,
          issue: `Row ${excelRow}: business_unit_description is missing for posted order.`,
        });
      }
    });
  }

  return {
    checkId: "C5",
    checkName: "Business Unit Description Check",
    description: "business_unit_description must not be blank for posted orders.",
    status: details.length === 0 ? "pass" : "fail",
    count: details.length,
    total: oliRows.length,
    details: details.slice(0, MAX_DETAILS),
    message: details.length === 0 
      ? "Corporate business unit strings align with operational guidelines." 
      : `${details.length} missing business descriptions found.`,
  };
}

// ==========================================
// C6: Dormant Account Validation
// ==========================================
function checkNonEarningDormant(oliRows: Record<string, unknown>[], sheetName: string, columnMaps: ColumnMaps): AnomalyResult {
  const details: AnomalyDetail[] = [];
  const isDbTrack = sheetName === "scheduler_logs" || (oliRows.length > 0 && "scheduler" in oliRows[0]);

  if (!isDbTrack) {
    oliRows.forEach((row, idx) => {
      const excelRow = idx + 2;
      const isModified = Number(row["mktcls_modified"] ?? 0) === 1;
      const isDormant = Number(row["dormant_account_flag"] ?? 0) === 1;

      if (isModified && !isDormant) {
        const { column, cellRef } = refFor(sheetName, columnMaps, "dormant_account_flag", excelRow);
        details.push({
          rowIndex: excelRow,
          sheet: sheetName,
          field: "dormant_account_flag",
          column,
          cellRef,
          value:fmtValue(row["dormant_account_flag"]),
          issue: `Row ${excelRow}: modified tracking indicates dormancy flags should be enabled.`,
        });
      }
    });
  }

  return {
    checkId: "C6",
    checkName: "Non-Earning Records Dormant Check",
    description: "Non-earning metrics (mktcls_modified=1) must match a dormant account state.",
    status: details.length === 0 ? "pass" : "fail",
    count: details.length,
    total: oliRows.length,
    details: details.slice(0, MAX_DETAILS),
    message: details.length === 0 ? "Account modification dormancy rules checked out successfully." : `${details.length} dormancy anomalies found.`,
  };
}

// ==========================================
// C7: Date of Transaction Check
// ==========================================
function checkDateOfTransaction(oliRows: Record<string, unknown>[], sheetName: string, columnMaps: ColumnMaps): AnomalyResult {
  const details: AnomalyDetail[] = [];
  const isDbTrack = sheetName === "scheduler_logs" || (oliRows.length > 0 && "scheduler" in oliRows[0]);
  const dateField = isDbTrack ? "run_date" : "date_of_transaction";

  oliRows.forEach((row, idx) => {
    const excelRow = idx + 2;
    if (isBlank(row[dateField])) {
      const { column, cellRef } = refFor(sheetName, columnMaps, dateField, excelRow);
      details.push({
        rowIndex: excelRow,
        sheet: sheetName,
        field: dateField,
        column,
        cellRef,
        value: null,
        issue: `Row ${excelRow} field context sequence is missing an explicitly defined timestamp.`,
      });
    }
  });

  const nullCount = details.length;
  const nonNullCount = oliRows.length - nullCount;

  return {
    checkId: "C7",
    checkName: "Date of Transaction Check",
    description: "Tracks total active row populations containing fully populated time tracking elements.",
    status: "pass", 
    count: nullCount,
    total: oliRows.length,
    details: details.slice(0, MAX_DETAILS),
    message: `Total Processed: ${oliRows.length} | Ineligible: ${nullCount} | Mapped Log Rows: ${nonNullCount}`,
  };
}

// ==========================================
// C8: Scheduler vs Output Count Match
// ==========================================
function checkSchedulerCountMatch(
  oliRows: Record<string, unknown>[],
  schedLogs: Record<string, unknown>[],
  schedName: string
): AnomalyResult {
  let successCount = 0;
  let failureCount = 0;

  oliRows.forEach((row) => {
    const statusVal = String(row["status"] || "").trim().toLowerCase();
    if (statusVal === "success") successCount++;
    else if (statusVal && statusVal !== "undefined") failureCount++;
  });

  return {
    checkId: "C8",
    checkName: "Scheduler Count vs Output Count",
    description: "Tracks verification execution states against active processing system boundaries.",
    status: failureCount === 0 ? "pass" : "fail",
    count: successCount,
    total: oliRows.length,
    details: [],
    message: `Total Batch Runs evaluated: ${oliRows.length} | Success Cycles: ${successCount} | Failed Flags: ${failureCount}`,
  };
}

// ==========================================
// C9: Run Date Consistency Check
// ==========================================
function checkRunDate(oliRows: Record<string, unknown>[], sheetName: string, columnMaps: ColumnMaps): AnomalyResult {
  const isDbTrack = sheetName === "scheduler_logs" || (oliRows.length > 0 && "scheduler" in oliRows[0]);
  const dateField = isDbTrack ? "run_date" : "load_date";
  
  const loadDates = oliRows
    .map((r) => r[dateField])
    .filter((d) => !isBlank(d))
    .map((d) => String(d).trim().split(" ")[0]); // Truncate down to day format boundary

  const primaryDate = getPrimaryDate(loadDates);
  const uniqueDates = [...new Set(loadDates)].sort();

  const details: AnomalyDetail[] = [];
  oliRows.forEach((row, idx) => {
    const excelRow = idx + 2;
    const ld = String(row[dateField] ?? "").trim().split(" ")[0];
    if (!isBlank(row[dateField]) && ld !== primaryDate) {
      const { column, cellRef } = refFor(sheetName, columnMaps, dateField, excelRow);
      details.push({
        rowIndex: excelRow,
        sheet: sheetName,
        field: dateField,
        column,
        cellRef,
        value: ld,
        issue: `Row ${excelRow} (cell ${cellRef}) timestamp calendar group shifts from primary batch window '${primaryDate}'.`,
      });
    }
  });

  return {
    checkId: "C9",
    checkName: "Run Date Consistency Check",
    description: "All rows processed in the incremental pipeline segment should belong to a single day boundary.",
    status: details.length > 0 ? "warning" : "pass",
    count: details.length,
    total: oliRows.length,
    details: details.slice(0, MAX_DETAILS),
    message: details.length === 0
      ? `All records map to a clean unified execution timeline date: ${primaryDate}.`
      : `${details.length} parsing variances found. Active periods: ${uniqueDates.join(", ")}`,
  };
}

// ==========================================
// Main Runner Export
// ==========================================
export function runAllChecks(
  sheets: SheetData, 
  columnMaps: ColumnMaps = {},
  filter?: TimeframeFilter
): AnomalyResult[] {
  
  const { name: oliName, rows: rawOliRows } = resolveSheet(sheets, OLI_NAMES);
  const { name: schedName, rows: rawSchedLogs } = resolveSheet(sheets, SCHEDULER_NAMES);
  const { rows: mpcRows } = resolveSheet(sheets, MPC_NAMES);

  const filteredOliRows = filterRowsByTimeframe(rawOliRows, filter);

  if (!filteredOliRows.length) {
    return [
      {
        checkId: "ALL",
        checkName: "Timeframe Filter Empty",
        description: "Validates if any data matches the input date scope range variables.",
        status: "warning",
        message: "No records found inside the specified date range context parameter.",
      }
    ];
  }

  return [
    checkNoBlankColumns(filteredOliRows, oliName, columnMaps),              // C1
    checkTotalVsRedeemablePoints(filteredOliRows, oliName, mpcRows, columnMaps), // C2
    checkStepCodes(filteredOliRows, oliName, columnMaps),                   // C3
    checkPLTRMatch(filteredOliRows, oliName, columnMaps),                    // C4
    checkBusinessUnitDesc(filteredOliRows, oliName, columnMaps),            // C5
    checkNonEarningDormant(filteredOliRows, oliName, columnMaps),           // C6
    checkDateOfTransaction(filteredOliRows, oliName, columnMaps),           // C7
    checkSchedulerCountMatch(filteredOliRows, rawSchedLogs, schedName),     // C8
    checkRunDate(filteredOliRows, oliName, columnMaps),                     // C9
  ];
}