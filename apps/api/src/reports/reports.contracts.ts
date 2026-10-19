// Report data model, independent of the output format: the service builds it
// from read-only SQL and the PDF renderer only lays it out.

export const REPORT_TYPES = [
  "fleet",
  "personnel",
  "infrastructure",
  "audit-log",
  "alerts",
  "payments",
  "unit-trips",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

/** Report types that require a date range. */
export const RANGED_REPORT_TYPES: readonly ReportType[] = ["audit-log", "alerts", "payments", "unit-trips"];

export interface ReportTable {
  heading: string;
  /** Optional line printed under the heading (e.g. the line's municipalities). */
  note?: string;
  columns: string[];
  rows: string[][];
  /** Printed instead of the table when there are no rows. */
  emptyMessage?: string;
}

export interface ReportDocument {
  title: string;
  subtitle?: string;
  /** Label/value pairs printed as the report's key figures. */
  summary: Array<[string, string]>;
  sections: ReportTable[];
}

export interface ReportMeta {
  generatedBy: string;
  generatedAt: Date;
}

export interface DateRange {
  /** YYYY-MM-DD, inclusive. */
  from: string;
  /** YYYY-MM-DD, inclusive (covers the whole day). */
  to: string;
}

export interface ExportedReport {
  fileName: string;
  content: Buffer;
}
