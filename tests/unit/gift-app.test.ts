import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { giftBarCopy as webCopy, type GiftBar } from "@/lib/stores/gift-shared";
import { giftBarCopy as appCopy } from "../../mobile/src/gift-copy";

/**
 * The Ultra gift in the app: the same green bar the store console draws,
 * in the same words, for an owner holding a phone.
 *
 * The founder's standing rule is that the app matches the website. The
 * words are mirrored by hand (the app cannot import from src/), so this
 * runs both over every state and fails the moment one sentence differs.
 * The rest pins where the bar is drawn, that the app never offers to
 * sell anything (buying happens on the website), and the Founding Store
 * mark on a store's page.
 */

const read = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8");

const STATES: GiftBar[] = [
  { state: "founding" },
  ...[0, 1, 2, 3, 4, 7, 29, 30, 60, 90].flatMap((daysLeft) =>
    [false, true].map((kept): GiftBar => ({
      state: "gift",
      daysLeft,
      untilLabel: "November 4",
      price: "$35",
      kept,
    })),
  ),
  { state: "gift", daysLeft: 12, untilLabel: "Dec 1", price: "$49", kept: false },
  { state: "gift-ended", price: "$35" },
  { state: "gift-ended", price: "$49" },
  ...[0, 1, 2, 3, 14].map((daysLeft): GiftBar => ({
    state: "trial",
    daysLeft,
    untilLabel: "October 19",
    price: "$49",
  })),
];

describe("the app's gift copy", () => {
  it.each(STATES.map((bar) => [JSON.stringify(bar), bar] as const))(
    "says exactly what the website says for %s",
    (_label, bar) => {
      expect(appCopy(bar)).toEqual(webCopy(bar));
    },
  );

  it("says it mirrors the website's file", () => {
    expect(read("mobile/src/gift-copy.ts")).toContain("src/lib/stores/gift-shared.ts");
  });

  it("carries the GiftBar shape on the account's staff rows and the store", () => {
    const api = read("mobile/src/api.ts");
    /* The shape lives beside its words in gift-copy.ts, with no app
       imports, so the website's typecheck can read it; api.ts re-exports. */
    expect(api).toContain('export type { GiftBar } from "./gift-copy";');
    expect(read("mobile/src/gift-copy.ts")).toMatch(/export type GiftBar\b/);
    expect(read("mobile/src/gift-copy.ts")).not.toMatch(/from "\.\/api"/);
    expect(api).toMatch(/gift\?: GiftBar \| null/);
    expect(api).toMatch(/founding\?: boolean/);
  });
});

describe("where the app draws the bar", () => {
  it("is on the timer remote, for the picked store", () => {
    const remote = read("mobile/src/screens/remote.tsx");
    expect(remote).toContain('from "../gift-bar"');
    expect(remote).toMatch(/<GiftBar bar=\{store\.gift\}/);
  });

  it("is on Settings, for an owner's stores only, named", () => {
    const settings = read("mobile/src/screens/settings.tsx");
    expect(settings).toContain('from "../gift-bar"');
    expect(settings).toMatch(/<GiftBar[^>]*storeName=/);
    expect(settings).toContain('row.role === "owner" && row.gift');
    expect(settings).toContain("Your store");
  });
});

describe("the app never sells Ultra", () => {
  const bar = read("mobile/src/gift-bar.tsx");

  it("says where the website's Keep Ultra button is instead", () => {
    expect(bar).toContain(
      "Keep Ultra from Settings in your store console at cardflare.gg.",
    );
  });

  it("has no link and no button", () => {
    expect(bar).not.toMatch(/Linking|openURL|WebBrowser|checkout|https?:\/\//);
    expect(bar).not.toMatch(/\bTap\b|Pressable|Touchable|onPress|Button/);
  });

  it("draws the founding, gift and trial glyphs and the urgent pill", () => {
    expect(bar).toContain('founding: "sparkles"');
    expect(bar).toContain('gift: "gift"');
    expect(bar).toContain('trial: "timer"');
    expect(bar).toContain("Ends soon");
  });

  it("writes no literal colour", () => {
    expect(bar).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("the Founding Store mark", () => {
  it("sits beside the Ultra mark on a store's page", () => {
    const page = read("mobile/src/screens/store-profile.tsx");
    expect(page).toMatch(/store\.founding \? <FoundingMark \/>/);
    expect(page).toContain("Founding Store");
    expect(page).toMatch(/name="sparkles"/);
  });
});
