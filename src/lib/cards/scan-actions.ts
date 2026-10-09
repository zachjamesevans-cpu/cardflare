"use server";

import { getViewer } from "@/lib/auth/session";
import {
  type ScanAccess,
  type ScanOutcome,
  scanCard,
  scannerAccess,
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

export async function scanCardAction(form: FormData): Promise<ScanOutcome> {
  const who = await scanner();
  if (!who) return { ok: false, reason: "not-allowed" };
  const photo = form.get("photo");
  if (!(photo instanceof Blob)) return { ok: false, reason: "no-card" };
  return scanCard(who, new Uint8Array(await photo.arrayBuffer()));
}
