import { describe, expect, it } from "vitest";

import {
  ULTRA_PRICE_LABEL,
  ULTRA_TRIAL_DAYS,
  ultraSignupSchema,
} from "@/lib/stores/ultra-schema";

/**
 * What a store owner has to type to start Ultra, and what the page
 * promises: fourteen days free and fifty dollars a month. The numbers
 * are held here because the pitch, the pricing card, the checkout and
 * the terms all read them from one place.
 */
describe("the Ultra offer", () => {
  it("is fourteen days free and fifty a month", () => {
    expect(ULTRA_TRIAL_DAYS).toBe(14);
    expect(ULTRA_PRICE_LABEL).toBe("$50");
  });
});

describe("the store sign-up form", () => {
  const good = {
    storeName: "  Dice and Dragons ",
    email: "Owner@Shop.Example",
    password: "correct horse",
    city: "Eugene",
    region: "Oregon",
  };

  it("trims the name and lowercases the address", () => {
    const parsed = ultraSignupSchema.parse(good);
    expect(parsed.storeName).toBe("Dice and Dragons");
    expect(parsed.email).toBe("owner@shop.example");
  });

  it("lets a store skip the city and region", () => {
    expect(ultraSignupSchema.safeParse({ ...good, city: "", region: "" }).success).toBe(
      true,
    );
  });

  it("refuses a short password and a name with nothing in it", () => {
    expect(ultraSignupSchema.safeParse({ ...good, password: "short" }).success).toBe(
      false,
    );
    expect(ultraSignupSchema.safeParse({ ...good, storeName: " " }).success).toBe(
      false,
    );
  });
});
