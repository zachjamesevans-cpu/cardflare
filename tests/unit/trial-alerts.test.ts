import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { alertRecipients, trialChangeFor } = await import("@/lib/billing/trial-alerts");

describe("who is told", () => {
  it("reads one or several comma-separated addresses", () => {
    expect(alertRecipients("zach@example.com")).toEqual(["zach@example.com"]);
    expect(alertRecipients(" a@x.com, b@y.com ,, not-an-address ")).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
    expect(alertRecipients(undefined)).toEqual([]);
    expect(alertRecipients("")).toEqual([]);
  });
});

describe("which moments count", () => {
  it("is the trial starting, paying, or lapsing, and nothing else", () => {
    expect(trialChangeFor("customer.subscription.created", "trialing", undefined)).toBe(
      "started",
    );
    expect(
      trialChangeFor("customer.subscription.created", "active", undefined),
    ).toBeNull();
    expect(trialChangeFor("customer.subscription.updated", "active", "trialing")).toBe(
      "converted",
    );
    expect(
      trialChangeFor("customer.subscription.updated", "canceled", "trialing"),
    ).toBe("ended");
    expect(
      trialChangeFor("customer.subscription.updated", "active", undefined),
    ).toBeNull();
    expect(
      trialChangeFor("customer.subscription.updated", "past_due", "active"),
    ).toBeNull();
    expect(trialChangeFor("customer.subscription.deleted", "trialing", undefined)).toBe(
      "ended",
    );
    expect(
      trialChangeFor("customer.subscription.deleted", "active", undefined),
    ).toBeNull();
    expect(trialChangeFor("invoice.paid", "paid", undefined)).toBeNull();
  });
});
