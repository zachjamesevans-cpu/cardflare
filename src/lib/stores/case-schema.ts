/**
 * The case, in the shapes both halves of the console share.
 *
 * Free of server-only imports so the picker (a client component) and the
 * unit tests can read the size and the state without dragging the
 * repository in.
 */

/** Six slots: the row the founder approved, one glass shelf wide. */
export const CASE_SIZE = 6;

/** One card in the case, as the page and the picker draw it. */
export interface CasePick {
  cardId: string;
  cardName: string;
  cardNumber: string;
  imageUrl: string | null;
}

export interface CaseFormState {
  status: "idle" | "done" | "error";
  message: string;
}

export const CASE_IDLE: CaseFormState = { status: "idle", message: "" };

/**
 * The picks a form posted, cleaned: blanks dropped, repeats folded to
 * their first slot, and never more than the case holds. Pure, so the
 * rule the server enforces is the one the test reads.
 */
export function normalizeCasePicks(cardIds: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of cardIds) {
    const cardId = raw.trim();
    if (!cardId || seen.has(cardId)) continue;
    seen.add(cardId);
    out.push(cardId);
    if (out.length === CASE_SIZE) break;
  }
  return out;
}
