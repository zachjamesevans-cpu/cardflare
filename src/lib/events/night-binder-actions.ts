"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getViewer } from "@/lib/auth/session";
import { isValidJoinCode, normalizeJoinCode } from "@/lib/events/join-code";
import { BRINGING_REFUSALS } from "@/lib/events/night-binder-rules";
import {
  nightBinderState,
  saveNightBinders,
  type NightBinderState,
} from "@/lib/events/night-binders";
import { accountIdentity } from "@/lib/players/account-identity";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-context";

/**
 * Binders I'm Bringing, the website's server half. A Server Action is a
 * public POST endpoint, so the player comes from the cookie and every
 * rule is night-binders.ts's, the same the app's route applies.
 */

const eventIdSchema = z.guid();
const picksSchema = z
  .array(z.object({ binderId: z.guid(), eventOnly: z.boolean() }))
  .max(40);

const SAVE_MAX = 60;
const SAVE_WINDOW_MS = 10 * 60 * 1000;

export async function nightBinderStateAction(
  eventId: string,
): Promise<{ ok: true; state: NightBinderState } | { ok: false; message: string }> {
  const id = eventIdSchema.safeParse(eventId);
  if (!id.success) return { ok: false, message: BRINGING_REFUSALS.unavailable };
  const account = await accountIdentity(await getViewer());
  if (!account) return { ok: false, message: BRINGING_REFUSALS["not-going"] };
  const state = await nightBinderState(id.data, account.playerId);
  if (!state) return { ok: false, message: BRINGING_REFUSALS.unavailable };
  return { ok: true, state };
}

export async function saveNightBindersAction(
  eventId: string,
  picks: { binderId: string; eventOnly: boolean }[],
  /** The room's code, to repaint its pages: never trusted for anything else. */
  code: string | null,
): Promise<{ ok: true; state: NightBinderState } | { ok: false; message: string }> {
  const id = eventIdSchema.safeParse(eventId);
  const parsed = picksSchema.safeParse(picks);
  if (!id.success || !parsed.success) {
    return { ok: false, message: BRINGING_REFUSALS.unavailable };
  }
  const account = await accountIdentity(await getViewer());
  if (!account) return { ok: false, message: BRINGING_REFUSALS["not-going"] };

  const rate = checkRateLimit(
    `night-binders:${await clientKey()}`,
    SAVE_MAX,
    SAVE_WINDOW_MS,
  );
  if (!rate.allowed) {
    return { ok: false, message: "Too many changes just now. Please wait a moment." };
  }

  const result = await saveNightBinders(id.data, account.playerId, parsed.data);
  if (!result.ok) return { ok: false, message: BRINGING_REFUSALS[result.reason] };

  if (code && isValidJoinCode(normalizeJoinCode(code))) {
    revalidatePath(`/e/${normalizeJoinCode(code)}`, "layout");
  }
  revalidatePath("/nights");
  return { ok: true, state: result.state };
}
