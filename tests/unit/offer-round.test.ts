import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { offerFailureMessage, offeredLine, reviewLabel } from "@/lib/feed/offer-copy";

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

/**
 * The offer, after the founder's read of the zoom: "I have this" takes
 * five seconds, says nothing when it is refused, and four taps on four
 * cards send four notices. One verb, one path, one notice that counts.
 */
describe("an offer answers at once", () => {
  const posts = read("src/lib/feed/posts.ts");

  it("sends the author's notice after the response, not inside the tap", () => {
    expect(posts).toMatch(/afterResponse\(\(\) =>\s*notifyOfferReceived\(/);
    expect(posts).not.toMatch(/await notifyOfferReceived\(/);
  });

  it("writes the thread line without re-reading the thread", () => {
    expect(posts).toContain("async function writeComment(");
    expect(posts).toMatch(
      /await writeComment\(\s*postId,\s*playerId,\s*message\.trim\(\) \|\| offeredLine\(named\)/,
    );
  });

  it("sends one card through the same door as several", () => {
    expect(posts).toMatch(
      /export async function offerFromFeed\([\s\S]*?const outcome = await offerItems\(/,
    );
  });
});

describe("one notice that counts the cards", () => {
  it("says how many, once", () => {
    const notify = read("src/lib/notifications/notify.ts");
    expect(notify).toContain(
      "`${responderName} has ${batch.count} of the cards you're looking for`",
    );
    expect(notify).toContain("`${responderName} has your ${context.cardName}`");
  });

  it("names the cards in the thread", () => {
    expect(offeredLine([{ name: "Ace", quantity: 1 }])).toBe("Offered Ace.");
    expect(
      offeredLine([
        { name: "Ace", quantity: 1 },
        { name: "Luffy", quantity: 2 },
        { name: "Sabo", quantity: 1 },
      ]),
    ).toBe("Offered Ace, Luffy ×2 and Sabo.");
  });
});

describe("a hand can always go up on an open card", () => {
  it("refuses only a card that is no longer up", () => {
    const posts = read("src/lib/feed/posts.ts");
    expect(posts).toMatch(
      /if \(!flare \|\| flare\.status !== "open"\) \{\s*refused\.push/,
    );
    expect(posts).not.toContain("left === 0");
    expect(posts).toContain("Math.min(flare.quantity, Math.round(item.quantity))");
  });
});

describe("a refusal is said in words", () => {
  it("has a sentence for every reason", () => {
    expect(offerFailureMessage("not-found")).toBe("That card is not up any more.");
    expect(offerFailureMessage("own-flare")).toBe("That one is yours.");
    expect(offerFailureMessage("at-cap")).toContain("the most cards this room allows");
    expect(offerFailureMessage("unavailable")).toContain("Try again");
    expect(read("src/lib/feed/post-actions.ts")).toContain(
      "offerFailureMessage(outcome.reason)",
    );
  });

  it("labels the way on by the count", () => {
    /* Round 16: one set of words wherever a card can be offered. The
       button that follows the picks is the review's, and "Offer this
       card" / "Offer N cards" are gone from both platforms. */
    expect(reviewLabel(1)).toBe("Review offer · 1 card");
    expect(reviewLabel(3)).toBe("Review offer · 3 cards");
  });
});
