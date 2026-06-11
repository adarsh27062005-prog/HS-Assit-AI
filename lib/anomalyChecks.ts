import type { AnomalyResult, SheetData, AnomalyDetail, ColumnMaps } from "@/types";

const VALID_STEP_CODES = ["post", "cncl", "open"];
const TH_NAMES = ["Traansaction_History", "Transaction_History"];
const MAX_DETAILS = 100;

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

// Build an A1-style cell reference like "Order_line_item!D45" plus the column letter.
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

// Resolve a sheet by trying a list of candidate names (handles the misspelled "Traansaction_History").
function resolveSheet(
  sheets: SheetData,
  names: string[]
): { name: string; rows: Record<string, unknown>[] } {
  for (const n of names) {
    const r = sheets[n];
    if (r && r.length) return { name: n, rows: r as Record<string, unknown>[] };
  }
  for (const n of names) {
    if (sheets[n]) return { name: n, rows: sheets[n] as Record<string, unknown>[] };
  }
  return { name: names[0], rows: [] };
}

// CHECK 1: Columns in Order_line_item should have no blank/NULL values
function checkNoBlankColumns(sheets: SheetData, columnMaps: ColumnMaps): AnomalyResult {
  const sheetName = "Order_line_item";
  const rows = (sheets[sheetName] ?? []) as Record<string, unknown>[];
  if (!rows.length) {
    return {
      checkId: "C1",
      checkName: "Column Completeness Check",
      description: "All mapped columns in Order_line_item must have no blank or NULL values.",
      status: "warning",
      message: "Order_line_item sheet not found or empty.",
    };
  }

  const criticalCols = [
    "order_line_number", "member_id", "order_line_step_code",
    "points_left_to_redeem", "total_redeemable_points", "load_date",
  ];

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
    description: "All mapped columns in Order_line_item must have no blank or NULL values.",
    status: details.length === 0 ? "pass" : "fail",
    count: details.length,
    total: rows.length * criticalCols.length,
    details: details.slice(0, MAX_DETAILS),
    message:
      details.length === 0
        ? "All critical columns are fully populated."
        : `${details.length} blank/NULL values found across critical columns.`,
  };
}

// CHECK 2: total_redeemable_points (manual) == total from Transaction_History (system)
function checkTotalVsRedeemablePoints(sheets: SheetData, columnMaps: ColumnMaps): AnomalyResult {
  const oliName = "Order_line_item";
  const oli = (sheets[oliName] ?? []) as Record<string, unknown>[];
  const { rows: th } = resolveSheet(sheets, TH_NAMES);

  if (!oli.length || !th.length) {
    return {
      checkId: "C2",
      checkName: "Manual vs System Points Match",
      description: "total_redeemable_points (manual) should equal total system-calculated redeemable points.",
      status: "warning",
      message: "Required sheets not found for this check.",
    };
  }

  const memberSystemPoints: Record<string, number> = {};
  th.forEach((row) => {
    const mid = String(row["member_id"] ?? "").trim();
    const pts = Number(row["total_redeemable_points"] ?? 0);
    if (mid) memberSystemPoints[mid] = pts;
  });

  const details: AnomalyDetail[] = [];
  oli.forEach((row, idx) => {
    const excelRow = idx + 2;
    const mid = String(row["member_id"] ?? "").trim();
    const manualPts = Number(row["total_redeemable_points"] ?? 0);
    const sysPts = memberSystemPoints[mid];
    if (sysPts !== undefined && manualPts !== sysPts) {
      const { column, cellRef } = refFor(oliName, columnMaps, "total_redeemable_points", excelRow);
      details.push({
        rowIndex: excelRow,
        sheet: oliName,
        field: "total_redeemable_points",
        column,
        cellRef,
        value: manualPts,
        issue: `Row ${excelRow}, column 'total_redeemable_points' (cell ${cellRef}): manual=${manualPts} vs system=${sysPts} for member_id ${mid}.`,
        relatedData: { member_id: mid, manual: manualPts, system: sysPts },
      });
    }
  });

  return {
    checkId: "C2",
    checkName: "Manual vs System Points Match",
    description: "total_redeemable_points (manual) should equal total system-calculated redeemable points.",
    status: details.length === 0 ? "pass" : "fail",
    count: details.length,
    total: oli.length,
    details: details.slice(0, MAX_DETAILS),
    message:
      details.length === 0
        ? "Manual and system points match for all records."
        : `${details.length} records have a mismatch between manual and system-calculated points.`,
  };
}

// CHECK 3: order_line_step_code should be only post, cncl, open
function checkStepCodes(sheets: SheetData, columnMaps: ColumnMaps): AnomalyResult {
  const sheetName = "Order_line_item";
  const rows = (sheets[sheetName] ?? []) as Record<string, unknown>[];
  if (!rows.length) {
    return {
      checkId: "C3",
      checkName: "Order Line Step Code Validation",
      description: "order_line_step_code must be only 'post', 'cncl', or 'open'.",
      status: "warning",
      message: "Order_line_item sheet not found or empty.",
    };
  }

  const details: AnomalyDetail[] = [];
  rows.forEach((row, idx) => {
    const excelRow = idx + 2;
    const code = normalizeStepCode(row["order_line_step_code"]);
    if (!VALID_STEP_CODES.includes(code)) {
      const { column, cellRef } = refFor(sheetName, columnMaps, "order_line_step_code", excelRow);
      details.push({
        rowIndex: excelRow,
        sheet: sheetName,
        field: "order_line_step_code",
        column,
        cellRef,
        value: fmtValue(row["order_line_step_code"]),
        issue: `Row ${excelRow}, column 'order_line_step_code' (cell ${cellRef}): invalid code '${row["order_line_step_code"]}'. Allowed: post, cncl, open.`,
      });
    }
  });

  return {
    checkId: "C3",
    checkName: "Order Line Step Code Validation",
    description: "order_line_step_code must be only 'post', 'cncl', or 'open'.",
    status: details.length === 0 ? "pass" : "fail",
    count: details.length,
    total: rows.length,
    details: details.slice(0, MAX_DETAILS),
    message:
      details.length === 0
        ? "All step codes are valid (post/cncl/open)."
        : `${details.length} records have invalid step codes.`,
  };
}

// CHECK 4: manual_PLTR == points_left_to_redeem
function checkPLTRMatch(sheets: SheetData, columnMaps: ColumnMaps): AnomalyResult {
  const oliName = "Order_line_item";
  const oli = (sheets[oliName] ?? []) as Record<string, unknown>[];
  const { rows: th } = resolveSheet(sheets, TH_NAMES);

  if (!oli.length || !th.length) {
    return {
      checkId: "C4",
      checkName: "Points Left to Redeem Match",
      description: "manual_PLTR and points_left_to_redeem should be equal across records.",
      status: "warning",
      message: "Required sheets not found for this check.",
    };
  }

  const thPltr: Record<string, number> = {};
  th.forEach((row) => {
    const oln = String(row["order_line_number"] ?? "").trim();
    if (oln) thPltr[oln] = Number(row["points_left_to_redeem"] ?? 0);
  });

  const details: AnomalyDetail[] = [];
  oli.forEach((row, idx) => {
    const excelRow = idx + 2;
    const oln = String(row["order_line_number"] ?? "").trim();
    const manualPLTR = Number(row["points_left_to_redeem"] ?? 0);
    const sysPLTR = thPltr[oln];
    if (sysPLTR !== undefined && manualPLTR !== sysPLTR) {
      const { column, cellRef } = refFor(oliName, columnMaps, "points_left_to_redeem", excelRow);
      details.push({
        rowIndex: excelRow,
        sheet: oliName,
        field: "points_left_to_redeem",
        column,
        cellRef,
        value: manualPLTR,
        issue: `Row ${excelRow}, column 'points_left_to_redeem' (cell ${cellRef}): OLI=${manualPLTR} vs Transaction_History=${sysPLTR} for order_line ${oln}.`,
        relatedData: { order_line_number: oln, oli: manualPLTR, th: sysPLTR },
      });
    }
  });

  return {
    checkId: "C4",
    checkName: "Points Left to Redeem Match",
    description: "manual_PLTR and points_left_to_redeem should be equal across records.",
    status: details.length === 0 ? "pass" : "fail",
    count: details.length,
    total: oli.length,
    details: details.slice(0, MAX_DETAILS),
    message:
      details.length === 0
        ? "Points Left to Redeem values match across all records."
        : `${details.length} records have PLTR mismatches.`,
  };
}

// CHECK 5: business_unit_description blank for posted order (should not be blank)
function checkBusinessUnitDesc(sheets: SheetData, columnMaps: ColumnMaps): AnomalyResult {
  const sheetName = "Order_line_item";
  const oli = (sheets[sheetName] ?? []) as Record<string, unknown>[];
  if (!oli.length) {
    return {
      checkId: "C5",
      checkName: "Business Unit Description Check",
      description: "business_unit_description should not be blank for posted orders.",
      status: "warning",
      message: "Order_line_item sheet not found or empty.",
    };
  }

  const details: AnomalyDetail[] = [];
  oli.forEach((row, idx) => {
    const excelRow = idx + 2;
    const stepCode = normalizeStepCode(row["order_line_step_code"]);
    const glCode = row["gl_cost_center_code"];
    const bud = row["business_unit_description"];

    if (stepCode === "post" && !isBlank(glCode) && isBlank(bud)) {
      const { column, cellRef } = refFor(sheetName, columnMaps, "business_unit_description", excelRow);
      details.push({
        rowIndex: excelRow,
        sheet: sheetName,
        field: "business_unit_description",
        column,
        cellRef,
        value: null,
        issue: `Row ${excelRow}, column 'business_unit_description' (cell ${cellRef}) is blank for a posted order (step=post, gl_cost_center_code=${glCode}).`,
        relatedData: { gl_cost_center_code: glCode, order_line_step_code: row["order_line_step_code"] },
      });
    }
  });

  return {
    checkId: "C5",
    checkName: "Business Unit Description Check",
    description: "business_unit_description must not be blank for posted orders (can be blank for open/cncl with blank gl_cost_center_code).",
    status: details.length === 0 ? "pass" : "fail",
    count: details.length,
    total: oli.filter((r) => normalizeStepCode(r["order_line_step_code"]) === "post").length,
    details: details.slice(0, MAX_DETAILS),
    message:
      details.length === 0
        ? "Business unit descriptions are present for all posted orders."
        : `${details.length} posted orders have blank business_unit_description.`,
  };
}

// CHECK 6: Non-earning records (mktcls_modified=1) should only map dormant accounts (dormant_account_flag=1)
function checkNonEarningDormant(sheets: SheetData, columnMaps: ColumnMaps): AnomalyResult {
  const laName = "Loyalty_Account";
  const la = (sheets[laName] ?? []) as Record<string, unknown>[];
  const { name: thName, rows: th } = resolveSheet(sheets, TH_NAMES);

  if (!la.length) {
    return {
      checkId: "C6",
      checkName: "Non-Earning Records Dormant Check",
      description: "Non-earning records (mktcls_modified=1) should only be mapped for dormant accounts (dormant_account_flag=1).",
      status: "warning",
      message: "Loyalty_Account sheet not found or empty.",
    };
  }

  const dormantMap: Record<string, number> = {};
  la.forEach((row) => {
    const lid = String(row["loyalty_id"] ?? "").trim();
    dormantMap[lid] = Number(row["dormant_account_flag"] ?? 0);
  });

  const sourceRows = th.length ? th : la;
  const details: AnomalyDetail[] = [];

  if (th.length) {
    th.forEach((row, idx) => {
      const excelRow = idx + 2;
      const mktcls = Number(row["mktcls_modified"] ?? 0);
      const mid = String(row["member_id"] ?? "").trim();
      if (mktcls === 1) {
        const dormant = dormantMap[mid] ?? 0;
        if (dormant !== 1) {
          const { column, cellRef } = refFor(thName, columnMaps, "mktcls_modified", excelRow);
          details.push({
            rowIndex: excelRow,
            sheet: thName,
            field: "mktcls_modified",
            column,
            cellRef,
            value: mktcls,
            issue: `Row ${excelRow}, column 'mktcls_modified' (cell ${cellRef}): member_id ${mid} is non-earning (mktcls_modified=1) but dormant_account_flag=${dormant} (should be 1).`,
            relatedData: { member_id: mid, dormant_account_flag: dormant },
          });
        }
      }
    });
  } else {
    la.forEach((row, idx) => {
      const excelRow = idx + 2;
      const mktcls = Number(row["mktcls_modified"] ?? 0);
      const dormant = Number(row["dormant_account_flag"] ?? 0);
      if (mktcls === 1 && dormant !== 1) {
        const { column, cellRef } = refFor(laName, columnMaps, "mktcls_modified", excelRow);
        details.push({
          rowIndex: excelRow,
          sheet: laName,
          field: "mktcls_modified",
          column,
          cellRef,
          value: mktcls,
          issue: `Row ${excelRow}, column 'mktcls_modified' (cell ${cellRef}): loyalty_id ${row["loyalty_id"]} has mktcls_modified=1 but dormant_account_flag=${dormant} (should be 1).`,
          relatedData: { loyalty_id: row["loyalty_id"], dormant_account_flag: dormant },
        });
      }
    });
  }

  return {
    checkId: "C6",
    checkName: "Non-Earning Records Dormant Check",
    description: "Non-earning records (mktcls_modified=1) should only be mapped for dormant accounts (dormant_account_flag=1). For non-dormant accounts, mktcls_modified should be 0 or NULL.",
    status: details.length === 0 ? "pass" : "fail",
    count: details.length,
    total: sourceRows.length,
    details: details.slice(0, MAX_DETAILS),
    message:
      details.length === 0
        ? "All non-earning records are correctly mapped to dormant accounts only."
        : `${details.length} non-earning records are mapped to non-dormant accounts.`,
  };
}

// CHECK 7: date_of_transaction NULL check (ineligible vs eligible count)
function checkDateOfTransaction(sheets: SheetData, columnMaps: ColumnMaps): AnomalyResult {
  const sheetName = "Order_line_item";
  const oli = (sheets[sheetName] ?? []) as Record<string, unknown>[];
  if (!oli.length) {
    return {
      checkId: "C7",
      checkName: "Date of Transaction NULL Check",
      description: "Count of records with NULL date_of_transaction (ineligible) vs NOT NULL (eligible/mapped).",
      status: "info",
      message: "Order_line_item sheet not found or empty.",
    };
  }

  const total = oli.length;
  const details: AnomalyDetail[] = [];
  oli.forEach((row, idx) => {
    const excelRow = idx + 2;
    if (isBlank(row["date_of_transaction"])) {
      const { column, cellRef } = refFor(sheetName, columnMaps, "date_of_transaction", excelRow);
      details.push({
        rowIndex: excelRow,
        sheet: sheetName,
        field: "date_of_transaction",
        column,
        cellRef,
        value: null,
        issue: `Row ${excelRow}, column 'date_of_transaction' (cell ${cellRef}) is NULL (ineligible record).`,
      });
    }
  });

  const nullCount = details.length;
  const nonNullCount = total - nullCount;

  return {
    checkId: "C7",
    checkName: "Date of Transaction NULL Check",
    description: "Ineligible = date_of_transaction IS NULL; Eligible/Mapped = date_of_transaction IS NOT NULL. B - C = D validation.",
    status: "info",
    count: nullCount,
    total,
    details: details.slice(0, MAX_DETAILS),
    message: `Total: ${total} | Ineligible (NULL date): ${nullCount} | Eligible (mapped): ${nonNullCount} | B - C = D: ${total} - ${nullCount} = ${nonNullCount}`,
  };
}

// CHECK 8: Scheduler count vs data count validation
function checkSchedulerCountMatch(sheets: SheetData, columnMaps: ColumnMaps): AnomalyResult {
  const { name: thName, rows: th } = resolveSheet(sheets, TH_NAMES);
  if (!th.length) {
    return {
      checkId: "C8",
      checkName: "Scheduler Count vs Output Count",
      description: "The count from scheduler logs (A) must equal the output count (D). B - C = D.",
      status: "warning",
      message: "Transaction_History sheet not found or empty.",
    };
  }

  const total = th.length;
  const hasCol = !!columnMaps?.[thName]?.["scheduler_processed"];
  if (!hasCol) {
    return {
      checkId: "C8",
      checkName: "Scheduler Count vs Output Count",
      description: "Scheduler count (A) should match the total output records (D). Verify B - C = D.",
      status: "info",
      total,
      message: `'scheduler_processed' column not present in ${thName}; cannot verify scheduler vs output count. Total records: ${total}.`,
    };
  }

  const details: AnomalyDetail[] = [];
  let processed = 0;
  th.forEach((row, idx) => {
    const excelRow = idx + 2;
    const val = row["scheduler_processed"];
    if (val !== null && val !== undefined && String(val).trim() !== "") {
      processed++;
    } else {
      const { column, cellRef } = refFor(thName, columnMaps, "scheduler_processed", excelRow);
      details.push({
        rowIndex: excelRow,
        sheet: thName,
        field: "scheduler_processed",
        column,
        cellRef,
        value: null,
        issue: `Row ${excelRow}, column 'scheduler_processed' (cell ${cellRef}) is empty (record not linked to a scheduler run).`,
      });
    }
  });

  const unlinked = details.length;

  return {
    checkId: "C8",
    checkName: "Scheduler Count vs Output Count",
    description: "Scheduler count (A) should match the total output records (D). Verify B - C = D.",
    status: unlinked > 0 ? "warning" : "info",
    count: processed,
    total,
    details: details.slice(0, MAX_DETAILS),
    message: `Total transaction records: ${total} | Scheduler-linked records: ${processed} | Unlinked: ${unlinked}`,
  };
}

// CHECK 9: date_of_transaction should match run date (job run date = previous day)
function checkRunDate(sheets: SheetData, columnMaps: ColumnMaps): AnomalyResult {
  const sheetName = "Order_line_item";
  const oli = (sheets[sheetName] ?? []) as Record<string, unknown>[];
  if (!oli.length) {
    return {
      checkId: "C9",
      checkName: "Run Date Consistency Check",
      description: "date_of_transaction or load_date should reflect the job run date (previous day).",
      status: "warning",
      message: "Order_line_item sheet not found or empty.",
    };
  }

  const loadDates = oli
    .map((r) => r["load_date"])
    .filter((d) => !isBlank(d))
    .map((d) => String(d).trim());

  const uniqueDates = [...new Set(loadDates)].sort();
  const latestDate = uniqueDates[uniqueDates.length - 1] ?? "N/A";

  const details: AnomalyDetail[] = [];
  oli.forEach((row, idx) => {
    const excelRow = idx + 2;
    const ld = String(row["load_date"] ?? "").trim();
    if (!isBlank(ld) && ld !== latestDate) {
      const { column, cellRef } = refFor(sheetName, columnMaps, "load_date", excelRow);
      details.push({
        rowIndex: excelRow,
        sheet: sheetName,
        field: "load_date",
        column,
        cellRef,
        value: ld,
        issue: `Row ${excelRow}, column 'load_date' (cell ${cellRef}) = '${ld}', differs from the most recent run date '${latestDate}'.`,
      });
    }
  });

  return {
    checkId: "C9",
    checkName: "Run Date Consistency Check",
    description: "All records should share the same load/run date (previous day's job run date).",
    status: details.length > 0 ? "warning" : "pass",
    count: details.length,
    total: oli.length,
    details: details.slice(0, MAX_DETAILS),
    message:
      details.length === 0
        ? `All records have consistent run date: ${latestDate}.`
        : `${details.length} records have a different load_date than the most recent (${latestDate}). Unique dates found: ${uniqueDates.slice(0, 5).join(", ")}`,
  };
}

export function runAllChecks(sheets: SheetData, columnMaps: ColumnMaps = {}): AnomalyResult[] {
  return [
    checkNoBlankColumns(sheets, columnMaps),
    checkTotalVsRedeemablePoints(sheets, columnMaps),
    checkStepCodes(sheets, columnMaps),
    checkPLTRMatch(sheets, columnMaps),
    checkBusinessUnitDesc(sheets, columnMaps),
    checkNonEarningDormant(sheets, columnMaps),
    checkDateOfTransaction(sheets, columnMaps),
    checkSchedulerCountMatch(sheets, columnMaps),
    checkRunDate(sheets, columnMaps),
  ];
}
