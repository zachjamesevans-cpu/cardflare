/**
 * Why a player reports something, free of server imports so the report
 * sheet in the browser and the server that validates it read one list.
 */
export type ReportKind = "post" | "player" | "thread";
export type ReportReason = "spam" | "scam" | "harassment" | "other";

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "scam", label: "Scam or fake listing" },
  { value: "harassment", label: "Harassment" },
  { value: "other", label: "Something else" },
];
