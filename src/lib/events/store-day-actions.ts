"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getViewer } from "@/lib/auth/session";
import { PLAN_REFUSALS } from "@/lib/events/store-day-rules";
import {
  planVisit,
  storeDays,
  storeHere,
  storePicker,
  type StoreDays,
  type StoreHere,
  type StorePicker,
} from "@/lib/events/store-days";
import { accountIdentity } from "@/lib/players/account-identity";
import { getPlayerSession, setPlayerCookie } from "@/lib/players/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-context";

/**
 * Store days, the website's server half. A Server Action is a public
 * POST endpoint, so the player comes from the cookie and every rule is
 * store-days.ts's, the same the app's routes apply.
 */

const storeIdSchema = z.guid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const coordinate = z.number().finite();

export async function storeDaysAction(storeId: string): Promise<StoreDays | null> {
  const id = storeIdSchema.safeParse(storeId);
  if (!id.success) return null;
  const account = await accountIdentity(await getViewer());
  return storeDays(id.data, account?.playerId ?? null);
}

export async function planVisitAction(
  storeId: string,
  date: string,
): Promise<
  | { ok: true; eventId: string; code: string | null; goingCount: number }
  | { ok: false; message: string }
> {
  const id = storeIdSchema.safeParse(storeId);
  const day = dateSchema.safeParse(date);
  if (!id.success || !day.success)
    return { ok: false, message: PLAN_REFUSALS["bad-day"] };

  const account = await accountIdentity(await getViewer());
  if (!account) return { ok: false, message: PLAN_REFUSALS["no-account"] };

  const rate = checkRateLimit(`going:${await clientKey()}`, 40, 10 * 60 * 1000);
  if (!rate.allowed) {
    return { ok: false, message: "Too many taps just now. Please wait a moment." };
  }

  const result = await planVisit(
    id.data,
    day.data,
    account.playerId,
    account.displayName,
    await getPlayerSession(),
  );
  if (!result.ok) return { ok: false, message: PLAN_REFUSALS[result.reason] };
  if (result.freshToken) await setPlayerCookie(result.freshToken);

  revalidatePath("/nights");
  revalidatePath("/feed");
  revalidatePath(`/s/${id.data}`);
  if (result.code) revalidatePath(`/e/${result.code}`);
  return {
    ok: true,
    eventId: result.eventId,
    code: result.code,
    goingCount: result.goingCount,
  };
}

/** "Find the store I'm in", from the browser's position, used once. */
export async function storeHereAction(
  latitude: number,
  longitude: number,
): Promise<StoreHere | null> {
  const lat = coordinate.min(-90).max(90).safeParse(latitude);
  const lng = coordinate.min(-180).max(180).safeParse(longitude);
  if (!lat.success || !lng.success) return null;
  const rate = checkRateLimit(`store-here:${await clientKey()}`, 30, 10 * 60 * 1000);
  if (!rate.allowed) return null;
  return storeHere(lat.data, lng.data);
}

/** The plan-a-visit picker's stores: the ones you follow, then the ones near you. */
export async function storePickerAction(): Promise<StorePicker> {
  const account = await accountIdentity(await getViewer());
  return storePicker(account?.playerId ?? null, null);
}
