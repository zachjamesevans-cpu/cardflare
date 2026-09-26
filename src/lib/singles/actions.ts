"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { storeHasFeature } from "@/lib/stores/ultra-access";
import { text } from "@/lib/form-value";
import { MAX_FILE_BYTES, parseSinglesExport } from "./csv";
import { UNMATCHED_SAMPLE, type SyncSinglesState } from "./schema";
import { replaceSingles, resolveSinglesCards } from "./repository";

const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";

/** Whether the current viewer may sync this store's singles. */
async function authorizeStore(storeId: string): Promise<boolean> {
  const viewer = await getViewer();

  const member =
    viewer.kind === "admin" ||
    (viewer.kind === "store" && viewer.storeIds.includes(storeId));

  /* The singles sync is Ultra's; the page shows the trial card instead. */
  return member && (await storeHasFeature(storeId, "singles"));
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
      message:
        "That file is over 4 MB. Export in-stock items only from TCGplayer and upload that.",
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

  const cardByLine = await resolveSinglesCards(parsed.lines);

  /* The export lists a card once per condition and printing; the room
     only asks "does the counter have it", so quantities sum per card. */
  const totalsByCard = new Map<string, number>();
  const unmatchedLabels: string[] = [];
  let matchedRows = 0;

  for (const line of parsed.lines) {
    const cardId = cardByLine.get(line.line);
    if (cardId) {
      matchedRows += 1;
      totalsByCard.set(cardId, (totalsByCard.get(cardId) ?? 0) + line.quantity);
    } else {
      unmatchedLabels.push(line.name || line.compactNumber);
    }
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

  /* The form lives on /store/singles; its stat line is read there. */
  revalidatePath("/store");
  revalidatePath("/store/singles");
  return {
    status: "synced",
    outcome: { syncedAt: new Date().toISOString(), ...stats },
    unmatchedSample: unmatchedLabels.slice(0, UNMATCHED_SAMPLE),
  };
}
