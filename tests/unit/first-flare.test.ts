import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import * as web from "@/lib/feed/first-flare";
import * as app from "../../mobile/src/first-flare";
import { ALLOWED_IMAGE_HOSTS } from "@/lib/cards/images";

/**
 * The Feed's first-Flare starter replaces "Paste a deck list" (the
 * founder, 2026-11-25). Same cards and words on both platforms.
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("the first-Flare starter", () => {
  it("is the same cards and words on the website and in the app", () => {
    expect(app.FIRST_FLARE_CARDS).toEqual(web.FIRST_FLARE_CARDS);
    expect(app.FIRST_FLARE).toEqual(web.FIRST_FLARE);
    expect(app.FIRST_FLARE_SECONDS).toBe(web.FIRST_FLARE_SECONDS);
    expect(web.FIRST_FLARE.headline).toBe("Post your first Flare");
  });

  it("shows a famous card from every game Scrydex carries, art from an allowed host", () => {
    const games = new Set(
      web.FIRST_FLARE_CARDS.map((card) => card.imageUrl.split("/")[3]),
    );
    expect([...games].sort()).toEqual(
      [
        "gundam",
        "lorcana",
        "magicthegathering",
        "onepiece",
        "pokemon",
        "riftbound",
      ].sort(),
    );
    for (const card of web.FIRST_FLARE_CARDS) {
      expect(ALLOWED_IMAGE_HOSTS).toContain(new URL(card.imageUrl).host);
    }
  });

  it("takes the deck-list starter's place on both Feeds, into the composer", () => {
    expect(read("src/components/feed/feed-items.tsx")).toContain(
      'if (item.kind === "start" && item.topic === "deck") return <FirstFlareCard />;',
    );
    expect(read("src/components/feed/first-flare-card.tsx")).toContain('href="/flare"');
    const home = read("mobile/src/screens/home.tsx");
    expect(home).toContain('item.kind === "start" && item.topic === "deck" ? (');
    expect(home).toContain(
      'onPost={() => navigation.navigate("Tabs", { screen: "Flare" })}',
    );
  });

  it("holds still for anyone who asked for less motion", () => {
    expect(read("src/components/feed/first-flare-card.tsx")).toContain(
      "motion-reduce:animate-none",
    );
    expect(read("mobile/src/first-flare-card.tsx")).toContain("isReduceMotionEnabled");
  });
});
