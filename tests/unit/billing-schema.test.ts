import { describe, expect, it } from "vitest";

import {
  TIER_AUDIENCE,
  TIER_LABELS,
  TIERS,
  foldStripeStatus,
  isEntitled,
  isTier,
  tierForStoreKind,
} from "@/lib/billing/schema";

/**
 * The tier table and the meaning of "paid", pinned before any purchase
 * surface exists. These rules are what every future feature gate calls,
 * so they get locked down first: who each tier belongs to, and exactly
 * when a subscription stops counting.
 */

const HOUR = 60 * 60 * 1000;

describe("the tier table", () => {
  it("knows exactly three tiers", () => {
    expect(TIERS).toEqual(["pro", "ultra", "max"]);
  });

  it("spells the names the way marketing does", () => {
    expect(TIER_LABELS).toEqual({
      pro: "CardFlare Pro",
      ultra: "CardFlare Ultra",
      max: "CardFlare Max",
    });
  });

  it("assigns pro to players and the other two to store rows", () => {
    expect(TIER_AUDIENCE).toEqual({ pro: "player", ultra: "store", max: "store" });
  });

  it("sells shops Ultra and vendors Max", () => {
    expect(tierForStoreKind("lgs")).toBe("ultra");
    expect(tierForStoreKind("vendor")).toBe("max");
  });

  it("recognises its own tiers and nothing else", () => {
    expect(isTier("pro")).toBe(true);
    expect(isTier("platinum")).toBe(false);
    expect(isTier("")).toBe(false);
  });
});

describe("isEntitled", () => {
  const now = Date.parse("2026-08-11T12:00:00Z");
  const future = new Date(now + 24 * HOUR).toISOString();
  const past = new Date(now - 24 * HOUR).toISOString();

  it("active and trialing entitle, with or without a period end", () => {
    expect(isEntitled({ status: "active", currentPeriodEnd: null }, now)).toBe(true);
    expect(isEntitled({ status: "trialing", currentPeriodEnd: past }, now)).toBe(true);
  });

  it("past_due keeps its features until the paid-through moment", () => {
    expect(isEntitled({ status: "past_due", currentPeriodEnd: future }, now)).toBe(
      true,
    );
    expect(isEntitled({ status: "past_due", currentPeriodEnd: past }, now)).toBe(false);
  });

  it("canceled runs out the period that was already paid", () => {
    expect(isEntitled({ status: "canceled", currentPeriodEnd: future }, now)).toBe(
      true,
    );
    expect(isEntitled({ status: "canceled", currentPeriodEnd: past }, now)).toBe(false);
  });

  it("a bad status with no period end entitles nothing", () => {
    expect(isEntitled({ status: "canceled", currentPeriodEnd: null }, now)).toBe(false);
  });
});

describe("foldStripeStatus", () => {
  it("keeps the three states the product distinguishes", () => {
    expect(foldStripeStatus("active")).toBe("active");
    expect(foldStripeStatus("trialing")).toBe("trialing");
    expect(foldStripeStatus("past_due")).toBe("past_due");
  });

  it("folds every not-going-to-be-paid state to canceled", () => {
    for (const status of [
      "canceled",
      "unpaid",
      "incomplete",
      "incomplete_expired",
      "paused",
      "anything-new",
    ]) {
      expect(foldStripeStatus(status)).toBe("canceled");
    }
  });
});
