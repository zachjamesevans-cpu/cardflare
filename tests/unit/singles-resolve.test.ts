import { describe, expect, it, vi } from "vitest";

import type { SinglesLine } from "@/lib/singles/csv";

/**
 * Matching an inventory export to the catalogue, for every game the site
 * carries. One Piece and Flesh and Blood print numbers that name a card
 * on their own; Magic, Pokémon, Lorcana and Riftbound print numbers that
 * repeat in every set, which the catalogue keys SETCODE-NUMBER, so those
 * are found through the set's name. Exact either way: a wrong guess tells
 * a player the counter has a card the store never listed.
 */

const CARDS = [
  { id: "nami", game: "one-piece", compact_card_number: "OP01016" },
  { id: "rhinar", game: "flesh-and-blood", compact_card_number: "WTR001" },
  { id: "ocelot", game: "mtg", compact_card_number: "MH3123" },
  { id: "other-123", game: "mtg", compact_card_number: "ONE123" },
  { id: "terapagos", game: "pokemon", compact_card_number: "SV07045" },
  { id: "elsa", game: "lorcana", compact_card_number: "1012" },
];
const SETS: Record<string, { set_code: string; set_name: string }[]> = {
  mtg: [
    { set_code: "MH3", set_name: "Modern Horizons 3" },
    { set_code: "ONE", set_name: "Phyrexia: All Will Be One" },
  ],
  pokemon: [{ set_code: "SV07", set_name: "Stellar Crown" }],
  lorcana: [{ set_code: "1", set_name: "The First Chapter" }],
};

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    from: () => {
      const filters: { numbers: string[]; game: string | null } = {
        numbers: [],
        game: null,
      };
      const query = {
        select: () => query,
        in: (_column: string, numbers: string[]) => {
          filters.numbers = numbers;
          return query;
        },
        eq: (_column: string, game: string) => {
          filters.game = game;
          return query;
        },
        then: (resolve: (value: unknown) => unknown) =>
          resolve({
            data: CARDS.filter(
              (card) =>
                filters.numbers.includes(card.compact_card_number) &&
                (filters.game === null || card.game === filters.game),
            ),
            error: null,
          }),
      };
      return query;
    },
    rpc: async (_name: string, args: { p_game: string; p_names: string[] }) => ({
      data: (SETS[args.p_game] ?? []).filter((set) =>
        args.p_names.includes(set.set_name.toLowerCase().replace(/[^a-z0-9]/g, "")),
      ),
      error: null,
    }),
  }),
}));

const { resolveSinglesCards, setNameCandidates, setNumberCandidates } =
  await import("@/lib/singles/repository");

function line(
  n: number,
  game: SinglesLine["game"],
  setName: string,
  compactNumber: string,
): SinglesLine {
  return { line: n, game, setName, compactNumber, name: `line ${n}`, quantity: 1 };
}

describe("resolveSinglesCards", () => {
  it("matches every game the site carries", async () => {
    const found = await resolveSinglesCards([
      line(2, "one-piece", "Romance Dawn", "OP01016"),
      line(3, "flesh-and-blood", "Welcome to Rathe", "WTR001"),
      line(4, "mtg", "Modern Horizons 3", "0123"),
      line(5, "pokemon", "SV07: Stellar Crown", "045"),
      line(6, "lorcana", "The First Chapter", "12"),
    ]);

    expect(Object.fromEntries(found)).toEqual({
      2: "nami",
      3: "rhinar",
      4: "ocelot",
      5: "terapagos",
      6: "elsa",
    });
  });

  /* "123" is in every Magic set; only the set's name says which. */
  it("tells a repeated number apart by its set", async () => {
    const found = await resolveSinglesCards([
      line(2, "mtg", "Phyrexia: All Will Be One", "123"),
    ]);
    expect(found.get(2)).toBe("other-123");
  });

  it("leaves a set it cannot name unmatched rather than guessing", async () => {
    const found = await resolveSinglesCards([
      line(2, "mtg", "A Set Nobody Printed", "123"),
    ]);
    expect(found.size).toBe(0);
  });

  it("never matches a number across games when the file names the game", async () => {
    const found = await resolveSinglesCards([line(2, "pokemon", "", "OP01016")]);
    expect(found.size).toBe(0);
  });
});

describe("the spellings tried", () => {
  it("looks a set up whole and without its leading code", () => {
    expect(setNameCandidates("SV07: Stellar Crown")).toEqual([
      "sv07stellarcrown",
      "stellarcrown",
    ]);
  });

  it("tries a number as printed, bare and padded", () => {
    expect(setNumberCandidates("SV07", "45")).toEqual(["SV0745", "SV07045"]);
    expect(setNumberCandidates("MH3", "0123")).toEqual(["MH30123", "MH3123"]);
  });
});
