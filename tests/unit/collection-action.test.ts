import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The collection import action's guards. The parser runs for real — the
 * fixtures are rows from the first real Collectr file — and only the
 * viewer, the catalog lookup and the write are scripted. The rule under
 * test: an upload can only ever land in the uploader's own collection,
 * and a guest has no collection to land it in.
 */

const getViewer = vi.fn();
const playerForUser = vi.fn();
const replaceCollection = vi.fn();
const printingNamesByCard = vi.fn();
const cardsByCompactNumbers = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getViewer: () => getViewer() }));
vi.mock("@/lib/players/accounts", () => ({
  playerForUser: (...a: unknown[]) => playerForUser(...a),
}));
vi.mock("@/lib/players/collection", () => ({
  replaceCollection: (...a: unknown[]) => replaceCollection(...a),
  printingNamesByCard: (...a: unknown[]) => printingNamesByCard(...a),
}));
vi.mock("@/lib/singles/repository", () => ({
  cardsByCompactNumbers: (...a: unknown[]) => cardsByCompactNumbers(...a),
}));

const { syncCollectionAction } = await import("@/lib/players/collection-actions");

const HEADER =
  "Portfolio Name,Category,Set,Product Name,Card Number,Rarity,Variance,Grade," +
  "Card Condition,Average Cost Paid,Quantity,Market Price (As of 2026-08-06)," +
  "Price Override,Watchlist,Date Added,Notes";

const ROWS = [
  "One Piece,One Piece,Paramount War,Nami (Alternate Art),OP02-036,SR,Foil,Ungraded,Near Mint,0,1,89.33,0,false,2026-07-20,",
  "One Piece,One Piece,Emperors in the New World,Gol.D.Roger,OP09-118,SEC,Foil,Ungraded,Near Mint,0,2,29.79,0,false,2026-05-23,",
  "One Piece,One Piece,The Azure Sea's Seven,Made Up Card,ZZ99-001,SR,Foil,Ungraded,Near Mint,0,1,1.00,0,false,2026-07-25,",
];

function upload(text: string): FormData {
  const data = new FormData();
  data.set("file", new File([text], "export.csv", { type: "text/csv" }));
  return data;
}

const IDLE = { status: "idle" } as const;

beforeEach(() => {
  for (const fn of [
    getViewer,
    playerForUser,
    replaceCollection,
    printingNamesByCard,
    cardsByCompactNumbers,
  ]) {
    fn.mockReset();
  }

  getViewer.mockResolvedValue({
    kind: "player",
    user: { id: "u1" },
    playerId: "player-1",
    playerName: "Kaito",
  });
  cardsByCompactNumbers.mockResolvedValue(
    new Map([
      ["OP02036", "card-nami"],
      ["OP09118", "card-roger"],
    ]),
  );
  printingNamesByCard.mockResolvedValue(
    new Map([
      [
        "card-nami",
        [
          { id: "p-nami-base", printingName: "Nami" },
          { id: "p-nami-alt", printingName: "Nami (Alternate Art)" },
        ],
      ],
      ["card-roger", [{ id: "p-roger", printingName: "Gol.D.Roger" }]],
    ]),
  );
  replaceCollection.mockResolvedValue(true);
});

describe("syncCollectionAction", () => {
  it("imports into the signed-in player's collection, with honest counts", async () => {
    const state = await syncCollectionAction(
      IDLE,
      upload([HEADER, ...ROWS].join("\n")),
    );

    expect(state.status).toBe("synced");
    if (state.status === "synced") {
      expect(state.outcome).toMatchObject({
        linesSeen: 3,
        cardsMatched: 2,
        linesUnmatched: 1,
      });
      expect(state.unmatchedSample).toEqual(["Made Up Card"]);
    }

    /*
     * The printings the file's own names prove: "Nami (Alternate Art)"
     * matches the catalog's alt-art printing name exactly — the pilot's
     * Perona bug, pinned — and "Gol.D.Roger" matches its base printing.
     */
    expect(replaceCollection).toHaveBeenCalledWith(
      "player-1",
      [
        { cardId: "card-nami", printingId: "p-nami-alt", quantity: 1 },
        { cardId: "card-roger", printingId: "p-roger", quantity: 2 },
      ],
      { linesSeen: 3, cardsMatched: 2, linesUnmatched: 1 },
    );
  });

  it("leaves a printing unproven when the names disagree", async () => {
    printingNamesByCard.mockResolvedValue(
      new Map([["card-nami", [{ id: "p-nami-base", printingName: "Nami" }]]]),
    );

    await syncCollectionAction(IDLE, upload([HEADER, ROWS[0]].join("\n")));

    // "Nami (Alternate Art)" with no such catalog name: card kept, printing null.
    expect(replaceCollection).toHaveBeenCalledWith(
      "player-1",
      [{ cardId: "card-nami", printingId: null, quantity: 1 }],
      expect.any(Object),
    );
  });

  it("keeps a resolved and an unresolved copy of one card as two rows", async () => {
    const state = await syncCollectionAction(
      IDLE,
      upload(
        [
          HEADER,
          ROWS[0],
          "One Piece,One Piece,Paramount War,Nami (Wanted Poster),OP02-036,SR,Foil,Ungraded,Near Mint,0,3,1.00,0,false,2026-07-20,",
        ].join("\n"),
      ),
    );

    expect(state.status).toBe("synced");
    if (state.status === "synced") {
      // Two rows, one card: cards stay counted as cards.
      expect(state.outcome.cardsMatched).toBe(1);
    }

    expect(replaceCollection).toHaveBeenCalledWith(
      "player-1",
      [
        { cardId: "card-nami", printingId: "p-nami-alt", quantity: 1 },
        { cardId: "card-nami", printingId: null, quantity: 3 },
      ],
      expect.any(Object),
    );
  });

  it("refuses a guest — there is no collection to land the file in", async () => {
    getViewer.mockResolvedValue({ kind: "anonymous" });

    const state = await syncCollectionAction(IDLE, upload(HEADER));

    expect(state.status).toBe("error");
    expect(replaceCollection).not.toHaveBeenCalled();
  });

  it("resolves the account for an admin who also plays", async () => {
    getViewer.mockResolvedValue({ kind: "admin", user: { id: "a1" }, storeIds: [] });
    playerForUser.mockResolvedValue({ id: "player-9" });

    const state = await syncCollectionAction(
      IDLE,
      upload([HEADER, ROWS[0]].join("\n")),
    );

    expect(state.status).toBe("synced");
    expect(replaceCollection).toHaveBeenCalledWith(
      "player-9",
      expect.any(Array),
      expect.any(Object),
    );
  });

  it("says what a wrong file is, without writing anything", async () => {
    const state = await syncCollectionAction(IDLE, upload("Name,Price\nSanji,3.00"));

    expect(state.status).toBe("error");
    if (state.status === "error") {
      expect(state.message).toMatch(/collectr/i);
    }
    expect(replaceCollection).not.toHaveBeenCalled();
  });

  it("does not count other games as unrecognised lines", async () => {
    const state = await syncCollectionAction(
      IDLE,
      upload(
        [
          HEADER,
          ROWS[0],
          "Binder,Pokemon,Base Set,Charizard,4/102,Rare Holo,Holo,Ungraded,Near Mint,0,1,300.00,0,false,2026-01-01,",
        ].join("\n"),
      ),
    );

    expect(state.status).toBe("synced");
    if (state.status === "synced") {
      expect(state.outcome).toMatchObject({
        linesSeen: 2,
        cardsMatched: 1,
        linesUnmatched: 0,
      });
    }
  });
});
