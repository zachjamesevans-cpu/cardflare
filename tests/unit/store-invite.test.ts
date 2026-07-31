import { describe, expect, it } from "vitest";

import { storeInviteEmail } from "@/lib/email/store-invite";
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

describe("storeInviteEmail", () => {
  const message = () =>
    storeInviteEmail("Grand Line Games", "owner@example.com", "https://cardflare.gg");

  it("names the store in the subject and body", () => {
    const email = message();

    expect(email.subject).toContain("Grand Line Games");
    expect(email.html).toContain("Grand Line Games");
    expect(email.text).toContain("Grand Line Games");
  });

  it("points at the sign-in page rather than embedding a link that expires", () => {
    const email = message();

    expect(email.html).toContain("https://cardflare.gg/login");
    expect(email.text).toContain("https://cardflare.gg/login");
    // A magic link would be stale long before a shop owner opened the email.
    expect(email.html).not.toMatch(/token=|code=|access_token/);
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
});
