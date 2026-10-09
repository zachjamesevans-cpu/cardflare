import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  bringFrom,
  chunk,
  EMPTY_MATCHES,
  emptyLists,
  intersect,
  isMutual,
  matchAttendees,
  printingMatch,
  wantedPrinting,
  NIGHT_ATTENDEE_CAP,
  orderMatched,
  perPlayerCounts,
  summarize,
  type CardLists,
} from "@/lib/events/night-matches";
import {
  bringLine,
  flaresLine,
  hereNowLine,
  huntingHereLine,
  matchesForYouLine,
  matchesLine,
  matchesWithYouLine,
  playersLine,
  tradeCardsLine,
  wantedByLine,
  wantYoursLine,
} from "@/lib/events/night-copy";

/**
 * Nights, round 2: the trading dashboard's server half, pinned.
 *
 * The founder: "The most valuable information is NOT 'Who is
 * attending?' The most valuable information is 'Who can I trade with
 * and why?'" What is pinned here is the arithmetic the two clients
 * draw from: which attendee matches which way, what the four numbers
 * at the top count, what goes on the checklist, the words, and the
 * privacy rule that only the Have list ever feeds a match.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

type ListKey = "wants" | "flareWants" | "binderHaves" | "flareHaves";

function lists(over: Partial<Record<ListKey, string[]>>): CardLists {
  const base = emptyLists();
  for (const key of Object.keys(over) as ListKey[]) {
    base[key] = new Set(over[key]);
  }
  /* A Flare at the night is one of the wants, by definition. */
  for (const card of base.flareWants) base.wants.add(card);
  return base;
}

/* The founder's example: CHUNC has Shanks and wants Zoro; the viewer
   wants Shanks and has Zoro in the Trade binder. */
const viewer = lists({
  wants: ["shanks", "nami"],
  flareWants: ["shanks"],
  binderHaves: ["zoro", "luffy"],
  flareHaves: ["ace"],
});

const roster = new Map<string, CardLists>([
  ["chunc", lists({ binderHaves: ["shanks"], wants: ["zoro"] })],
  ["alex", lists({ wants: ["zoro", "luffy"] })],
  ["jamie", lists({ flareHaves: ["nami"] })],
  ["quiet", lists({ binderHaves: ["kid"], wants: ["law"] })],
  ["ace-fan", lists({ wants: ["ace"] })],
]);

describe("matching", () => {
  const matched = matchAttendees(viewer, roster);
  const byId = new Map(matched.map((player) => [player.playerId, player]));

  it("finds every attendee with something to trade, both ways, and nobody else", () => {
    expect([...byId.keys()].sort()).toEqual(["ace-fan", "alex", "chunc", "jamie"]);
  });

  it("they have what you want, with the source and whether your Flare asked", () => {
    expect(byId.get("chunc")?.theyHave).toEqual([
      {
        cardId: "shanks",
        source: "binder",
        fromYourFlare: true,
        match: "exact",
        printingId: null,
        bringingFrom: null,
      },
    ]);
    expect(byId.get("jamie")?.theyHave).toEqual([
      {
        cardId: "nami",
        source: "flare",
        fromYourFlare: false,
        match: "exact",
        printingId: null,
        bringingFrom: null,
      },
    ]);
  });

  it("they want what you have, from the binder or a showcase Flare", () => {
    expect(byId.get("alex")?.theyWant.map((card) => card.cardId)).toEqual([
      "zoro",
      "luffy",
    ]);
    expect(byId.get("ace-fan")?.theyWant.map((card) => card.cardId)).toEqual(["ace"]);
  });

  it("a mutual match is both directions at once", () => {
    expect(isMutual(byId.get("chunc")!)).toBe(true);
    expect(isMutual(byId.get("alex")!)).toBe(false);
    expect(isMutual(byId.get("jamie")!)).toBe(false);
  });

  it("the binder is the durable fact when a card is in both", () => {
    const both = matchAttendees(
      lists({ wants: ["shanks"] }),
      new Map([["p", lists({ binderHaves: ["shanks"], flareHaves: ["shanks"] })]]),
    );
    expect(both[0].theyHave[0].source).toBe("binder");
  });

  it("matches on the card, never on who posted it twice", () => {
    const twice = matchAttendees(
      lists({ wants: ["shanks"] }),
      new Map([
        ["a", lists({ binderHaves: ["shanks"] })],
        ["b", lists({ binderHaves: ["shanks"] })],
      ]),
    );
    expect(summarize(twice).cardsHuntingHere).toBe(1);
  });
});

describe("printings", () => {
  const any = new Set<string | null>([null]);
  const alt = new Set<string | null>(["alt"]);
  const base = new Set<string | null>(["base"]);
  const unknown = new Set<string | null>([null]);

  it("any printing asked for is exact with any copy, even one of unknown printing", () => {
    expect(printingMatch(any, base)).toBe("exact");
    expect(printingMatch(any, unknown)).toBe("exact");
    expect(printingMatch(undefined, base)).toBe("exact");
    expect(printingMatch(new Set(), undefined)).toBe("exact");
  });

  it("a named printing is exact only when the holder is known to have it", () => {
    expect(printingMatch(alt, new Set(["alt", "base"]))).toBe("exact");
    expect(printingMatch(alt, base)).toBe("other-printing");
    expect(printingMatch(alt, unknown)).toBe("other-printing");
    expect(printingMatch(alt, undefined)).toBe("other-printing");
  });

  it("wanting it in any printing as well as the alt art is wanting any printing", () => {
    expect(printingMatch(new Set(["alt", null]), base)).toBe("exact");
    expect(wantedPrinting(new Set(["alt", null]), base)).toBeNull();
  });

  it("names the printing the card is drawn as: the held one, else the one asked for", () => {
    expect(wantedPrinting(any, base)).toBeNull();
    expect(wantedPrinting(new Set(["alt", "promo"]), new Set(["promo"]))).toBe("promo");
    expect(wantedPrinting(alt, base)).toBe("alt");
  });

  it("carries the grade and the printing onto both directions of a match", () => {
    const want = emptyLists();
    want.wants.add("shanks");
    want.wantPrintings.set("shanks", alt);
    want.binderHaves.add("zoro");
    want.havePrintings.set("zoro", base);
    const other = emptyLists();
    other.binderHaves.add("shanks");
    other.havePrintings.set("shanks", base);
    other.wants.add("zoro");
    other.wantPrintings.set("zoro", base);
    const [player] = matchAttendees(want, new Map([["p", other]]));
    expect(player?.theyHave[0]).toMatchObject({
      match: "other-printing",
      printingId: "alt",
    });
    expect(player?.theyWant[0]).toMatchObject({ match: "exact", printingId: "base" });
  });
});

describe("the four numbers", () => {
  const matched = matchAttendees(viewer, roster);

  it("count distinct cards one way and people the other, and add them", () => {
    expect(summarize(matched)).toEqual({
      /* shanks + nami are here; alex, chunc and ace-fan want yours. */
      total: 5,
      cardsHuntingHere: 2,
      playersWantYours: 3,
      mutual: 1,
    });
  });

  it("per player is distinct cards both directions", () => {
    expect(perPlayerCounts(matched)).toEqual({
      chunc: 2,
      alex: 2,
      jamie: 1,
      "ace-fan": 1,
    });
  });

  it("the empty answer is all zeros and nothing drawn", () => {
    expect(EMPTY_MATCHES.summary).toEqual({
      total: 0,
      cardsHuntingHere: 0,
      playersWantYours: 0,
      mutual: 0,
    });
    expect(EMPTY_MATCHES.mutual).toEqual([]);
    expect(EMPTY_MATCHES.bring).toEqual([]);
    expect(summarize([])).toEqual(EMPTY_MATCHES.summary);
  });
});

describe("what to bring", () => {
  const names = new Map([
    ["chunc", "CHUNC"],
    ["alex", "Alex"],
    ["ace-fan", "Portgas"],
  ]);
  const nameOf = (id: string) => names.get(id) ?? "Player";
  const bring = bringFrom(matchAttendees(viewer, roster), viewer.binderHaves, nameOf);

  it("lists only the binder's cards somebody wants, most wanted first", () => {
    expect(bring).toEqual([
      { cardId: "zoro", wantedBy: ["CHUNC", "Alex"] },
      { cardId: "luffy", wantedBy: ["Alex"] },
    ]);
  });

  it("never asks you to pack a showcase Flare: it is already in the bag", () => {
    expect(bring.some((card) => card.cardId === "ace")).toBe(false);
  });
});

describe("ordering and chunking", () => {
  it("most cards first, then by name", () => {
    const nameOf = (id: string) => ({ a: "Zed", b: "Amy", c: "Bo" })[id] ?? id;
    const ordered = orderMatched(
      [
        { playerId: "a", weight: 1 },
        { playerId: "b", weight: 1 },
        { playerId: "c", weight: 3 },
      ],
      (player) => player.weight,
      nameOf,
    );
    expect(ordered.map((player) => player.playerId)).toEqual(["c", "b", "a"]);
  });

  it("intersects in the first list's order", () => {
    expect(intersect(["c", "a", "b"], new Set(["a", "c", "z"]))).toEqual(["c", "a"]);
  });

  it("chunks for the row ceiling", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });

  it("caps the roster at two hundred", () => {
    expect(NIGHT_ATTENDEE_CAP).toBe(200);
  });
});

describe("the words", () => {
  it("count players, matches and cards the way the founder wrote them", () => {
    expect(playersLine(0)).toBe("Nobody yet");
    expect(playersLine(1)).toBe("1 player");
    expect(playersLine(18)).toBe("18 players");
    expect(hereNowLine(3)).toBe("3 here now");
    expect(matchesLine(1)).toBe("1 match");
    expect(matchesLine(6)).toBe("6 matches");
    expect(matchesForYouLine(1)).toBe("1 match for you");
    expect(matchesForYouLine(7)).toBe("7 matches for you");
    expect(huntingHereLine(1)).toBe("1 card you're hunting is here");
    expect(huntingHereLine(4)).toBe("4 cards you're hunting are here");
    expect(wantYoursLine(1)).toBe("1 player wants cards you have");
    expect(wantYoursLine(3)).toBe("3 players want cards you have");
    expect(bringLine(1)).toBe("Players at this night are looking for 1 card you own.");
    expect(bringLine(5)).toBe("Players at this night are looking for 5 cards you own.");
    expect(matchesWithYouLine(1)).toBe("1 match with you");
    expect(matchesWithYouLine(2)).toBe("2 matches with you");
    expect(flaresLine(1)).toBe("1 Flare");
    expect(flaresLine(9)).toBe("9 Flares");
    expect(tradeCardsLine(1)).toBe("1 trade card");
    expect(tradeCardsLine(42)).toBe("42 trade cards");
  });

  it("names who wants a card, and counts the rest", () => {
    expect(wantedByLine(["CHUNC"])).toBe("Wanted by CHUNC");
    expect(wantedByLine(["Alex", "Jamie"])).toBe("Wanted by Alex + 1 other");
    expect(wantedByLine(["Alex", "Jamie", "Kaito"])).toBe("Wanted by Alex + 2 others");
  });

  it("the copy has no server-only import, so clients can read it", () => {
    const copy = read("src/lib/events/night-copy.ts");
    expect(copy).not.toContain('import "server-only"');
    /* No em dashes, the brief's rule, spelled by code point so this file keeps it too. */
    expect(copy).not.toContain(String.fromCharCode(0x2014));
  });
});

describe("the privacy rule", () => {
  it("binder cards come from the Have list and brought binders only: binder_cards is never read here", () => {
    const matches = read("src/lib/events/night-matches.ts");
    expect(matches).not.toContain('from("binder_cards")');
    expect(matches).not.toContain('from("binders")');
    expect(matches).toContain("BINDER CARDS COME FROM TWO PLACES, AND ONLY TWO.");
    /* The second place is the binders brought to this night, read
       through night-binders.ts, where the privacy rule lives. */
    expect(matches).toContain("broughtCardsAt(");
    /* Graded by printing the way the board grades an offer, said in so many words. */
    expect(matches).toContain("graded by printing");
    expect(matches).toContain("printingMatch(wanted, held)");
    /* Batched, never embedded. */
    expect(matches).not.toMatch(/select\("[^"]*\([^"]*\)[^"]*"\)/);
    expect(matches).toContain("NIGHT_ATTENDEE_CAP = 200");
  });

  it("the event-facing profile keeps to binders up for trade", () => {
    const matches = read("src/lib/events/night-matches.ts");
    expect(matches).toContain("binders.filter((binder) => binder.forTrade)");
  });

  it("a guest gets the empty answer from every door", () => {
    const matches = read("src/lib/events/night-matches.ts");
    expect(matches).toContain(
      "if (!viewerId || !isSupabaseConfigured()) return EMPTY_MATCHES;",
    );
    expect(read("src/app/api/v1/nights/[eventId]/matches/route.ts")).toContain(
      "if (!account) return Response.json(EMPTY_MATCHES);",
    );
  });
});

describe("the Packed tick", () => {
  it("has a table keyed on the night, the player and the card, with RLS on", () => {
    const migration = read("supabase/migrations/20261029090000_night_packing.sql");
    expect(migration).toContain("create table if not exists public.night_packing");
    expect(migration).toContain("references public.events(id) on delete cascade");
    expect(migration).toContain("references public.players(id) on delete cascade");
    expect(migration).toContain("references public.cards(id) on delete cascade");
    expect(migration).toContain("primary key (event_id, player_id, card_id)");
    expect(migration).toContain(
      "alter table public.night_packing enable row level security;",
    );
    expect(migration).not.toMatch(/create policy/i);
    expect(migration).toContain("WHAT TO BRING");
    expect(migration).toMatch(/^begin;/m);
    expect(migration).toMatch(/^commit;/m);
  });

  it("the row type and the table reach the client types", () => {
    const types = read("src/lib/supabase/types.ts");
    expect(types).toContain("export type NightPackingRow = {");
    expect(types).toContain(
      "night_packing: Table<NightPackingRow, NightPackingInsert>;",
    );
  });

  it("is written by one function from the website's action and the app's route", () => {
    expect(read("src/lib/events/night-actions.ts")).toMatch(/^"use server";/);
    expect(read("src/lib/events/night-actions.ts")).toContain(
      "export async function setPackedAction(",
    );
    expect(read("src/lib/events/night-actions.ts")).toContain(
      "setPacked(event.data, account.playerId, card.data, packed)",
    );
    const route = read("src/app/api/v1/nights/[eventId]/packed/route.ts");
    expect(route).toContain("export async function PUT");
    expect(route).toContain("if (!account) return unauthorized();");
    expect(route).toContain("return Response.json({ ok: true });");
  });
});

describe("the API", () => {
  it("has the matches, packed and player routes", () => {
    for (const path of [
      "src/app/api/v1/nights/[eventId]/matches/route.ts",
      "src/app/api/v1/nights/[eventId]/packed/route.ts",
      "src/app/api/v1/nights/[eventId]/players/[playerId]/route.ts",
    ]) {
      expect(existsSync(join(process.cwd(), path)), path).toBe(true);
    }
  });

  it("absolutises faces and card art for the phone, and 404s off the roster", () => {
    const player = read("src/app/api/v1/nights/[eventId]/players/[playerId]/route.ts");
    expect(player).toContain("absoluteImageUrls(view)");
    expect(player).toContain(
      'if (!view) return Response.json({ error: "not-found" }, { status: 404 });',
    );
    expect(read("src/app/api/v1/nights/[eventId]/matches/route.ts")).toContain(
      "absoluteImageUrls(matches)",
    );
  });

  it("the room answer carries here now and the store's contact lines", () => {
    const route = read("src/app/api/v1/rooms/[code]/route.ts");
    expect(route).toContain("hereNow:");
    expect(route).toContain("store,");
    expect(route).toContain("address, phone: store.phone, website: store.website");
  });
});

describe("the roster", () => {
  it("carries trade cards and matches, filled in batch", () => {
    const going = read("src/lib/events/going.ts");
    expect(going).toContain("tradeCards: number;");
    expect(going).toContain("matches: number;");
    expect(going).toContain("tradeCardCounts(accounts)");
    expect(going).toContain("perPlayerMatches(eventId, viewerId)");
    /* A guest row, and a guest viewer, read as zero rather than a lie. */
    expect(going).toContain("matches: row.playerId ? (matches[row.playerId] ?? 0) : 0");
  });
});
