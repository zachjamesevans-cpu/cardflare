import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

/**
 * The audit's loose ends, after its feature rounds: the pages that
 * waited on themselves, the Feed's hundred tab stops, the roster that
 * drew one person twice, and three sentences that were missing.
 */
describe("pages stop waiting on themselves", () => {
  it("the Flare page reads the room, the games and the lists at once", () => {
    const page = read("src/app/flare/page.tsx");
    expect(page).toMatch(
      /const \[room, games, \[asked, offering, posted, nearby, hunts, poster, foundCards\]\] =\s*await Promise\.all\(\[/,
    );
    expect(page).not.toContain("const games = await viewerGames();");
  });

  it("the profile pages run their two guards together", () => {
    for (const path of [
      "src/app/profile/page.tsx",
      "src/app/profile/trades/page.tsx",
      "src/app/profile/store/page.tsx",
    ]) {
      const page = read(path);
      expect(page).toContain("const [setupOwed, profile] = await Promise.all([");
      expect(page).not.toContain("if (await needsSetup(playerId))");
    }
  });
});

describe("the Feed carousel is one tab stop", () => {
  const rail = read("src/components/feed/flare-carousel.tsx");

  it("keeps only the card in view in the tab order, and Enter opens it", () => {
    /* Round 16: the pass reads the current slide from a ref so it can
       run from the MutationObserver as well as from render. */
    expect(rail).toContain("stop.tabIndex = index === current.current ? 0 : -1;");
    expect(rail).toContain('slide?.querySelector<HTMLElement>("button")?.click();');
  });
});

describe("the roster draws one person once", () => {
  it("collapses an account's sessions to its newest", () => {
    const lib = read("src/lib/events/participants.ts");
    expect(lib).toContain("const onePerAccount = [...rows]");
    expect(lib).toContain("if (seen.has(account)) return false;");
  });
});

describe("three sentences the audit missed, on both platforms", () => {
  const web = {
    logTrade: read("src/components/trades/log-trade-sheet.tsx"),
    storePage: read("src/app/s/[storeId]/page.tsx"),
    shop: read("src/components/players/cosmetic-shop.tsx"),
  };
  const app = {
    logTrade: read("mobile/src/screens/log-trade.tsx"),
    storePage: read("mobile/src/screens/store-profile.tsx"),
    shop: read("mobile/src/screens/store.tsx"),
  };

  it("says which 'Who with' field to use", () => {
    const LINE =
      "Type their name, or find their account so the trade opens their profile.";
    expect(web.logTrade).toContain(LINE);
    expect(app.logTrade).toContain(LINE);
  });

  it("says when the board opens before doors", () => {
    expect(read("src/lib/stores/public-profile.ts")).toContain("boardOpensAt:");
    expect(web.storePage).toContain(
      "Board opens {nightLabel(night.boardOpensAt, store.timeZone)}",
    );
    expect(app.storePage).toContain("`Board opens ${whenAt(night.boardOpensAt)}`");
  });

  it("tells a free player that wearing is Pro, instead of 'Tap to wear'", () => {
    expect(web.shop).toContain("Pro to wear");
    expect(app.shop).toContain("Pro to wear");
    expect(read("src/app/profile/store/page.tsx")).toContain(
      'tierAllows(profile.tier, "cosmetics")',
    );
  });
});
