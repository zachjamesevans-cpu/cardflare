"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getViewer } from "@/lib/auth/session";
import { accountIdentity } from "@/lib/players/account-identity";
import { getPlayerSession, setPlayerCookie } from "@/lib/players/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-context";
import { setGoing, type GoingResult } from "./going";

/**
 * The Going button's server half, for the website.
 *
 * A Server Action is a public POST endpoint, so the player comes from
 * the cookie and the event from the clock, never from the button. The
 * same `setGoing` the app's route calls, so a tap on either surface
 * lands on one seat.
 */

const GOING_MAX = 40;
const GOING_WINDOW_MS = 10 * 60 * 1000;

const eventIdSchema = z.guid();

const MESSAGES: Record<Exclude<GoingResult, { ok: true }>["reason"], string> = {
  "not-found": "That night could not be found.",
  "not-open": "This night is not taking Going right now.",
  "no-account": "Sign in to say you're going.",
  unavailable: "Something went wrong on our end. Please try again in a moment.",
};

export async function goingAction(
  eventId: string,
  going: boolean,
): Promise<
  { ok: true; youGoing: boolean; goingCount: number } | { ok: false; message: string }
> {
  const id = eventIdSchema.safeParse(eventId);
  if (!id.success) return { ok: false, message: MESSAGES["not-found"] };

  const account = await accountIdentity(await getViewer());
  if (!account) return { ok: false, message: MESSAGES["no-account"] };

  const rate = checkRateLimit(`going:${await clientKey()}`, GOING_MAX, GOING_WINDOW_MS);
  if (!rate.allowed) {
    return { ok: false, message: "Too many taps just now. Please wait a moment." };
  }

  const result = await setGoing(
    id.data,
    account.playerId,
    account.displayName,
    going,
    await getPlayerSession(),
  );
  if (!result.ok) return { ok: false, message: MESSAGES[result.reason] };

  /* A browser holding no identity is handed the account's, the way the
     join form hands one over, so the room page knows the seat is yours. */
  if (result.freshToken) await setPlayerCookie(result.freshToken);

  revalidatePath("/nights");
  revalidatePath("/feed");
  if (result.code) revalidatePath(`/e/${result.code}`);
  revalidatePath(`/s/${result.storeId}`);

  return { ok: true, youGoing: result.youGoing, goingCount: result.goingCount };
}
