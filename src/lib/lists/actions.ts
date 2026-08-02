"use server";

import { revalidatePath } from "next/cache";

import { findEventByJoinCode } from "@/lib/events/repository";
import { findParticipation } from "@/lib/events/participants";
import { text } from "@/lib/form-value";
import { getPlayerSession } from "@/lib/players/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-context";
import {
  addFlare,
  addToBinder,
  cancelFlare,
  confirmBinder,
  removeFromBinder,
} from "./repository";
import { addEntrySchema, atCapMessage, kindSchema, type ListState } from "./schema";

/**
 * Posting a Flare, and keeping the binder.
 *
 * Every one of these is a public POST endpoint, so each re-establishes the
 * whole chain itself: a valid player session, an event that exists, and that
 * this player is actually in that room. None of it is inferred from the page
 * that rendered the form.
 */

const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";

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
async function requirePlayerInRoom(
  code: string,
): Promise<{ eventId: string; playerSessionId: string } | null> {
  const session = await getPlayerSession();
  if (!session) return null;

  const event = await findEventByJoinCode(code);
  if (!event) return null;

  const participation = await findParticipation(event.id, session.id);
  if (!participation) return null;

  return { eventId: event.id, playerSessionId: session.id };
}

export async function addToListAction(
  _previous: ListState,
  formData: FormData,
): Promise<ListState> {
  const kind = kindSchema.safeParse(text(formData, "kind"));
  if (!kind.success) return { status: "error", message: GENERIC_ERROR };

  const code = text(formData, "code");

  if (await overRate()) {
    return {
      status: "error",
      message: "Too many changes from this network. Please wait a moment.",
    };
  }

  /*
   * A binder is not scoped to a room, but adding to it still requires being in
   * one. There is no other surface for it, and it keeps a stolen session from
   * being usable without also being somewhere.
   */
  const room = await requirePlayerInRoom(code);
  if (!room) {
    return {
      status: "error",
      message: "You are not in this room any more. Reload and rejoin.",
    };
  }

  const parsed = addEntrySchema.safeParse({
    cardId: text(formData, "cardId"),
    printingId: text(formData, "printingId"),
    quantity: text(formData, "quantity") || 1,
    note: text(formData, "note"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Please check the details.",
    };
  }

  const result =
    kind.data === "flare"
      ? await addFlare(room.eventId, room.playerSessionId, parsed.data)
      : await addToBinder(room.playerSessionId, parsed.data);

  if (!result.ok) {
    return {
      status: "error",
      message: result.reason === "at-cap" ? atCapMessage(kind.data) : GENERIC_ERROR,
    };
  }

  revalidatePath(`/e/${code}`);

  return {
    status: "added",
    kind: kind.data,
    // Echoed back from the form purely so the confirmation can name the card.
    // Never trusted for anything: the card itself was resolved by id above.
    cardName: text(formData, "cardName").slice(0, 200),
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

/**
 * "Still carrying these?" — yes.
 *
 * The one tap that makes a portable binder safe to match against. Without it a
 * list that follows a player between events quietly rots, and a wrong match
 * costs more trust than a missing one.
 */
export async function confirmBinderAction(formData: FormData): Promise<void> {
  const code = text(formData, "code");

  if (await overRate()) return;

  const room = await requirePlayerInRoom(code);
  if (!room) return;

  await confirmBinder(room.playerSessionId);

  revalidatePath(`/e/${code}`);
}
