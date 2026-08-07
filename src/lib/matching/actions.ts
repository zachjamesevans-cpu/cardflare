"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { findParticipation } from "@/lib/events/participants";
import { isValidJoinCode, normalizeJoinCode } from "@/lib/events/join-code";
import { resolveCode } from "@/lib/events/rooms";
import { text } from "@/lib/form-value";
import { notifyOfferReceived } from "@/lib/notifications/notify";
import { getPlayerSession } from "@/lib/players/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-context";
import { offerTrade, withdrawOffer } from "./repository";
import { offerMessageSchema } from "./schema";

/**
 * Offering to answer a Flare, and taking the offer back.
 *
 * Plain form actions like `setOpenToTradesAction`: no `useActionState`, so
 * the rows on the board stay Server Components and the forms work before
 * hydration. Failure re-renders the page with the old state, which is honest
 * — the one case a player would genuinely wonder about (the Flare vanished
 * between render and tap) also re-renders without the Flare, which explains
 * itself.
 *
 * Both re-establish the whole chain: session, room, membership. The flare id
 * in the form proves nothing — `offerTrade` checks it belongs to this room.
 */

const OFFER_MAX = 60;
const OFFER_WINDOW_MS = 5 * 60 * 1000;

async function requirePlayerInRoom(
  code: string,
): Promise<{ eventId: string; playerSessionId: string; displayName: string } | null> {
  const session = await getPlayerSession();
  if (!session) return null;

  // Resolved, never entered: offering to trade is not a way into a room.
  const resolved = await resolveCode(code);
  if (resolved.outcome !== "room") return null;

  const participation = await findParticipation(resolved.room.id, session.id);
  if (!participation) return null;

  return {
    eventId: resolved.room.id,
    playerSessionId: session.id,
    displayName: session.display_name,
  };
}

export async function offerTradeAction(formData: FormData): Promise<void> {
  const code = normalizeJoinCode(text(formData, "code"));
  if (!isValidJoinCode(code)) return;

  const flareId = text(formData, "flareId");
  if (!flareId) redirect(`/e/${code}`);

  const rate = checkRateLimit(`offer:${await clientKey()}`, OFFER_MAX, OFFER_WINDOW_MS);
  if (!rate.allowed) redirect(`/e/${code}`);

  const membership = await requirePlayerInRoom(code);
  if (!membership) redirect(`/e/${code}`);

  const message = offerMessageSchema.safeParse(text(formData, "message") ?? "");

  const outcome = await offerTrade(
    flareId,
    membership.eventId,
    membership.playerSessionId,
    // An over-long or malformed message costs the note, never the offer —
    // the offer is the thing that matters and the note is a nicety.
    message.success ? message.data : null,
  );

  if (!outcome.ok) {
    // Logged for the curious; the page re-render shows the truthful state.
    console.error(`Offer refused: ${outcome.reason}`);
  } else {
    // The requester may have wandered off; their account gets a nudge.
    // Deduped inside per (flare, responder), so editing a message is quiet.
    await notifyOfferReceived(
      flareId,
      membership.playerSessionId,
      membership.displayName,
      message.success ? message.data : null,
    );
  }

  revalidatePath(`/e/${code}`);
  redirect(`/e/${code}`);
}

export async function withdrawOfferAction(formData: FormData): Promise<void> {
  const code = normalizeJoinCode(text(formData, "code"));
  if (!isValidJoinCode(code)) return;

  const flareId = text(formData, "flareId");
  if (!flareId) redirect(`/e/${code}`);

  const membership = await requirePlayerInRoom(code);
  if (!membership) redirect(`/e/${code}`);

  await withdrawOffer(flareId, membership.playerSessionId);

  revalidatePath(`/e/${code}`);
  redirect(`/e/${code}`);
}
