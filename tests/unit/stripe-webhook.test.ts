import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  SIGNATURE_TOLERANCE_MS,
  parseStripeSignature,
  verifyStripeSignature,
} from "@/lib/billing/stripe-webhook";
import { toStripeForm } from "@/lib/billing/stripe";

/**
 * The webhook's lock, tested with real HMACs.
 *
 * Verification is hand-rolled (no Stripe SDK, same zero-dependency
 * stance as every provider here), which is exactly why it gets vectors
 * computed independently in the test: a bug in the implementation
 * cannot hide behind the same bug in the expectation.
 */

const SECRET = "whsec_test_secret";

function sign(payload: string, timestamp: number, secret = SECRET): string {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

describe("parseStripeSignature", () => {
  it("reads timestamp and every v1 candidate", () => {
    const parsed = parseStripeSignature("t=1700000000,v1=aaa,v1=bbb,v0=ccc");

    expect(parsed).toEqual({ timestamp: 1700000000, signatures: ["aaa", "bbb"] });
  });

  it("refuses a missing header, a missing timestamp, and a missing v1", () => {
    expect(parseStripeSignature(null)).toBeNull();
    expect(parseStripeSignature("v1=aaa")).toBeNull();
    expect(parseStripeSignature("t=1700000000")).toBeNull();
    expect(parseStripeSignature("t=soon,v1=aaa")).toBeNull();
  });
});

describe("verifyStripeSignature", () => {
  const payload = '{"type":"customer.subscription.updated"}';
  const nowSeconds = 1_700_000_000;
  const now = nowSeconds * 1000;

  it("accepts a genuine signature", () => {
    expect(verifyStripeSignature(payload, sign(payload, nowSeconds), SECRET, now)).toBe(
      true,
    );
  });

  it("refuses a signature made with the wrong secret", () => {
    const header = sign(payload, nowSeconds, "whsec_wrong");

    expect(verifyStripeSignature(payload, header, SECRET, now)).toBe(false);
  });

  it("refuses a signature over different bytes", () => {
    const header = sign(payload, nowSeconds);

    expect(verifyStripeSignature(payload + " ", header, SECRET, now)).toBe(false);
  });

  it("refuses a replay from outside the tolerance window", () => {
    const stale = nowSeconds - Math.ceil(SIGNATURE_TOLERANCE_MS / 1000) - 1;

    expect(verifyStripeSignature(payload, sign(payload, stale), SECRET, now)).toBe(
      false,
    );
  });

  it("accepts a slightly old but in-tolerance signature", () => {
    const recent = nowSeconds - 60;

    expect(verifyStripeSignature(payload, sign(payload, recent), SECRET, now)).toBe(
      true,
    );
  });

  it("accepts when any one v1 candidate matches", () => {
    const good = sign(payload, nowSeconds).split("v1=")[1];
    const header = `t=${nowSeconds},v1=${"0".repeat(64)},v1=${good}`;

    expect(verifyStripeSignature(payload, header, SECRET, now)).toBe(true);
  });
});

describe("toStripeForm", () => {
  it("flattens nested objects and arrays to Stripe's bracket encoding", () => {
    const form = toStripeForm({
      mode: "subscription",
      line_items: [{ price: "price_1", quantity: 1 }],
      metadata: { tier: "pro", player_id: "p1" },
      subscription_data: { metadata: { tier: "pro" } },
    });

    expect(form.get("mode")).toBe("subscription");
    expect(form.get("line_items[0][price]")).toBe("price_1");
    expect(form.get("line_items[0][quantity]")).toBe("1");
    expect(form.get("metadata[tier]")).toBe("pro");
    expect(form.get("metadata[player_id]")).toBe("p1");
    expect(form.get("subscription_data[metadata][tier]")).toBe("pro");
  });

  it("drops null and undefined instead of sending the words", () => {
    const form = toStripeForm({ a: null, b: undefined, c: "kept" });

    expect(form.has("a")).toBe(false);
    expect(form.has("b")).toBe(false);
    expect(form.get("c")).toBe("kept");
  });
});
