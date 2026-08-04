import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The sync action's guards and accounting. The guards: only a member of the
 * store (or the admin) can replace its counter stock — the action is a
 * public POST endpoint like every Server Action. The accounting: the store
 * is told exactly how much of their file synced, with sold-out rows and
 * other games excluded from the failure count because skipping them is the
 * job, not a fault.
 */

const getViewer = vi.fn();
const cardsByCompactNumbers = vi.fn();
const replaceSingles = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getViewer: () => getViewer() }));
vi.mock("@/lib/singles/repository", () => ({
  cardsByCompactNumbers: (...a: unknown[]) => cardsByCompactNumbers(...a),
  replaceSingles: (...a: unknown[]) => replaceSingles(...a),
}));

const { syncSinglesAction } = await import("@/lib/singles/actions");
const { SYNC_SINGLES_IDLE } = await import("@/lib/singles/schema");

const STORE = "00000000-0000-0000-0000-00000000000b";
const CARD_NAMI = "00000000-0000-0000-0000-0000000000c1";

const HEADER =
  "Product Line,Product Name,Number,Condition,TCG Market Price,Total Quantity";

function csvFile(...rows: string[]): File {
  return new File([[HEADER, ...rows].join("\n")], "inventory.csv", {
    type: "text/csv",
  });
}

function form(file: File | null, storeId = STORE): FormData {
  const data = new FormData();
  data.set("storeId", storeId);
  if (file) data.set("file", file);
  return data;
}

beforeEach(() => {
  getViewer.mockReset();
  cardsByCompactNumbers.mockReset();
  replaceSingles.mockReset();

  getViewer.mockResolvedValue({
    kind: "store",
    user: { id: "u1" },
    storeIds: [STORE],
  });
  cardsByCompactNumbers.mockResolvedValue(new Map([["OP01016", CARD_NAMI]]));
  replaceSingles.mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("syncSinglesAction", () => {
  it("syncs a member's store, aggregated and price-free", async () => {
    const state = await syncSinglesAction(
      SYNC_SINGLES_IDLE,
      form(
        csvFile(
          '"One Piece Card Game","Nami, Cat Burglar",OP01-016,Near Mint,45.00,3',
          '"One Piece Card Game","Nami, Cat Burglar",OP01-016,Played,30.00,2',
        ),
      ),
    );

    expect(state.status).toBe("synced");
    expect(replaceSingles).toHaveBeenCalledWith(STORE, new Map([[CARD_NAMI, 5]]), {
      linesSeen: 2,
      cardsMatched: 1,
      linesUnmatched: 0,
    });
    // Nothing shaped like a price reaches the repository.
    const [, totals] = replaceSingles.mock.calls[0];
    expect([...(totals as Map<string, number>).values()]).toEqual([5]);
  });

  it("writes nothing for a store the viewer does not belong to", async () => {
    getViewer.mockResolvedValue({ kind: "store", user: { id: "u1" }, storeIds: [] });

    const state = await syncSinglesAction(
      SYNC_SINGLES_IDLE,
      form(csvFile('"One Piece Card Game",Nami,OP01-016,NM,45.00,3')),
    );

    expect(state.status).toBe("error");
    expect(replaceSingles).not.toHaveBeenCalled();
    expect(cardsByCompactNumbers).not.toHaveBeenCalled();
  });

  it("counts catalog misses as unmatched and samples them back", async () => {
    cardsByCompactNumbers.mockResolvedValue(new Map());

    const state = await syncSinglesAction(
      SYNC_SINGLES_IDLE,
      form(csvFile('"One Piece Card Game","Mystery Promo",XX99-999,NM,1.00,1')),
    );

    expect(state.status).toBe("synced");
    if (state.status === "synced") {
      expect(state.outcome).toMatchObject({
        linesSeen: 1,
        cardsMatched: 0,
        linesUnmatched: 1,
      });
      expect(state.unmatchedSample).toEqual(["Mystery Promo"]);
    }
  });

  it("does not call sold-out rows or other games failures", async () => {
    const state = await syncSinglesAction(
      SYNC_SINGLES_IDLE,
      form(
        csvFile(
          '"Magic: The Gathering","Llanowar Elves",0193,NM,0.25,4',
          '"One Piece Card Game","Nami, Cat Burglar",OP01-016,NM,45.00,0',
          '"One Piece Card Game","Nami, Cat Burglar",OP01-016,NM,45.00,2',
        ),
      ),
    );

    expect(state.status).toBe("synced");
    if (state.status === "synced") {
      expect(state.outcome).toMatchObject({
        linesSeen: 3,
        cardsMatched: 1,
        linesUnmatched: 0,
      });
    }
  });

  it("refuses a file that is not an inventory export, naming why", async () => {
    const state = await syncSinglesAction(
      SYNC_SINGLES_IDLE,
      form(new File(["Name,Price\nSanji,3.00"], "prices.csv")),
    );

    expect(state.status).toBe("error");
    if (state.status === "error") {
      expect(state.message).toMatch(/does not look like/i);
    }
    expect(replaceSingles).not.toHaveBeenCalled();
  });

  it("requires a file", async () => {
    const state = await syncSinglesAction(SYNC_SINGLES_IDLE, form(null));

    expect(state.status).toBe("error");
    expect(replaceSingles).not.toHaveBeenCalled();
  });

  it("surfaces a storage failure as an error, not a fake success", async () => {
    replaceSingles.mockResolvedValue(false);

    const state = await syncSinglesAction(
      SYNC_SINGLES_IDLE,
      form(csvFile('"One Piece Card Game",Nami,OP01-016,NM,45.00,3')),
    );

    expect(state.status).toBe("error");
  });
});
