import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  STORE_DESCRIPTION_MAX,
  STORE_NAME_MAX,
  STORE_WEBSITE_MAX,
  collapseWhitespace,
  normaliseStorePostalCode,
  storePageSchema,
} from "@/lib/stores/page-schema";

/**
 * A store's own page, and following it.
 *
 * The founder: "make a way and flow for stores to setup their store
 * account once they're subscribed to ultra so players can follow the
 * store. if a player is in a room for that store, the store is linked
 * in there for them to quickly follow that store's page and stay
 * updated."
 *
 * Half of this is the schema, tested as a pure function. The other
 * half is a set of pins on the source: the checklist's first step, the
 * action's owner check, the button on both pages, the API's new verb
 * and fields, and the same two words on both platforms. A feature that
 * ships to one platform and not the other is the fault these exist for.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const valid = {
  name: "Card Kingdom",
  city: "Seattle",
  region: "WA",
  addressLine: "5105 Leary Ave NW",
  postalCode: "98107",
  phone: "(206) 555-0100",
  website: "https://cardkingdom.com",
  description: "Friday Night Magic every week.",
};

describe("the store page schema", () => {
  it("accepts a full page and nulls the blanks", () => {
    const parsed = storePageSchema.safeParse({
      ...valid,
      city: "",
      region: "  ",
      phone: "",
      website: "",
      description: "",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.city).toBeNull();
    expect(parsed.data.region).toBeNull();
    expect(parsed.data.phone).toBeNull();
    expect(parsed.data.website).toBeNull();
    expect(parsed.data.description).toBeNull();
    expect(parsed.data.postalCode).toBe("98107");
  });

  it("caps the name at both ends", () => {
    expect(storePageSchema.safeParse({ ...valid, name: "A" }).success).toBe(false);
    expect(
      storePageSchema.safeParse({ ...valid, name: "x".repeat(STORE_NAME_MAX + 1) })
        .success,
    ).toBe(false);
    expect(
      storePageSchema.safeParse({ ...valid, name: "x".repeat(STORE_NAME_MAX) }).success,
    ).toBe(true);
  });

  it("caps the description at the column's 280", () => {
    expect(STORE_DESCRIPTION_MAX).toBe(280);
    expect(
      storePageSchema.safeParse({ ...valid, description: "x".repeat(281) }).success,
    ).toBe(false);
    expect(
      storePageSchema.safeParse({ ...valid, description: "x".repeat(280) }).success,
    ).toBe(true);
  });

  it("collapses whitespace in the description before measuring it", () => {
    expect(collapseWhitespace("  Friday\n\nNight   Magic \t every week ")).toBe(
      "Friday Night Magic every week",
    );
    /* 281 characters of padding around 10 of text is 10, not 291. */
    const padded = `${" ".repeat(150)}open late${"\n".repeat(150)}`;
    const parsed = storePageSchema.safeParse({ ...valid, description: padded });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.description).toBe("open late");
  });

  it("takes only an http or https website", () => {
    const website = (value: string) =>
      storePageSchema.safeParse({ ...valid, website: value }).success;
    expect(website("https://example.com")).toBe(true);
    expect(website("http://example.com/events")).toBe(true);
    expect(website("example.com")).toBe(false);
    expect(website("javascript:alert(1)")).toBe(false);
    expect(website("ftp://example.com")).toBe(false);
    expect(website(`https://example.com/${"x".repeat(STORE_WEBSITE_MAX)}`)).toBe(false);
  });

  it("keeps the five-digit ZIP rule", () => {
    expect(normaliseStorePostalCode(" 97477 ")).toBe("97477");
    expect(normaliseStorePostalCode("97477-1234")).toBe("97477");
    expect(normaliseStorePostalCode("9747")).toBeNull();
    expect(storePageSchema.safeParse({ ...valid, postalCode: "abcde" }).success).toBe(
      false,
    );
    expect(storePageSchema.safeParse({ ...valid, postalCode: "" }).success).toBe(true);
  });
});

describe("the setup flow", () => {
  it("puts the store page first on the checklist", () => {
    const page = read("src/app/store/page.tsx");
    const steps = page.slice(page.indexOf("const steps: SetupStep[]"));
    const first = steps.indexOf('key: "page"');
    expect(first).toBeGreaterThan(-1);
    for (const key of ["flarecast", "singles", "event", "timezone"]) {
      expect(steps.indexOf(`key: "${key}"`)).toBeGreaterThan(first);
    }
    expect(page).toContain("Set up your store page");
    expect(page).toContain("/store/organizers");
  });

  it("only lets an owner write the page", () => {
    const action = read("src/lib/stores/page-actions.ts");
    expect(action).toMatch(/storeRoles\[storeId\] === "owner"/);
    expect(action).toContain('viewer.kind === "admin"');
    /* The card itself is owner-only too. */
    const settings = read("src/app/store/settings/page.tsx");
    expect(settings).toContain('store.role === "owner"');
    expect(settings).toContain('id="page"');
    expect(settings).toContain("This is what players see when they follow you");
    expect(settings).toContain("View your page");
  });
});

describe("following a store", () => {
  it("draws the button on the store page and in the room", () => {
    expect(read("src/app/s/[storeId]/page.tsx")).toContain("FollowStoreButton");
    expect(read("src/app/e/[code]/page.tsx")).toContain("FollowStoreButton");
    expect(read("src/app/e/[code]/page.tsx")).toContain("href={`/s/${event.storeId}`}");
  });

  it("gives the app a POST for following, beside the DELETE", () => {
    const route = read("src/app/api/v1/locals/route.ts");
    expect(route).toContain("export async function POST");
    expect(route).toContain("export async function DELETE");
    expect(route).toContain("saveLocal(");
  });

  it("sends the room's store and whether it is followed", () => {
    const route = read("src/app/api/v1/rooms/[code]/route.ts");
    expect(route).toContain("storeId: room.storeId");
    expect(route).toContain("following,");
    expect(route).toContain("hasLocal(");
    const store = read("src/app/api/v1/stores/[storeId]/route.ts");
    expect(store).toContain("following");
    expect(read("src/lib/stores/public-profile.ts")).toContain(
      "description: data.description",
    );
  });

  it("uses the same words on both platforms", () => {
    const web = read("src/components/stores/follow-store-button.tsx");
    const app = read("mobile/src/follow-store-button.tsx");
    for (const source of [web, app]) {
      expect(source).toContain('"Following"');
      expect(source).toContain('"Follow"');
    }
    expect(read("src/app/s/[storeId]/page.tsx")).toContain("Sign in to follow");
    expect(read("mobile/src/screens/store-profile.tsx")).toContain("Sign in to follow");

    /* Both app screens draw the button: the store's page and the room. */
    expect(read("mobile/src/screens/store-profile.tsx")).toContain("FollowStoreButton");
    expect(read("mobile/src/screens/room.tsx")).toContain("FollowStoreButton");
    expect(read("mobile/src/screens/room.tsx")).toContain('navigate("StoreProfile"');
    expect(read("mobile/src/api.ts")).toContain("export const followStore");
  });

  it("says the same thing about locals on both platforms", () => {
    const line = "Stores you follow. Joining a room follows the store too.";
    expect(read("src/app/profile/settings/page.tsx")).toContain(line);
    expect(read("mobile/src/screens/home.tsx").replace(/\s+/g, " ")).toContain(line);
  });
});
