import type { InventoryForm } from "@/lib/supabase/types";

/**
 * "PSA 10", "BGS 9.5", "CGC Authentic", "Raw".
 *
 * The label an attendee reads next to a booth number, so it says what the
 * physical object is and nothing else.
 */
export function slabLabel(
  form: InventoryForm,
  grader: string | null,
  grade: number | null,
): string {
  if (form === "raw") return "Raw";
  if (grade === null) return `${grader} Authentic`;

  // 10, not 10.0 — but 9.5 stays 9.5. Number() drops the trailing zero.
  return `${grader} ${Number(grade)}`;
}
