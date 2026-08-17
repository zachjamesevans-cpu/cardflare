import { describe, expect, it } from "vitest";

import { playerInviteEmail, storeInviteEmail } from "@/lib/email/store-invite";
import { inviteStoreSchema, toInviteFieldErrors } from "@/lib/stores/schema";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "Grand Line Games",
    contactEmail: "owner@grandlinegames.com",
    ...overrides,
  };
}

describe("inviteStoreSchema", () => {
  it("accepts a minimal store", () => {
    const result = inviteStoreSchema.safeParse(validInput());

    expect(result.success).toBe(true);
    expect(result.data?.name).toBe("Grand Line Games");
    expect(result.data?.city).toBeNull();
  });

  it("normalizes the contact email, since sign-in matches on it", () => {
    const result = inviteStoreSchema.safeParse(
      validInput({ contactEmail: "  Owner@GrandLineGames.COM  " }),
    );

    expect(result.data?.contactEmail).toBe("owner@grandlinegames.com");
  });

  it("trims the store name", () => {
    const result = inviteStoreSchema.safeParse(validInput({ name: "  Card Barn  " }));

    expect(result.data?.name).toBe("Card Barn");
  });

  it.each([
    ["empty", ""],
    ["whitespace", "   "],
  ])("rejects a %s store name", (_label, name) => {
    const result = inviteStoreSchema.safeParse(validInput({ name }));

    expect(result.success).toBe(false);
    expect(toInviteFieldErrors(result.error!).name).toBeDefined();
  });

  it.each([
    ["missing @", "not-an-email"],
    ["empty", ""],
    ["whitespace", "   "],
  ])("rejects a %s contact email", (_label, contactEmail) => {
    const result = inviteStoreSchema.safeParse(validInput({ contactEmail }));

    expect(result.success).toBe(false);
    expect(toInviteFieldErrors(result.error!).contactEmail).toBeDefined();
  });

  it("collapses blank optional fields to null", () => {
    const result = inviteStoreSchema.safeParse(validInput({ city: "  ", region: "" }));

    expect(result.data?.city).toBeNull();
    expect(result.data?.region).toBeNull();
  });

  it("keeps populated optional fields", () => {
    const result = inviteStoreSchema.safeParse(
      validInput({ city: " Austin ", region: "TX" }),
    );

    expect(result.data?.city).toBe("Austin");
    expect(result.data?.region).toBe("TX");
  });
});

/** An invitation with no one-click link — the fallback shape. */
const message = () =>
  storeInviteEmail("Grand Line Games", "owner@example.com", "https://cardflare.gg");

describe("storeInviteEmail", () => {
  it("names the store in the subject and body", () => {
    const email = message();

    expect(email.subject).toContain("Grand Line Games");
    expect(email.html).toContain("Grand Line Games");
    expect(email.text).toContain("Grand Line Games");
  });

  it("still points at the sign-in page", () => {
    const email = message();

    expect(email.html).toContain("https://cardflare.gg/login");
    expect(email.text).toContain("https://cardflare.gg/login");
  });

  it("ships a real plain-text alternative", () => {
    const email = message();

    expect(email.text.length).toBeGreaterThan(150);
    expect(email.text).not.toContain("<");
  });

  it("escapes the store name so it cannot inject markup", () => {
    const email = storeInviteEmail(
      '<img src=x onerror="alert(1)">',
      "owner@example.com",
      "https://cardflare.gg",
    );

    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("&lt;img");
  });

  it("tells an unexpecting recipient that nothing has happened yet", () => {
    const email = message();

    expect(email.text).toMatch(/not expecting this/i);
  });

  it("no longer promises that there is no password", () => {
    const email = message();

    for (const body of [email.html, email.text]) {
      expect(body).not.toMatch(/no password/i);
      expect(body).not.toMatch(/link each time/i);
    }
  });
});

/**
 * The one-click invitation.
 *
 * This message used to point at a form, which asked for the address the
 * message had just been sent to, which triggered a *second* email carrying the
 * link that actually did something. One email now carries it.
 */
describe("storeInviteEmail with a setup link", () => {
  const LINK =
    "https://cardflare.gg/auth/confirm?token_hash=abc123&type=recovery&next=%2Fwelcome";

  const withLink = () =>
    storeInviteEmail(
      "Grand Line Games",
      "owner@example.com",
      "https://cardflare.gg",
      LINK,
    );

  it("puts the one-click link in the button and in the text part", () => {
    const email = withLink();

    expect(email.html).toContain(LINK);
    expect(email.text).toContain(LINK);
  });

  /*
   * These links expire in about an hour by default and a shop owner reads
   * email the next morning, so a dead button with no way forward is the
   * likeliest single outcome of this message. Saying so is not boilerplate.
   */
  it("says what to do when the link has expired", () => {
    const email = withLink();

    for (const body of [email.html, email.text]) {
      expect(body).toMatch(/expires/i);
      expect(body).toContain("https://cardflare.gg/login/reset");
    }
  });

  /*
   * Generating the link can fail, and an invitation that arrives without the
   * shortcut is far better than none — it falls back to the route every
   * invitation used before.
   */
  it("falls back to the reset page when no link could be made", () => {
    for (const email of [
      message(),
      storeInviteEmail("S", "o@e.com", "https://x.gg", null),
    ]) {
      expect(email.text).toMatch(/login\/reset/);
    }
  });

  /*
   * Without a generated link there is nothing token-shaped to embed, and the
   * message must not invent one — the fallback is a plain page URL.
   */
  it("embeds nothing token-shaped when it has no link", () => {
    expect(message().html).not.toMatch(/token=|access_token/);
  });

  /*
   * Found by rendering both and looking at them: they came out identical. The
   * fallback's button already pointed at the reset page, and the paragraph
   * under it said that if the button had expired the reader should go to the
   * reset page — the URL they had just tapped. A loop that reads as broken.
   */
  it("does not send the reader back to the button they just tapped", () => {
    const plain = message();

    expect(plain.html).not.toMatch(/button expires/i);
    expect(plain.text).not.toMatch(/That link expires/i);
    expect(plain.html).not.toBe(withLink().html);
  });

  /*
   * And says what actually happens instead: the reset page asks for the
   * address and emails a link, which is one more step than the button.
   */
  it("promises the extra step the fallback really takes", () => {
    for (const body of [message().html, message().text]) {
      expect(body).toMatch(/ask for (a link|this address)/i);
    }
  });
});

/**
 * The player flavour of the same message.
 *
 * One function serves stores, card-show vendors and players, which is
 * the right shape — the account, the link and the expiry story are
 * identical — but the store's own sentence had leaked into all three.
 * A player was being told "Zach is in the CardFlare beta": the sentence
 * a shop gets, with a person's name dropped into it.
 */
describe("playerInviteEmail", () => {
  const sent = playerInviteEmail("Zach", "zach@example.test", "https://cardflare.gg");

  it("does not tell a person they are a store in the beta", () => {
    expect(sent.subject).not.toContain("beta");
    expect(sent.html).not.toContain("is in the CardFlare beta");
    expect(sent.text).not.toContain("is in the CardFlare beta");
  });

  it("tells them what actually happened", () => {
    expect(sent.subject).toBe("Your CardFlare account is ready");
    expect(sent.html).toContain("Your CardFlare account is ready, Zach.");
    expect(sent.text).toContain("Your CardFlare account is ready, Zach.");
  });

  it("says what an account is for, not what a store gets", () => {
    expect(sent.html).toContain("makes your wants follow you");
    expect(sent.html).not.toContain("players at your events");
  });

  it("still escapes the name so it cannot inject markup", () => {
    const nasty = playerInviteEmail(
      "<script>alert(1)</script>",
      "x@example.test",
      "https://cardflare.gg",
    );
    expect(nasty.html).not.toContain("<script>alert(1)</script>");
  });

  it("leaves the store wording alone", () => {
    /* The store's sentence was written for a shop owner and is right.
       Fixing the player one must not have touched it. */
    const shop = storeInviteEmail(
      "Test Cards",
      "shop@example.test",
      "https://cardflare.gg",
    );
    expect(shop.subject).toBe("Test Cards is in the CardFlare beta");
    expect(shop.html).toContain("Test Cards is in the CardFlare beta.");
  });
});
