"use server";

import { revalidatePath } from "next/cache";

import { resolveCode } from "@/lib/events/rooms";
import { findParticipation } from "@/lib/events/participants";
import { text } from "@/lib/form-value";
import { getPlayerSession } from "@/lib/players/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-context";
import { cancelFlare, removeFromBinder } from "./repository";
import { kindSchema } from "./schema";

/**
 * Taking a card off a board or out of the binder.
 *
 * Posting goes through the composer (src/lib/flares/publish-actions.ts);
 * this is the one form left on a room page. It is a public POST
 * endpoint, so it re-establishes the whole chain itself: a valid player
 * session, an event that exists, and that this player is actually in
 * that room. None of it is inferred from the page that rendered the form.
 */

/**
 * Generous, because a player emptying a binder into the app is using the
 * feature exactly as intended, and a whole store shares one network — the same
 * reasoning as card search and joining a room.
 */
const WRITE_MAX = 120;
const WRITE_WINDOW_MS = 5 * 60 * 1000;

async function overRate(): Promise<boolean> {
  const rate = checkRateLimit(
    `list-write:${await clientKey()}`,
    WRITE_MAX,
    WRITE_WINDOW_MS,
  );
  return !rate.allowed;
}

/**
 * Establishes that the caller is a player in this room.
 *
 * Returns the event and session together so no caller can act on one without
 * having checked the other.
 */
async function requirePlayerInRoom(code: string): Promise<{
  eventId: string;
  playerSessionId: string;
} | null> {
  const session = await getPlayerSession();
  if (!session) return null;

  /*
   * Resolved, never opened. Posting a Flare is not a way into a room — if the
   * store's walk-in room has gone quiet since the page rendered, this fails
   * the membership check below rather than quietly starting a new room and
   * writing the card into it.
   */
  const resolved = await resolveCode(code);
  if (resolved.outcome !== "room") return null;

  const participation = await findParticipation(resolved.room.id, session.id);
  if (!participation) return null;

  return {
    eventId: resolved.room.id,
    playerSessionId: session.id,
  };
}

export async function removeListEntryAction(formData: FormData): Promise<void> {
  const code = text(formData, "code");
  const entryId = text(formData, "entryId");
  const kind = kindSchema.safeParse(text(formData, "kind"));

  if (!kind.success || (await overRate())) return;

  const room = await requirePlayerInRoom(code);
  if (!room) return;

  /*
   * Both are scoped to this player's own session inside the repository, so
   * knowing an id is not authority to pull someone else's Flare off a public
   * board or to empty their binder.
   */
  if (kind.data === "flare") {
    await cancelFlare(entryId, room.playerSessionId);
  } else {
    await removeFromBinder(entryId, room.playerSessionId);
  }

  revalidatePath(`/e/${code}`);
}
