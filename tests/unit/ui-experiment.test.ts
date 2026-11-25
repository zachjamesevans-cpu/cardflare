import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/v1/nearby/traders/route";
import {
  matchLine,
  rankTraders,
  tradeCountLine,
  type TraderCandidate,
  type TraderCard,
} from "@/lib/nearby/traders-rank";
import { uiExperimentEnabled } from "@/lib/ui-experiment";
import {
  parseRecentCards,
  RECENT_CARDS_LIMIT,
  recentCardsKey,
  withRecentCard,
  type RecentCard,
} from "../../mobile/src/recent-card-list";
import { LAB_GAMES, labScope, noCardsLine } from "../../mobile/src/search-lab-games";

/**
 * The search and nearby-traders UI experiment (docs/UI_EXPERIMENT.md).
 * Off by default on both ends; when on, honest counts only.
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const person = (id: string, miles: number): TraderCandidate => ({
  playerId: id,
  displayName: id,
  handle: id,
  avatarUrl: null,
  frame: null,
  miles,
});
const pocket = (
  playerId: string,
  cardId: string,
  quantity = 1,
  game = "one-piece",
): TraderCard => ({
  playerId,
  cardId,
  quantity,
  game,
});

describe("shipped on, with an off switch on both ends", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("on the server", () => {
    vi.stubEnv("CARDFLARE_UI_EXPERIMENT", "");
    expect(uiExperimentEnabled()).toBe(true);
    vi.stubEnv("CARDFLARE_UI_EXPERIMENT", "0");
    expect(uiExperimentEnabled()).toBe(false);
  });

  it("answers 404 from its endpoint while off, before asking who you are", async () => {
    vi.stubEnv("CARDFLARE_UI_EXPERIMENT", "0");
    const response = await GET(new Request("http://localhost/api/v1/nearby/traders"));
    expect(response.status).toBe(404);
  });

  it("in the app: on unless a build sets the variable to 0", () => {
    const flag = read("mobile/src/ui-experiment.ts");
    expect(flag).toContain(
      'export const UI_EXPERIMENT = process.env.EXPO_PUBLIC_CARDFLARE_UI_EXPERIMENT !== "0";',
    );
    for (const config of ["mobile/app.json", "mobile/eas.json"]) {
      expect(read(config)).not.toContain("CARDFLARE_UI_EXPERIMENT");
    }
  });

  it("swaps screens only behind the flag, leaving the originals in place", () => {
    const app = read("mobile/App.tsx");
    expect(app).toContain("component={UI_EXPERIMENT ? SearchLabScreen : SearchScreen}");
    expect(app).toMatch(/\{UI_EXPERIMENT \? \(\s*<Stack\.Screen\s*name="Traders"/);
    expect(read("mobile/src/screens/home.tsx")).toContain(
      "{plan && UI_EXPERIMENT && !plan.ask ? <TradersStrip onCount={setTradersCount} /> : null}",
    );
    /* Only the experiment's own path goes to the local server. */
    expect(read("mobile/src/api.ts")).toContain(
      "UI_EXPERIMENT && EXPERIMENT_API_BASE && experimentPath(path)",
    );
  });
});

describe("traders near you: counting", () => {
  const near = [person("a", 3), person("b", 1), person("c", 8)];

  it("counts copies, not pockets, and leaves out anyone with nothing to trade", () => {
    const ranked = rankTraders(
      near,
      [pocket("a", "x", 3), pocket("a", "y", 2), pocket("b", "z", 1)],
      new Set(),
    );
    expect(ranked.map((t) => [t.playerId, t.tradeCount])).toEqual([
      ["b", 1],
      ["a", 5],
    ]);
  });

  it("counts a hunted card once as a match, however many pockets hold it", () => {
    const [a] = rankTraders(
      near,
      [pocket("a", "x", 2), pocket("a", "x", 1), pocket("a", "y", 1)],
      new Set(["x"]),
    );
    expect(a.tradeCount).toBe(4);
    expect(a.matchCount).toBe(1);
  });

  it("ranks people holding cards you hunt first, then nearest, then most cards", () => {
    const ranked = rankTraders(
      [...near, person("d", 1)],
      [
        pocket("a", "x"),
        pocket("b", "q"),
        pocket("c", "x"),
        pocket("c", "y"),
        pocket("d", "q"),
        pocket("d", "r"),
      ],
      new Set(["x", "y"]),
    );
    expect(ranked.map((t) => t.playerId)).toEqual(["c", "a", "d", "b"]);
  });

  it("scopes both numbers to a game, and can keep only matches", () => {
    const cards = [
      pocket("a", "x", 2, "pokemon"),
      pocket("a", "y", 3, "one-piece"),
      pocket("b", "z", 1, "one-piece"),
    ];
    const pokemon = rankTraders(near, cards, new Set(["y"]), { game: "pokemon" });
    expect(pokemon.map((t) => [t.playerId, t.tradeCount, t.matchCount])).toEqual([
      ["a", 2, 0],
    ]);
    const matching = rankTraders(near, cards, new Set(["y"]), { matchingOnly: true });
    expect(matching.map((t) => t.playerId)).toEqual(["a"]);
  });

  it("ignores broken quantities rather than inventing cards", () => {
    expect(
      rankTraders(near, [pocket("a", "x", 0), pocket("a", "y", Number.NaN)], new Set()),
    ).toEqual([]);
  });

  it("says the numbers plainly", () => {
    expect(tradeCountLine(148)).toBe("148 cards for trade");
    expect(tradeCountLine(1)).toBe("1 card for trade");
    expect(tradeCountLine(1200)).toBe("1,200 cards for trade");
    expect(matchLine(0)).toBeNull();
    expect(matchLine(1)).toBe("1 card matches your Hunts");
    expect(matchLine(3)).toBe("3 cards match your Hunts");
  });

  it("uses the same words in the app", () => {
    const app = read("mobile/src/traders.ts");
    expect(app).toContain(
      '`${count} ${count === 1 ? "card matches" : "cards match"} your Hunts`',
    );
    expect(app).toContain(
      '`${count.toLocaleString("en-US")} ${count === 1 ? "card" : "cards"} for trade`',
    );
  });

  it("only ever counts binders up for trade, never private ones or the imported collection", () => {
    const server = read("src/lib/nearby/traders.ts");
    expect(server).toContain('.eq("for_trade", true)');
    expect(server).toContain('.eq("nearby_matching", true)');
    expect(server).not.toContain(`from("player_collection")`);
    /* Distances leave rounded, like every other nearby distance. */
    expect(server).toContain("miles: roundedMiles(trader.miles)");
    expect(server).toContain("blockedSet(viewerId)");
  });
});

describe("search: recent cards and games", () => {
  const card = (id: string): RecentCard => ({
    cardId: id,
    name: `Card ${id}`,
    cardNumber: `OP01-${id}`,
    label: null,
    imageUrl: null,
    game: "one-piece",
  });

  it("keeps the newest first, once each, up to the limit", () => {
    let list: RecentCard[] = [];
    for (let i = 0; i < RECENT_CARDS_LIMIT + 3; i += 1)
      list = withRecentCard(list, card(String(i)));
    expect(list).toHaveLength(RECENT_CARDS_LIMIT);
    list = withRecentCard(list, card("5"));
    expect(list[0].cardId).toBe("5");
    expect(list.filter((item) => item.cardId === "5")).toHaveLength(1);
  });

  it("reads a stored list safely and keeps one per account under the cache prefix", () => {
    expect(parseRecentCards(null)).toEqual([]);
    expect(parseRecentCards("not json")).toEqual([]);
    expect(parseRecentCards(JSON.stringify([{ cardId: "" }, card("1"), 4]))).toEqual([
      card("1"),
    ]);
    expect(recentCardsKey("p1")).toBe("cardflare.cache.v2.recent-cards.p1");
    expect(recentCardsKey(null)).toBe("cardflare.cache.v2.recent-cards.guest");
  });

  it("offers every game, with Flesh and Blood (not on Scrydex) last and not choosable", () => {
    expect(LAB_GAMES.at(-1)).toMatchObject({ slug: "flesh-and-blood", catalog: false });
    expect(LAB_GAMES.filter((game) => game.catalog)).toHaveLength(6);
    expect(labScope("flesh-and-blood")).toBeNull();
    expect(labScope("riftbound")).toBe("riftbound");
    expect(labScope("pokemon")).toBe("pokemon");
    expect(labScope("all")).toBeNull();
  });

  it("says what it could not find, and counts printings without merging them", () => {
    expect(noCardsLine("zoro", "one-piece")).toBe('No One Piece cards match "zoro".');
    expect(noCardsLine("zoro", null)).toBe('No cards match "zoro".');
  });
});
