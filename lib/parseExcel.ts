import * as XLSX from "xlsx";
import type { SheetData, ColumnMaps } from "@/types";

export function parseExcelBuffer(buffer: Buffer): {
  sheets: SheetData;
  sheetNames: string[];
  columnMaps: ColumnMaps;
} {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetNames = workbook.SheetNames;
  const sheets: SheetData = {};
  const columnMaps: ColumnMaps = {};

  for (const name of sheetNames) {
    const worksheet = workbook.Sheets[name];

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: null,
      raw: false,
    });
    sheets[name] = rows;

    // Capture each header's Excel column letter (header row is row 1) so checks
    // can report a precise A1 cell reference like "Order_line_item!D45".
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      blankrows: false,
    });
    const headerRow = (matrix[0] ?? []) as unknown[];
    const colMap: Record<string, string> = {};
    headerRow.forEach((h, i) => {
      const key = h == null ? "" : String(h).trim();
      if (key) colMap[key] = XLSX.utils.encode_col(i);
    });
    columnMaps[name] = colMap;
  }

  return { sheets, sheetNames, columnMaps };
}
