import { describe, expect, it } from "vitest";

import {
  appleFactsFrom,
  decodeJwsPayload,
  foldAppleStatus,
  parseStatusResponse,
} from "@/lib/billing/apple-facts";
import { tierAllows } from "@/lib/tiers";

/**
 * Apple's answers, folded to ours — pinned against fixtures, because
 * every one of these shapes was read out of Apple's documentation
 * rather than a payload we can replay at will. The signatures are
 * deliberately not verified (the strings arrive from Apple's own host
 * over TLS, and outside pokes are never believed at all), so the
 * decoding is a plain base64url read and these tests prove exactly
 * what it does and does not accept.
 */

/** A JWS the way Apple sends one: header.payload.signature, with only
    the payload mattering to us. */
function jws(payload: Record<string, unknown>): string {
  const part = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "ES256" })}.${part(payload)}.${part("sig")}`;
}

const PRODUCT = "gg.cardflare.app.pro.monthly";
const PLAYER = "0b0e2a52-9d3f-4a0a-8b8a-1f2e3d4c5b6a";
const PAID_THROUGH = Date.UTC(2026, 9, 1, 12, 0, 0);

function transaction(over: Record<string, unknown> = {}): string {
  return jws({
    originalTransactionId: "2000000123456789",
    productId: PRODUCT,
    appAccountToken: PLAYER,
    expiresDate: PAID_THROUGH,
    ...over,
  });
}

describe("decodeJwsPayload", () => {
  it("reads the middle part of a JWS", () => {
    expect(decodeJwsPayload(jws({ hello: "there" }))).toEqual({ hello: "there" });
  });

  it("returns null for anything that is not three dot-joined parts", () => {
    expect(decodeJwsPayload("not-a-jws")).toBeNull();
    expect(decodeJwsPayload("a.b")).toBeNull();
    expect(decodeJwsPayload("")).toBeNull();
  });

  it("returns null when the payload is not a JSON object", () => {
    const scalar = `x.${Buffer.from('"hi"').toString("base64url")}.y`;
    expect(decodeJwsPayload(scalar)).toBeNull();
    expect(decodeJwsPayload("x.!!!.y")).toBeNull();
  });
});

describe("foldAppleStatus", () => {
  it("maps active, retry, grace and everything else", () => {
    expect(foldAppleStatus(1)).toBe("active");
    expect(foldAppleStatus(3)).toBe("past_due");
    expect(foldAppleStatus(4)).toBe("past_due");
    expect(foldAppleStatus(2)).toBe("canceled");
    expect(foldAppleStatus(5)).toBe("canceled");
    /* A status Apple has not invented yet fails closed, not open. */
    expect(foldAppleStatus(99)).toBe("canceled");
  });
});

describe("appleFactsFrom", () => {
  it("reads an active subscription whole", () => {
    const facts = appleFactsFrom(
      {
        status: 1,
        signedTransactionInfo: transaction(),
        signedRenewalInfo: jws({ autoRenewStatus: 1 }),
      },
      PRODUCT,
    );
    expect(facts).toEqual({
      originalTransactionId: "2000000123456789",
      productId: PRODUCT,
      appAccountToken: PLAYER,
      status: "active",
      currentPeriodEnd: new Date(PAID_THROUGH).toISOString(),
      cancelAtPeriodEnd: false,
    });
  });

  it("marks a switched-off renewal without ending the paid period", () => {
    const facts = appleFactsFrom(
      {
        status: 1,
        signedTransactionInfo: transaction(),
        signedRenewalInfo: jws({ autoRenewStatus: 0 }),
      },
      PRODUCT,
    );
    expect(facts?.status).toBe("active");
    expect(facts?.cancelAtPeriodEnd).toBe(true);
    expect(facts?.currentPeriodEnd).toBe(new Date(PAID_THROUGH).toISOString());
  });

  it("extends the tail to the grace period while Apple retries the card", () => {
    const grace = PAID_THROUGH + 16 * 24 * 60 * 60 * 1000;
    const facts = appleFactsFrom(
      {
        status: 4,
        signedTransactionInfo: transaction(),
        signedRenewalInfo: jws({ autoRenewStatus: 1, gracePeriodExpiresDate: grace }),
      },
      PRODUCT,
    );
    expect(facts?.status).toBe("past_due");
    expect(facts?.currentPeriodEnd).toBe(new Date(grace).toISOString());
  });

  it("gives plain billing retry no grace it was not granted", () => {
    const facts = appleFactsFrom(
      {
        status: 3,
        signedTransactionInfo: transaction(),
        signedRenewalInfo: jws({ autoRenewStatus: 1 }),
      },
      PRODUCT,
    );
    expect(facts?.status).toBe("past_due");
    expect(facts?.currentPeriodEnd).toBe(new Date(PAID_THROUGH).toISOString());
  });

  it("cuts a revoked (refunded) subscription off with no tail", () => {
    const facts = appleFactsFrom(
      { status: 5, signedTransactionInfo: transaction() },
      PRODUCT,
    );
    expect(facts?.status).toBe("canceled");
    expect(facts?.currentPeriodEnd).toBeNull();
  });

  it("ignores a transaction for some other product", () => {
    const facts = appleFactsFrom(
      {
        status: 1,
        signedTransactionInfo: transaction({ productId: "gg.cardflare.app.other" }),
      },
      PRODUCT,
    );
    expect(facts).toBeNull();
  });

  it("survives a purchase made outside the app, with no account token", () => {
    const facts = appleFactsFrom(
      {
        status: 1,
        signedTransactionInfo: transaction({ appAccountToken: undefined }),
      },
      PRODUCT,
    );
    expect(facts?.appAccountToken).toBeNull();
  });

  it("returns null rather than guessing at an unreadable entry", () => {
    expect(appleFactsFrom({}, PRODUCT)).toBeNull();
    expect(appleFactsFrom({ status: 1 }, PRODUCT)).toBeNull();
    expect(
      appleFactsFrom({ status: 1, signedTransactionInfo: "garbage" }, PRODUCT),
    ).toBeNull();
  });
});

describe("parseStatusResponse", () => {
  it("finds our product among the response's groups", () => {
    const body = {
      data: [
        { lastTransactions: [{ status: 1, signedTransactionInfo: transaction() }] },
      ],
    };
    expect(parseStatusResponse(body, PRODUCT)?.originalTransactionId).toBe(
      "2000000123456789",
    );
  });

  it("skips entries for other products on the way", () => {
    const body = {
      data: [
        {
          lastTransactions: [
            {
              status: 1,
              signedTransactionInfo: transaction({ productId: "gg.other" }),
            },
            { status: 2, signedTransactionInfo: transaction() },
          ],
        },
      ],
    };
    expect(parseStatusResponse(body, PRODUCT)?.status).toBe("canceled");
  });

  it("returns null for shapes that are not the response at all", () => {
    expect(parseStatusResponse(null, PRODUCT)).toBeNull();
    expect(parseStatusResponse({ data: "nope" }, PRODUCT)).toBeNull();
    expect(parseStatusResponse({ data: [{}] }, PRODUCT)).toBeNull();
  });
});

describe("the cosmetics capability ladder", () => {
  it("lets every paid tier wear cosmetics and free wear none", () => {
    expect(tierAllows("free", "cosmetics")).toBe(false);
    expect(tierAllows("pro", "cosmetics")).toBe(true);
    expect(tierAllows("ultra", "cosmetics")).toBe(true);
    expect(tierAllows("max", "cosmetics")).toBe(true);
  });

  it("treats an unknown or missing tier as free", () => {
    expect(tierAllows(null, "cosmetics")).toBe(false);
    expect(tierAllows("mystery", "cosmetics")).toBe(false);
  });
});
