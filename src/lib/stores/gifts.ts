import "server-only";

import { alertRecipients } from "@/lib/billing/trial-alerts";
import { subscriptionForStore } from "@/lib/billing/repository";
import { isEntitled } from "@/lib/billing/schema";
import { isEmailConfigured, sendEmail } from "@/lib/email/client";
import {
  giftEndedEmail,
  giftReminderEmail,
  type GiftFacts,
} from "@/lib/email/store-gift";
import { siteUrl } from "@/lib/site";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { StoreGiftKind } from "@/lib/supabase/types";
import {
  FOUNDING_PRICE_LABEL,
  FOUNDING_STORE_CAP,
  giftDaysLeft,
  type GiftBar,
  type GiftChoice,
} from "./gift-shared";
import { planDate, storePlan } from "./ultra";
import { ULTRA_PRICE_LABEL } from "./ultra-schema";

/**
 * Ultra as a gift: granted by an admin, with no card and no Stripe.
 *
 * A gift is a handful of columns on the store (see the migration
 * `20261105090000_store_gifts.sql`), and granting one sets `stores.tier`
 * to Ultra, the column every feature gate already reads. Nothing about
 * FlareCast, singles or posts knows a gift exists; that is the point.
 *
 * Three moments in its life, all here:
 *   - granted, from the invitation form or a store's admin page;
 *   - reminded, a week out and on the last day, by the daily sweep;
 *   - ended, by the same sweep, which lowers the tier only when no paid
 *     subscription has taken over. A store that pressed "Keep Ultra"
 *     during its gift is already trialing on Stripe until the gift's
 *     last day, so the end of the gift is the start of the plan.
 *
 * A store that was ever given Ultra keeps the founding price for good:
 * `gift_kind` stays set after the gift ends, and the checkout reads it.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface StoreGift {
  kind: StoreGiftKind;
  startedAt: string;
  until: string | null;
  days: number | null;
  endedAt: string | null;
}

const GIFT_COLUMNS =
  "id, name, kind, contact_email, tier, gift_kind, gift_started_at, gift_until, gift_days, gift_week_notice_at, gift_day_notice_at, gift_ended_at";

function giftFromRow(row: {
  gift_kind: StoreGiftKind | null;
  gift_started_at: string | null;
  gift_until: string | null;
  gift_days: number | null;
  gift_ended_at: string | null;
}): StoreGift | null {
  if (!row.gift_kind || !row.gift_started_at) return null;
  return {
    kind: row.gift_kind,
    startedAt: row.gift_started_at,
    until: row.gift_until,
    days: row.gift_days,
    endedAt: row.gift_ended_at,
  };
}

/** True while the gift is still giving. */
export function giftIsLive(gift: StoreGift | null, now: number = Date.now()): boolean {
  if (!gift || gift.endedAt) return false;
  if (gift.kind === "founding") return true;
  return gift.until !== null && Date.parse(gift.until) > now;
}

export async function giftForStore(storeId: string): Promise<StoreGift | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabaseAdmin()
    .from("stores")
    .select("gift_kind, gift_started_at, gift_until, gift_days, gift_ended_at")
    .eq("id", storeId)
    .maybeSingle();
  return data ? giftFromRow(data) : null;
}

/** The Stripe price for a store that was in the beta, when one is set. */
export function foundingPriceId(): string | null {
  return process.env.STRIPE_PRICE_ULTRA_FOUNDING || null;
}

/** What keeping Ultra costs a store, as every sentence about it says it. */
export function keepPriceLabel(gift: StoreGift | null): string {
  return gift && foundingPriceId() ? FOUNDING_PRICE_LABEL : ULTRA_PRICE_LABEL;
}

/** Founding Stores that exist now; the cap counts these. */
export async function foundingStoresTaken(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const { count } = await getSupabaseAdmin()
    .from("stores")
    .select("id", { count: "exact", head: true })
    .eq("gift_kind", "founding")
    .is("gift_ended_at", null);
  return count ?? 0;
}

export type GrantFailure = "unavailable" | "not-found" | "founding-full";

/**
 * Gives a store Ultra. A timed gift replaces any gift before it and
 * starts counting now; a Founding Store is refused once ten exist.
 * Choosing "none" is `removeGift`, not this.
 */
export async function grantGift(
  storeId: string,
  choice: Exclude<GiftChoice, "none">,
  now: Date = new Date(),
): Promise<{ ok: true; gift: StoreGift } | { ok: false; reason: GrantFailure }> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  const admin = getSupabaseAdmin();

  const { data: store } = await admin
    .from("stores")
    .select("id, gift_kind, gift_ended_at")
    .eq("id", storeId)
    .maybeSingle();
  if (!store) return { ok: false, reason: "not-found" };

  const alreadyFounding = store.gift_kind === "founding" && !store.gift_ended_at;
  if (choice === "founding" && !alreadyFounding) {
    if ((await foundingStoresTaken()) >= FOUNDING_STORE_CAP) {
      return { ok: false, reason: "founding-full" };
    }
  }

  const days = choice === "founding" ? null : Number(choice);
  const startedAt = now.toISOString();
  const until =
    days === null ? null : new Date(now.getTime() + days * DAY_MS).toISOString();

  const { error } = await admin
    .from("stores")
    .update({
      tier: "ultra",
      gift_kind: choice === "founding" ? "founding" : "timed",
      gift_started_at: startedAt,
      gift_until: until,
      gift_days: days,
      gift_week_notice_at: null,
      gift_day_notice_at: null,
      gift_ended_at: null,
    })
    .eq("id", storeId);

  if (error) {
    console.error("Could not grant the gift", error);
    return { ok: false, reason: "unavailable" };
  }

  return {
    ok: true,
    gift: {
      kind: choice === "founding" ? "founding" : "timed",
      startedAt,
      until,
      days,
      endedAt: null,
    },
  };
}

/** The tier the store is owed with no gift: a paid one, or free. */
async function tierWithoutGift(storeId: string): Promise<"ultra" | "max" | "free"> {
  const subscription = await subscriptionForStore(storeId);
  if (
    subscription &&
    isEntitled({
      status: subscription.status,
      currentPeriodEnd: subscription.current_period_end,
    }) &&
    (subscription.tier === "ultra" || subscription.tier === "max")
  ) {
    return subscription.tier;
  }
  return "free";
}

/**
 * Takes a gift back, from the admin page. Ends it now rather than
 * erasing it, so the store keeps the founding price it was promised.
 */
export async function removeGift(storeId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const tier = await tierWithoutGift(storeId);
  const { error } = await getSupabaseAdmin()
    .from("stores")
    .update({ tier, gift_ended_at: new Date().toISOString() })
    .eq("id", storeId)
    .not("gift_kind", "is", null)
    .is("gift_ended_at", null);
  if (error) console.error("Could not take the gift back", error);
  return !error;
}

/** How an email and the admin page say a gift. */
export function giftFacts(gift: StoreGift): GiftFacts {
  return {
    kind: gift.kind,
    days: gift.days,
    untilLabel: gift.until ? planDate(gift.until) : null,
    price: keepPriceLabel(gift),
  };
}

/**
 * The green bar at the top of the console, or null for none.
 *
 * A gift says itself first; a store on Stripe's own trial gets the same
 * bar with the trial's days, so there is one design for "how long is
 * left", whichever door the store came in by.
 */
export async function giftBarFor(storeId: string): Promise<GiftBar | null> {
  const [gift, plan] = await Promise.all([giftForStore(storeId), storePlan(storeId)]);
  const price = keepPriceLabel(gift);

  if (gift && !gift.endedAt && gift.kind === "founding") return { state: "founding" };

  if (gift && giftIsLive(gift) && gift.until) {
    return {
      state: "gift",
      daysLeft: giftDaysLeft(gift.until),
      untilLabel: planDate(gift.until) ?? "",
      price,
      kept: plan.state === "trialing" || plan.state === "active",
    };
  }

  if (plan.state === "trialing" && plan.until) {
    return {
      state: "trial",
      daysLeft: giftDaysLeft(plan.until),
      untilLabel: planDate(plan.until) ?? "",
      price,
    };
  }

  /* An ended gift with nothing paid after it: one honest line and the
     one button, until they keep it. */
  if (gift && plan.state !== "active" && plan.state !== "past_due") {
    return { state: "gift-ended", price };
  }

  return null;
}

/**
 * What the Ultra button says and promises for this store: the trial for
 * a store that never had one, "Keep Ultra" at its own price for one
 * that was in the beta. `UltraLocked` and the plan card both read it,
 * so neither offers a free trial the checkout would not give.
 */
export async function ultraOfferFor(
  storeId: string,
): Promise<{ beta: boolean; price: string }> {
  const gift = await giftForStore(storeId);
  return { beta: gift !== null, price: keepPriceLabel(gift) };
}

/**
 * The Checkout terms for a store that was in the beta, or null for the
 * ordinary trial. During a live gift the card is taken now and the
 * first charge lands the day the gift ends (Stripe wants that at least
 * two days out; closer than that, the plan starts now). After the
 * gift, no trial: the gift was it.
 */
export async function giftCheckoutTerms(storeId: string): Promise<{
  priceId: string | null;
  trialEnd: number | null;
  founding: boolean;
} | null> {
  const gift = await giftForStore(storeId);
  if (!gift) return null;
  const founding = gift.kind === "founding" && !gift.endedAt;
  const until = gift.until ? Date.parse(gift.until) : NaN;
  const trialEnd =
    giftIsLive(gift) &&
    Number.isFinite(until) &&
    until - Date.now() > 2 * DAY_MS + 60_000
      ? Math.floor(until / 1000)
      : null;
  return { priceId: foundingPriceId(), trialEnd, founding };
}

/** One line to the founder, the way trial alerts go. Best effort. */
export async function alertFounderOfGift(
  change: "granted" | "kept" | "ended",
  storeName: string,
  detail: string,
): Promise<void> {
  const to = alertRecipients();
  if (to.length === 0 || !isEmailConfigured()) return;
  const subject = {
    granted: `Ultra gift sent: ${storeName}`,
    kept: `Ultra gift kept: ${storeName}`,
    ended: `Ultra gift ended: ${storeName}`,
  }[change];
  const text = `${storeName} ${detail}\n\n${siteUrl()}/admin/stores`;
  for (const address of to) {
    const sent = await sendEmail({
      to: address,
      subject,
      text,
      html: `<p>${text}</p>`,
    });
    if (sent.status === "failed") console.error(`Gift alert failed: ${sent.reason}`);
  }
}

export interface GiftSweep {
  weekNotices: number;
  dayNotices: number;
  ended: number;
  kept: number;
}

/**
 * The daily sweep: the week-out reminder, the last-day reminder, and
 * the end. Each step stamps its column before moving on, so a sweep
 * that runs twice sends nothing twice.
 */
export async function sweepGifts(now: number = Date.now()): Promise<GiftSweep> {
  const result: GiftSweep = { weekNotices: 0, dayNotices: 0, ended: 0, kept: 0 };
  if (!isSupabaseConfigured()) return result;

  const admin = getSupabaseAdmin();
  const horizon = new Date(now + 7 * DAY_MS).toISOString();
  const { data: stores, error } = await admin
    .from("stores")
    .select(GIFT_COLUMNS)
    .eq("gift_kind", "timed")
    .is("gift_ended_at", null)
    .lte("gift_until", horizon);

  if (error) {
    console.error("Could not read the gifts", error);
    return result;
  }

  const origin = siteUrl();
  const stamp = new Date(now).toISOString();

  for (const store of stores ?? []) {
    const gift = giftFromRow(store);
    if (!gift?.until) continue;
    const ends = Date.parse(gift.until);
    const price = keepPriceLabel(gift);
    const untilLabel = planDate(gift.until) ?? "";
    const to = store.contact_email;

    if (ends <= now) {
      const tier = await tierWithoutGift(store.id);
      const { error: endError } = await admin
        .from("stores")
        .update({ tier, gift_ended_at: stamp })
        .eq("id", store.id)
        .is("gift_ended_at", null);
      if (endError) {
        console.error("Could not end the gift", endError);
        continue;
      }
      if (tier === "free") {
        result.ended += 1;
        if (to)
          await sendEmail(giftEndedEmail(store.name, to, origin, store.id, { price }));
        await alertFounderOfGift(
          "ended",
          store.name,
          "reached the end of its Ultra gift without keeping it.",
        );
      } else {
        result.kept += 1;
        await alertFounderOfGift(
          "kept",
          store.name,
          "kept Ultra after its gift; the paid plan has started.",
        );
      }
      continue;
    }

    /* Nobody who already kept Ultra needs reminding to. */
    if ((await tierWithoutGift(store.id)) !== "free") continue;

    const daysLeft = giftDaysLeft(gift.until, now);
    const lastDay = ends - now <= DAY_MS;

    if (lastDay && !store.gift_day_notice_at) {
      await admin
        .from("stores")
        .update({ gift_day_notice_at: stamp })
        .eq("id", store.id);
      result.dayNotices += 1;
      if (to) {
        await sendEmail(
          giftReminderEmail(store.name, to, origin, store.id, {
            daysLeft,
            untilLabel,
            price,
          }),
        );
      }
    } else if (!lastDay && !store.gift_week_notice_at) {
      await admin
        .from("stores")
        .update({ gift_week_notice_at: stamp })
        .eq("id", store.id);
      result.weekNotices += 1;
      if (to) {
        await sendEmail(
          giftReminderEmail(store.name, to, origin, store.id, {
            daysLeft,
            untilLabel,
            price,
          }),
        );
      }
    }
  }

  return result;
}
