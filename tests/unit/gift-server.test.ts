import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  FOUNDING_STORE_CAP,
  GIFT_CHOICES,
  giftDaysLeft,
  isGiftChoice,
} from "@/lib/stores/gift-shared";

const read = (path: string) => readFileSync(path, "utf8");
const flat = (text: string) => text.replace(/\s+/g, " ");

/**
 * Ultra as a beta gift, the server half. The founder: "a quick way to
 * send an extended trial to people with no CC info required... the
 * option to choose lifetime, or 30 days, 60 days, etc."
 */

describe("the choices", () => {
  it("are none, three lengths and the Founding Store, ten of them", () => {
    expect(GIFT_CHOICES).toEqual(["none", "30", "60", "90", "founding"]);
    expect(isGiftChoice("60")).toBe(true);
    expect(isGiftChoice("45")).toBe(false);
    expect(FOUNDING_STORE_CAP).toBe(10);
  });
});

describe("days left", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");
  it("counts a part day as a day and never goes below zero", () => {
    expect(giftDaysLeft("2026-11-04T12:00:00Z", now)).toBe(30);
    expect(giftDaysLeft("2026-10-05T13:00:00Z", now)).toBe(1);
    expect(giftDaysLeft("2026-10-04T12:00:00Z", now)).toBe(0);
    expect(giftDaysLeft("not a date", now)).toBe(0);
  });
});

describe("the gift lives on the store", () => {
  const migration = flat(read("supabase/migrations/20261105090000_store_gifts.sql"));
  const gifts = flat(read("src/lib/stores/gifts.ts"));

  it("is shaped by the database: founding has no end, timed always does", () => {
    expect(migration).toContain(
      "(gift_kind = 'founding' and gift_until is null and gift_started_at is not null)",
    );
    expect(migration).toContain("gift_kind = 'timed' and gift_until is not null");
  });

  it("grants Ultra through the column every gate reads, and caps founding", () => {
    expect(gifts).toContain(
      'tier: "ultra", gift_kind: choice === "founding" ? "founding" : "timed"',
    );
    expect(gifts).toContain(
      'if ((await foundingStoresTaken()) >= FOUNDING_STORE_CAP) { return { ok: false, reason: "founding-full" }; }',
    );
  });

  it("ends a gift rather than erasing it, so the founding price stands", () => {
    const remove = gifts.slice(gifts.indexOf("export async function removeGift("));
    expect(remove.slice(0, 600)).toContain("gift_ended_at: new Date().toISOString()");
    expect(remove.slice(0, 600)).not.toContain("gift_kind: null");
  });
});

describe("the daily sweep", () => {
  const gifts = flat(read("src/lib/stores/gifts.ts"));
  const sweep = gifts.slice(gifts.indexOf("export async function sweepGifts("));

  it("lowers the tier only when nothing paid has taken over", () => {
    expect(sweep).toContain("const tier = await tierWithoutGift(store.id);");
    expect(sweep).toContain(".update({ tier, gift_ended_at: stamp })");
  });

  it("stamps each reminder before sending it, so a rerun sends nothing twice", () => {
    expect(sweep.indexOf("gift_day_notice_at: stamp")).toBeLessThan(
      sweep.indexOf("giftReminderEmail(", sweep.indexOf("gift_day_notice_at: stamp")),
    );
    expect(sweep.indexOf("gift_week_notice_at: stamp")).toBeLessThan(
      sweep.indexOf("giftReminderEmail(", sweep.indexOf("gift_week_notice_at: stamp")),
    );
  });

  it("does not remind a store that already kept Ultra", () => {
    expect(sweep).toContain(
      'if ((await tierWithoutGift(store.id)) !== "free") continue;',
    );
  });

  it("runs every day, behind the cron secret", () => {
    const vercel = JSON.parse(read("vercel.json")) as {
      crons: { path: string; schedule: string }[];
    };
    expect(vercel.crons).toContainEqual({
      path: "/api/cron/gifts",
      schedule: "0 15 * * *",
    });
    expect(read("src/app/api/cron/gifts/route.ts")).toContain(
      'request.headers.get("authorization") !== `Bearer ${secret}`',
    );
  });
});

describe("keeping Ultra", () => {
  const actions = flat(read("src/lib/stores/ultra-actions.ts"));
  const stripe = flat(read("src/lib/billing/stripe.ts"));
  const gifts = flat(read("src/lib/stores/gifts.ts"));

  it("charges the founding price, from the gift's last day, with no second trial", () => {
    expect(actions).toContain("priceId: beta?.priceId ?? null,");
    expect(actions).toContain("trialEnd: beta?.trialEnd ?? undefined,");
    expect(actions).toContain(
      "trialDays: existing || beta ? undefined : ULTRA_TRIAL_DAYS,",
    );
    expect(stripe).toContain(
      "const price = entry.priceId || stripePriceId(entry.tier);",
    );
    expect(stripe).toContain("? { trial_end: entry.trialEnd }");
  });

  it("asks nothing of a Founding Store", () => {
    expect(actions).toContain("if (beta?.founding) redirect(settings);");
  });

  it("says the standard price whenever the founding price is not set up", () => {
    expect(gifts).toContain(
      "return gift && foundingPriceId() ? FOUNDING_PRICE_LABEL : ULTRA_PRICE_LABEL;",
    );
    expect(read(".env.example")).toContain("STRIPE_PRICE_ULTRA_FOUNDING=");
  });

  it("is never undone by a lapsing subscription while the gift lives", () => {
    expect(flat(read("src/lib/billing/repository.ts"))).toContain(
      "if (!paid && gifted) return;",
    );
  });
});

describe("the invitation and the admin page", () => {
  const invite = flat(read("src/lib/stores/actions.ts"));
  const admin = flat(read("src/lib/stores/gift-actions.ts"));

  it("refuses a founding invitation before making anything once ten exist", () => {
    expect(invite.indexOf("foundingStoresTaken()")).toBeLessThan(
      invite.indexOf("result = await inviteStore("),
    );
  });

  it("grants before emailing, so the email can say it", () => {
    expect(invite.indexOf("await grantGift(result.store.id")).toBeLessThan(
      invite.indexOf("storeInviteEmail("),
    );
  });

  it("is an admin's act", () => {
    expect(admin).toContain("await requireAdmin();");
    expect(admin).toContain("const ok = await removeGift(storeId);");
  });

  it("gives the app the bar for an owner only", () => {
    expect(flat(read("src/app/api/v1/me/route.ts"))).toContain(
      'gift: m.role === "owner" ? await giftBarFor(m.storeId).catch(() => null) : null,',
    );
  });
});
