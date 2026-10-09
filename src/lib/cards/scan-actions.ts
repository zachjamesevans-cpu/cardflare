"use server";

import { getViewer } from "@/lib/auth/session";
import {
  type PageOutcome,
  type ScanAccess,
  type ScanOutcome,
  scanCard,
  scanPage,
  scanRights,
  scannerAccess,
  type ScanRights,
} from "@/lib/cards/scan";
import { playerForUser } from "@/lib/players/accounts";

/**
 * The website's door to the scanner. The photo arrives as a file the
 * browser has already shrunk; the server decides everything else.
 */

async function scanner(): Promise<{ playerId: string; userId: string } | null> {
  const viewer = await getViewer();
  if (viewer.kind === "anonymous") return null;
  if (viewer.kind === "player")
    return { playerId: viewer.playerId, userId: viewer.user.id };
  const player = await playerForUser(viewer.user.id);
  return player ? { playerId: player.id, userId: viewer.user.id } : null;
}

/** Whether this viewer sees the scan button, the Pro door, or nothing. */
export async function scannerAccessAction(): Promise<ScanAccess> {
  const who = await scanner();
  return who ? scannerAccess(who) : null;
}

/** What this viewer may scan: single cards (and how many free ones are left), whole pages. */
export async function scanRightsAction(): Promise<ScanRights> {
  const who = await scanner();
  return who ? scanRights(who) : { singles: null, singlesLeft: null, pages: null };
}

export async function scanCardAction(form: FormData): Promise<ScanOutcome> {
  const who = await scanner();
  if (!who) return { ok: false, reason: "not-allowed" };
  const photo = form.get("photo");
  if (!(photo instanceof Blob)) return { ok: false, reason: "no-card" };
  return scanCard(who, new Uint8Array(await photo.arrayBuffer()));
}

/** A page: the nine pockets the browser cut out of one photo, "cell0" to "cell8". */
export async function scanPageAction(form: FormData): Promise<PageOutcome> {
  const who = await scanner();
  if (!who) return { ok: false, reason: "not-allowed" };
  const cells = await Promise.all(
    Array.from({ length: 9 }, async (_, slot) => {
      const cell = form.get(`cell${slot}`);
      return cell instanceof Blob ? new Uint8Array(await cell.arrayBuffer()) : null;
    }),
  );
  return scanPage(who, cells);
}
