"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import {
  printingNamesByCard,
  replaceCollection,
  type CollectionEntry,
} from "@/lib/players/collection";
import { resolvePrintingId } from "@/lib/players/collection-match";
import {
  aggregateByNumber,
  MAX_FILE_BYTES,
  parseSinglesExport,
} from "@/lib/singles/csv";
import { UNMATCHED_SAMPLE, type SyncSinglesState } from "@/lib/singles/schema";
import { cardsByCompactNumbers } from "@/lib/singles/repository";

const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";

/**
 * Imports a player's Collectr collection export into their account.
 *
 * Same parser, same commitments as the store singles sync: the file is the
 * player's own data, prices never leave the parser, matching is exact card
 * number against the catalog, and the response is a count — the collection
 * is never rendered as a list anywhere, including right here.
 *
 * The player is the signed-in account, never a form field: an uploaded
 * file can only ever land in the uploader's own collection.
 */
export async function syncCollectionAction(
  _previous: SyncSinglesState,
  formData: FormData,
): Promise<SyncSinglesState> {
  const viewer = await getViewer();

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);

  if (!playerId) return { status: "error", message: GENERIC_ERROR };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Choose your Collectr export first." };
  }

  if (file.size > MAX_FILE_BYTES) {
    return {
      status: "error",
      message: "That file is larger than any collection export should be.",
    };
  }

  const parsed = parseSinglesExport(await file.text());

  if (!parsed.ok) {
    const message = {
      empty: "That file is empty.",
      "no-header":
        "That does not look like a Collectr export: it has no card number and quantity columns.",
      "too-many-lines": "That file has more lines than any collection export should.",
    }[parsed.problem];
    return { status: "error", message };
  }

  const totalsByNumber = aggregateByNumber(parsed.lines);
  const cardIds = await cardsByCompactNumbers([...totalsByNumber.keys()]);

  /*
   * Printing resolution, line by line: the file's product name against the
   * provider's own printing names for that exact card. "Perona (Alternate
   * Art)" in the file and in the catalog is a proven printing and matches
   * a Flare for that alt art exactly; any disagreement leaves the line
   * printing-unknown, which downgrades honestly instead of guessing.
   */
  const printingsByCard = await printingNamesByCard([
    ...new Set([...cardIds.values()]),
  ]);

  const totals = new Map<string, CollectionEntry>();
  const unmatchedLabels: string[] = [];
  let matchedRows = 0;

  for (const line of parsed.lines) {
    const cardId = cardIds.get(line.compactNumber);

    if (!cardId) {
      unmatchedLabels.push(line.name || line.compactNumber);
      continue;
    }

    matchedRows += 1;

    const printingId = resolvePrintingId(line.name, printingsByCard.get(cardId) ?? []);
    const key = `${cardId}:${printingId ?? ""}`;
    const entry = totals.get(key) ?? { cardId, printingId, quantity: 0 };
    entry.quantity += line.quantity;
    totals.set(key, entry);
  }

  const entries = [...totals.values()];
  const distinctCards = new Set(entries.map((entry) => entry.cardId));

  /*
   * Same honesty as the store sync: rows skipped on purpose (other games,
   * zero quantities) are not failures; "unmatched" is what genuinely
   * contributed nothing.
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
    cardsMatched: distinctCards.size,
    linesUnmatched,
  };

  if (!(await replaceCollection(playerId, entries, stats))) {
    return { status: "error", message: GENERIC_ERROR };
  }

  revalidatePath("/account");
  return {
    status: "synced",
    outcome: { syncedAt: new Date().toISOString(), ...stats },
    unmatchedSample: unmatchedLabels.slice(0, UNMATCHED_SAMPLE),
  };
}
