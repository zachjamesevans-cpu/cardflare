"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { replaceCollection } from "@/lib/players/collection";
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
        "That does not look like a Collectr export — no card number and quantity columns.",
      "too-many-lines": "That file has more lines than any collection export should.",
    }[parsed.problem];
    return { status: "error", message };
  }

  const totalsByNumber = aggregateByNumber(parsed.lines);
  const cardIds = await cardsByCompactNumbers([...totalsByNumber.keys()]);

  const totalsByCard = new Map<string, number>();
  const unmatchedLabels: string[] = [];
  let matchedRows = 0;

  for (const line of parsed.lines) {
    if (cardIds.has(line.compactNumber)) {
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
    cardsMatched: totalsByCard.size,
    linesUnmatched,
  };

  if (!(await replaceCollection(playerId, totalsByCard, stats))) {
    return { status: "error", message: GENERIC_ERROR };
  }

  revalidatePath("/account");
  return {
    status: "synced",
    outcome: { syncedAt: new Date().toISOString(), ...stats },
    unmatchedSample: unmatchedLabels.slice(0, UNMATCHED_SAMPLE),
  };
}
