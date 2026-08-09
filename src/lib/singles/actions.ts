"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { text } from "@/lib/form-value";
import { aggregateByNumber, MAX_FILE_BYTES, parseSinglesExport } from "./csv";
import { UNMATCHED_SAMPLE, type SyncSinglesState } from "./schema";
import { cardsByCompactNumbers, replaceSingles } from "./repository";

const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";

/** Whether the current viewer may sync this store's singles. */
async function authorizeStore(storeId: string): Promise<boolean> {
  const viewer = await getViewer();

  return (
    viewer.kind === "admin" ||
    (viewer.kind === "store" && viewer.storeIds.includes(storeId))
  );
}

/**
 * Syncs a store's counter singles from their own TCGplayer export.
 *
 * The file is the store's data about the store's stock — no scraping, no
 * third-party fetch, nothing the store did not hand over themselves. Price
 * columns never leave the parser; matching is by exact card number against
 * the catalog, and every line that does not make it in is counted and
 * sampled back so the store knows exactly what synced.
 */
export async function syncSinglesAction(
  _previous: SyncSinglesState,
  formData: FormData,
): Promise<SyncSinglesState> {
  const storeId = text(formData, "storeId");
  if (!storeId || !(await authorizeStore(storeId))) {
    return { status: "error", message: GENERIC_ERROR };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return {
      status: "error",
      message: "Choose your TCGplayer inventory export first.",
    };
  }

  if (file.size > MAX_FILE_BYTES) {
    return {
      status: "error",
      message: "That file is larger than any inventory export should be.",
    };
  }

  const parsed = parseSinglesExport(await file.text());

  if (!parsed.ok) {
    const message = {
      empty: "That file is empty.",
      "no-header":
        "That does not look like a TCGplayer inventory export: it has no card number and quantity columns.",
      "too-many-lines": "That file has more lines than any inventory export should.",
    }[parsed.problem];
    return { status: "error", message };
  }

  const totalsByNumber = aggregateByNumber(parsed.lines);
  const cardIds = await cardsByCompactNumbers([...totalsByNumber.keys()]);

  const totalsByCard = new Map<string, number>();
  const unmatchedLabels: string[] = [];
  let matchedRows = 0;

  for (const line of parsed.lines) {
    const cardId = cardIds.get(line.compactNumber);
    if (cardId) {
      matchedRows += 1;
    } else {
      unmatchedLabels.push(line.name || line.compactNumber);
    }
  }

  for (const [number, quantity] of totalsByNumber) {
    const cardId = cardIds.get(number);
    if (cardId) totalsByCard.set(cardId, quantity);
  }

  /*
   * "Unmatched" is every data row that contributed nothing: unreadable
   * rows, rows for numbers the catalog does not know. Rows skipped on
   * purpose (other games, sold-out lines) are not failures and stay out of
   * the count — the sample list shows the genuinely unrecognised.
   */
  const skippedOnPurpose = parsed.skipped.filter(
    (skip) => skip.reason === "other-game" || skip.reason === "zero-quantity",
  ).length;
  const linesUnmatched = parsed.linesSeen - matchedRows - skippedOnPurpose;

  for (const skip of parsed.skipped) {
    if (skip.reason === "no-number" || skip.reason === "no-quantity") {
      unmatchedLabels.push(skip.label);
    }
  }

  const stats = {
    linesSeen: parsed.linesSeen,
    cardsMatched: totalsByCard.size,
    linesUnmatched,
  };

  if (!(await replaceSingles(storeId, totalsByCard, stats))) {
    return { status: "error", message: GENERIC_ERROR };
  }

  revalidatePath("/store");
  return {
    status: "synced",
    outcome: { syncedAt: new Date().toISOString(), ...stats },
    unmatchedSample: unmatchedLabels.slice(0, UNMATCHED_SAMPLE),
  };
}
