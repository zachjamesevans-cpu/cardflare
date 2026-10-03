"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getViewer } from "@/lib/auth/session";
import { findEventById } from "@/lib/events/repository";
import { accountIdentity } from "@/lib/players/account-identity";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-context";
import { setPacked } from "./night-matches";

/**
 * The What to bring checklist's server half, for the website.
 *
 * A Server Action is a public POST endpoint, so the player comes from
 * the cookie and never from the checkbox. The same `setPacked` the
 * app's route calls, so a tick on either surface is one row.
 */

const PACKED_MAX = 120;
const PACKED_WINDOW_MS = 10 * 60 * 1000;

const idSchema = z.guid();

export async function setPackedAction(
  eventId: string,
  cardId: string,
  packed: boolean,
): Promise<{ ok: boolean }> {
  const event = idSchema.safeParse(eventId);
  const card = idSchema.safeParse(cardId);
  if (!event.success || !card.success || typeof packed !== "boolean") {
    return { ok: false };
  }

  const account = await accountIdentity(await getViewer());
  if (!account) return { ok: false };

  const rate = checkRateLimit(
    `packed:${await clientKey()}`,
    PACKED_MAX,
    PACKED_WINDOW_MS,
  );
  if (!rate.allowed) return { ok: false };

  const ok = await setPacked(event.data, account.playerId, card.data, packed);
  if (!ok) return { ok: false };

  /* The page paints the tick optimistically; the next render agrees. */
  const night = await findEventById(event.data);
  if (night?.join_code) revalidatePath(`/e/${night.join_code}`);

  return { ok: true };
}
