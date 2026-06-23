export interface AnomalyResult {
  checkId: string;
  checkName: string;
  description: string;
  status: "pass" | "fail" | "warning" | "info";
  count?: number;
  total?: number;
  details?: AnomalyDetail[];
  message: string;
  aiExplanation?: string; //  Added to support Groq explanation text blocks
}

export interface AnomalyDetail {
  rowIndex?: number;
  sheet?: string;
  field?: string;
  column?: string; // Excel column letter, e.g. "D"
  cellRef?: string; // A1-style reference, e.g. "Order_line_item!D45"
  value?: string | number | null;
  issue?: string;
  relatedData?: Record<string, unknown>;
}

export interface SheetData {
  [sheetName: string]: Record<string, unknown>[];
}

export interface SheetMapping {
  orderItemSheet?: string;
  mpcSheet?: string;
  schedulerSheet?: string;
}

// Maps a sheet name -> (header name -> Excel column letter), used to build A1 cell refs.
export type ColumnMaps = Record<string, Record<string, string>>;

export interface AnalysisReport {
  filename: string;
  analyzedAt: string;
  runDate: string;
  sheetsFound: string[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  checks: AnomalyResult[];
  rawSheetsData?: any; //  Added to safely transport parsed excel arrays to Recharts UI
}

export interface LoyaltyAccount {
  loyalty_id: string | number;
  mktcls_modified?: number | null;
  dormant_account_flag?: number | null;
  business_unit_description?: string | null;
  [key: string]: unknown;
}

export interface OrderLineItem {
  order_line_number?: string;
  member_id?: string | number;
  order_line_step_code?: string;
  points_left_to_redeem?: number | null;
  total_redeemable_points?: number | null;
  date_of_transaction?: string | null;
  business_unit_description?: string | null;
  gl_cost_center_code?: string | number | null;
  order_type?: string;
  load_date?: string | null;
  [key: string]: unknown;
}

export interface TransactionHistory {
  member_id?: string | number;
  transaction_id?: string;
  points?: number | null;
  points_left_to_redeem?: number | null;
  total_redeemable_points?: number | null;
  date_of_transaction?: string | null;
  business_unit_description?: string | null;
  mktcls_modified?: number | null;
  dormant_account_flag?: number | null;
  [key: string]: unknown;
}

// ----- AI agents + RAG -----

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface RetrievedChunk {
  id: string;
  source: string;
  text: string;
  score: number;
}

export interface ExplainResponse {
  checkId: string;
  explanation: string; // markdown
  sources: string[];
}