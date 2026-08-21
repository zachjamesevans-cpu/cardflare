import { describe, expect, it } from "vitest";

import {
  CLAIM_NOTES_LIMIT,
  readClaim,
  validateClaim,
  type ClaimFields,
} from "@/lib/stores/claim-schema";
import { sameDomain } from "@/lib/stores/claims";

/**
 * A shop asking for its own listing back.
 *
 * The form is deliberately short and deliberately permissive: the one
 * person a claim form cannot afford to turn away is the owner.
 */
const good: ClaimFields = {
  claimantName: "Dana Reyes",
  claimantEmail: "dana@moxvalley.com",
  claimantRole: "Owner",
  businessEmail: "",
  notes: "",
};

describe("what a claim has to say", () => {
  it("accepts a name and a working address", () => {
    expect(validateClaim(good)).toEqual({});
  });

  it("asks for the two things a human needs to reply", () => {
    const errors = validateClaim({ ...good, claimantName: "", claimantEmail: "" });

    expect(errors.claimantName).toBeTruthy();
    expect(errors.claimantEmail).toBeTruthy();
  });

  it("keys errors to their field", () => {
    /* Drawn against the input it belongs to rather than piled into one
       line at the top - the difference between a form somebody fixes
       and a form somebody abandons. */
    const errors = validateClaim({ ...good, claimantEmail: "dana@" });

    expect(errors.claimantEmail).toBeTruthy();
    expect(errors.claimantName).toBeUndefined();
  });

  it("treats the store address as optional", () => {
    /* Plenty of small shops run on a personal address, and saying so is
       the honest answer rather than a reason to be turned away. */
    expect(validateClaim({ ...good, businessEmail: "" })).toEqual({});
    expect(validateClaim({ ...good, businessEmail: "shop@moxvalley.com" })).toEqual({});
    expect(
      validateClaim({ ...good, businessEmail: "not an address" }).businessEmail,
    ).toBeTruthy();
  });

  it("does not reject unusual but real addresses", () => {
    /* The address is verified by sending mail to it. A stricter pattern's
       whole effect is to turn away somebody's real address. */
    for (const email of [
      "dana+cardflare@moxvalley.com",
      "d@x.io",
      "dana.reyes@shop.co.uk",
      "DANA@MOXVALLEY.COM",
    ]) {
      expect(validateClaim({ ...good, claimantEmail: email })).toEqual({});
    }
  });

  it("caps the free-text note", () => {
    const long = { ...good, notes: "x".repeat(CLAIM_NOTES_LIMIT + 1) };
    expect(validateClaim(long).notes).toBeTruthy();

    const fits = { ...good, notes: "x".repeat(CLAIM_NOTES_LIMIT) };
    expect(validateClaim(fits)).toEqual({});
  });

  it("trims what was typed", () => {
    const form = new FormData();
    form.set("claimantName", "  Dana Reyes  ");
    form.set("claimantEmail", " dana@moxvalley.com ");

    const fields = readClaim(form);

    expect(fields.claimantName).toBe("Dana Reyes");
    expect(fields.claimantEmail).toBe("dana@moxvalley.com");
    /* Absent is empty, never "undefined" written into the database. */
    expect(fields.notes).toBe("");
  });
});

describe("the domain hint", () => {
  it("matches an address at the shop's own domain", () => {
    expect(sameDomain("dana@moxvalley.com", "https://moxvalley.com")).toBe(true);
    expect(sameDomain("dana@moxvalley.com", "https://www.moxvalley.com/")).toBe(true);
    expect(sameDomain("DANA@MoxValley.com", "http://MOXVALLEY.COM")).toBe(true);
    /* A stored website may have no scheme at all — plenty of imported
       rows are a bare host. */
    expect(sameDomain("dana@moxvalley.com", "moxvalley.com")).toBe(true);
    expect(sameDomain("dana@moxvalley.com", "www.moxvalley.com:443/contact")).toBe(
      true,
    );
  });

  it("does not match anything else", () => {
    expect(sameDomain("dana@gmail.com", "https://moxvalley.com")).toBe(false);
    expect(sameDomain("dana@moxvalley.com", null)).toBe(false);
    expect(sameDomain("not-an-address", "https://moxvalley.com")).toBe(false);
    /* Nearly is not the same, and a hint that fires on a lookalike
       domain is worse than no hint. */
    expect(sameDomain("dana@moxvalley.co", "https://moxvalley.com")).toBe(false);
    expect(sameDomain("dana@notmoxvalley.com", "https://moxvalley.com")).toBe(false);
  });
});

describe("the claim page is not a way around approval", () => {
  it("only renders for a published, unclaimed store", async () => {
    /* Two rules meet on this page and both are load-bearing: a draft
       nobody approved must not become reachable through its own claim
       form, and a shop somebody already manages must not collect claims
       that will never be read. `publicStore` returns null for a draft,
       and the page 404s on `!store.unclaimed`. */
    const page = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/app/s/[storeId]/claim/page.tsx", "utf8"),
    );

    expect(page).toContain("publicStore");
    expect(page).toMatch(/if \(!store \|\| !store\.unclaimed\) notFound\(\)/);
  });

  it("is a real page, so the button on every unclaimed listing is not a dead link", async () => {
    /* AGENTS.md: no dead links. The button shipped with the directory
       and pointed at nothing for as long as it took to notice. */
    const fs = await import("node:fs/promises");

    const listing = await fs.readFile("src/app/s/[storeId]/page.tsx", "utf8");
    expect(listing).toContain("/claim");

    await expect(
      fs.access("src/app/s/[storeId]/claim/page.tsx"),
    ).resolves.toBeUndefined();
  });
});

describe("both platforms carry the claim flow", () => {
  /*
   * AGENTS.md, the founder's standing instruction: "all design changes
   * and anything I say should also be programmed exactly the same for
   * the app as well." The directory shipped with a "View" button on
   * every Nearby row on the website and dead text on the phone, which
   * is the gap that opens whenever a feature is built on one platform
   * and translated to the other afterwards.
   */
  it("the app can open a store and claim it", async () => {
    const fs = await import("node:fs/promises");

    const api = await fs.readFile("mobile/src/api.ts", "utf8");
    expect(api).toContain("getStore");
    expect(api).toContain("claimStore");

    const screen = await fs.readFile("mobile/src/screens/store-profile.tsx", "utf8");
    expect(screen).toContain("Claim this store");

    /* Reachable: registered in the stack, and tapped from a Nearby row. */
    const app = await fs.readFile("mobile/App.tsx", "utf8");
    expect(app).toContain('name="StoreProfile"');

    const home = await fs.readFile("mobile/src/screens/home.tsx", "utf8");
    expect(home).toContain('navigation.navigate("StoreProfile"');
  });

  it("the app's claim endpoint validates with the same rules as the website", async () => {
    /* One `validateClaim`, so a field the website rejects cannot be
       accepted from a phone — and the reverse. */
    const route = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/app/api/v1/stores/[storeId]/claim/route.ts", "utf8"),
    );

    expect(route).toContain("validateClaim");
    expect(route).toContain("submitClaim");
    /* The app sends no body — see api-payload-transport.test.ts. */
    expect(route).toContain("readJsonPayload");
  });
});
