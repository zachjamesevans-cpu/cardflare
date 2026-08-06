"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { findParticipation } from "@/lib/events/participants";
import { isValidJoinCode, normalizeJoinCode } from "@/lib/events/join-code";
import { resolveCode } from "@/lib/events/rooms";
import { text } from "@/lib/form-value";
import { getPlayerSession } from "@/lib/players/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-context";
import { clearWantForFlare } from "@/lib/players/wants";
import { confirmTrade } from "./repository";

/**
 * Confirming a trade. One action for both shapes: with a partner (tapped
 * from an offer, which is the proof they said "I have this") and without
 * (the trade happened with somebody who never used the app's offer button —
 * still worth the tally).
 *
 * A plain form action, same as offers: the whole chain — session, room,
 * membership — is re-established here because a Server Action is a public
 * POST endpoint, and `confirmTrade` re-checks ownership and the partner's
 * offer server-side.
 */

const CONFIRM_MAX = 30;
const CONFIRM_WINDOW_MS = 5 * 60 * 1000;

export async function confirmTradeAction(formData: FormData): Promise<void> {
  const code = normalizeJoinCode(text(formData, "code"));
  if (!isValidJoinCode(code)) return;

  const flareId = text(formData, "flareId");
  if (!flareId) redirect(`/e/${code}`);

  const rate = checkRateLimit(
    `trade:${await clientKey()}`,
    CONFIRM_MAX,
    CONFIRM_WINDOW_MS,
  );
  if (!rate.allowed) redirect(`/e/${code}`);

  const session = await getPlayerSession();
  if (!session) redirect(`/e/${code}`);

  // Resolved, never entered: confirming a trade is not a way into a room.
  const resolved = await resolveCode(code);
  if (resolved.outcome !== "room") redirect(`/e/${code}`);

  const participation = await findParticipation(resolved.room.id, session.id);
  if (!participation) redirect(`/e/${code}`);

  const partner = text(formData, "partnerSessionId");

  const outcome = await confirmTrade(
    flareId,
    resolved.room.id,
    session.id,
    partner || null,
  );

  if (!outcome.ok) {
    // The re-render shows the truthful state; the reason is for the logs.
    console.error(`Trade confirm refused: ${outcome.reason}`);
  } else {
    // A found card leaves the requester's saved wants by itself.
    await clearWantForFlare(flareId);
  }

  revalidatePath(`/e/${code}`);
  redirect(`/e/${code}`);
}
