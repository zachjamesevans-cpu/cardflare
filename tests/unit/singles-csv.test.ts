import { describe, expect, it } from "vitest";

import {
  aggregateByNumber,
  compactNumber,
  MAX_LINES,
  parseCsv,
  parseSinglesExport,
} from "@/lib/singles/csv";

/**
 * The TCGplayer export parser. The stakes: a wrong read here either tells a
 * player the counter has a card it does not, or silently drops a store's
 * stock — and a price that leaks through would break the product's oldest
 * rule. Built against the documented export shape; when a real pilot file
 * arrives, its quirks become fixtures here.
 */

const HEADER =
  "TCGplayer Id,Product Line,Set Name,Product Name,Number,Rarity,Condition," +
  "TCG Market Price,TCG Low Price,Total Quantity,Add to Quantity,TCG Marketplace Price";

function file(...rows: string[]): string {
  return [HEADER, ...rows].join("\r\n");
}

describe("parseCsv", () => {
  it("keeps commas inside quotes — card names contain them", () => {
    const rows = parseCsv('a,"Nami, Cat Burglar",c');

    expect(rows).toEqual([["a", "Nami, Cat Burglar", "c"]]);
  });

  it("unescapes doubled quotes", () => {
    expect(parseCsv('"say ""hi""",b')).toEqual([['say "hi"', "b"]]);
  });

  it("handles CRLF, LF and a quoted newline", () => {
    expect(parseCsv('a,b\r\nc,"d\ne"\nf,g')).toEqual([
      ["a", "b"],
      ["c", "d\ne"],
      ["f", "g"],
    ]);
  });

  it("strips a UTF-8 BOM in front of the header", () => {
    expect(parseCsv("﻿x,y")).toEqual([["x", "y"]]);
  });
});

describe("parseSinglesExport", () => {
  it("reads a documented-shape export, ignoring every price column", () => {
    const parsed = parseSinglesExport(
      file(
        '1,One Piece Card Game,Romance Dawn,"Nami, Cat Burglar",OP01-016,SR,Near Mint,45.00,39.99,3,0,44.50',
        "2,One Piece Card Game,Romance Dawn,Roronoa Zoro,OP01-025,SR,Lightly Played,20.00,18.00,1,0,19.99",
      ),
    );

    expect(parsed).toMatchObject({ ok: true, linesSeen: 2 });
    if (parsed.ok) {
      expect(parsed.lines).toEqual([
        { line: 2, compactNumber: "OP01016", name: "Nami, Cat Burglar", quantity: 3 },
        { line: 3, compactNumber: "OP01025", name: "Roronoa Zoro", quantity: 1 },
      ]);
      // The output shape carries no price, so none can be stored downstream.
      for (const entry of parsed.lines) {
        expect(Object.keys(entry).sort()).toEqual([
          "compactNumber",
          "line",
          "name",
          "quantity",
        ]);
      }
    }
  });

  it("skips other product lines as intentional, not failures", () => {
    const parsed = parseSinglesExport(
      file(
        "1,Magic: The Gathering,Foundations,Llanowar Elves,0193,C,Near Mint,0.25,0.10,12,0,0.20",
        "2,One Piece Card Game,OP-05,Sabo,OP05-007,SR,Near Mint,5.00,4.00,2,0,4.75",
      ),
    );

    expect(parsed).toMatchObject({ ok: true });
    if (parsed.ok) {
      expect(parsed.lines).toHaveLength(1);
      expect(parsed.lines[0]?.compactNumber).toBe("OP05007");
      expect(parsed.skipped).toEqual([
        { line: 2, reason: "other-game", label: "Llanowar Elves" },
      ]);
    }
  });

  it("skips sold-out rows without calling them failures", () => {
    const parsed = parseSinglesExport(
      file("1,One Piece Card Game,OP-01,Sanji,OP01-013,R,Near Mint,3.00,2.50,0,0,2.99"),
    );

    expect(parsed).toMatchObject({ ok: true });
    if (parsed.ok) {
      expect(parsed.lines).toHaveLength(0);
      expect(parsed.skipped[0]).toMatchObject({ reason: "zero-quantity" });
    }
  });

  it("reports a row with no card number, by name, with its line", () => {
    const parsed = parseSinglesExport(
      file("1,One Piece Card Game,OP-01,Booster Box,,,Sealed,90.00,85.00,4,0,89.99"),
    );

    expect(parsed).toMatchObject({ ok: true });
    if (parsed.ok) {
      expect(parsed.skipped).toEqual([
        { line: 2, reason: "no-number", label: "Booster Box" },
      ]);
    }
  });

  it("reports a row with an unreadable quantity", () => {
    const parsed = parseSinglesExport(
      file(
        "1,One Piece Card Game,OP-01,Sanji,OP01-013,R,Near Mint,3.00,2.50,lots,0,2.99",
      ),
    );

    expect(parsed).toMatchObject({ ok: true });
    if (parsed.ok) {
      expect(parsed.skipped[0]).toMatchObject({ reason: "no-quantity" });
    }
  });

  it("refuses a file with no quantity or number column, whole-file", () => {
    const parsed = parseSinglesExport("Name,Price\nSanji,3.00");

    expect(parsed).toEqual({ ok: false, problem: "no-header" });
  });

  it("refuses an empty file", () => {
    expect(parseSinglesExport("")).toEqual({ ok: false, problem: "empty" });
    expect(parseSinglesExport("\n\n")).toEqual({ ok: false, problem: "empty" });
  });

  it("refuses a file over the line cap", () => {
    const rows = Array.from(
      { length: MAX_LINES + 1 },
      () => "1,One Piece Card Game,OP-01,Card,OP01-001,C,NM,1,1,1,0,1",
    );

    expect(parseSinglesExport(file(...rows))).toEqual({
      ok: false,
      problem: "too-many-lines",
    });
  });

  it("reads a minimal header too — number and quantity are enough", () => {
    const parsed = parseSinglesExport("Number,Quantity\nOP01-013,2");

    expect(parsed).toMatchObject({ ok: true });
    if (parsed.ok) {
      expect(parsed.lines[0]).toMatchObject({ compactNumber: "OP01013", quantity: 2 });
    }
  });
});

/*
 * Collectr's collection export, fixtures cut verbatim from the first real
 * pilot file (August 2026). Same parser: the game column answers to
 * "Category", the card number and quantity columns already matched, and
 * the three price columns — including a market-price header that embeds
 * the export date — are never looked up at all.
 */
describe("parseSinglesExport with a Collectr export", () => {
  const COLLECTR_HEADER =
    "Portfolio Name,Category,Set,Product Name,Card Number,Rarity,Variance,Grade," +
    "Card Condition,Average Cost Paid,Quantity,Market Price (As of 2026-08-06)," +
    "Price Override,Watchlist,Date Added,Notes";

  function collectr(...rows: string[]): string {
    return [COLLECTR_HEADER, ...rows].join("\n");
  }

  it("reads real rows, dropping every price on the floor", () => {
    const parsed = parseSinglesExport(
      collectr(
        "One Piece,One Piece,500 Years in the Future,Boa Hancock (051) (Parallel),OP07-051,SR,Foil,Ungraded,Near Mint,0,1,48.72,0,false,2026-07-20,",
        "One Piece,One Piece,Carrying On His Will,Shanks (028) (Alternate Art),OP13-028,SR,Foil,Ungraded,Near Mint,0,2,15.1,0,false,2026-07-04,",
      ),
    );

    expect(parsed).toMatchObject({ ok: true, linesSeen: 2 });
    if (parsed.ok) {
      expect(parsed.lines).toEqual([
        {
          line: 2,
          compactNumber: "OP07051",
          name: "Boa Hancock (051) (Parallel)",
          quantity: 1,
        },
        {
          line: 3,
          compactNumber: "OP13028",
          name: "Shanks (028) (Alternate Art)",
          quantity: 2,
        },
      ]);
      for (const entry of parsed.lines) {
        expect(Object.keys(entry).sort()).toEqual([
          "compactNumber",
          "line",
          "name",
          "quantity",
        ]);
      }
    }
  });

  it("keeps a product name with escaped quotes intact", () => {
    const parsed = parseSinglesExport(
      collectr(
        'One Piece,One Piece,One Piece Promotion Cards,"Eustass""Captain""Kid (Premium Card Collection -Leader Collection-)",ST02-001,L,Foil,Ungraded,Near Mint,0.0000,1,23.96,0,false,2026-04-11,',
      ),
    );

    expect(parsed).toMatchObject({ ok: true });
    if (parsed.ok) {
      expect(parsed.lines[0]?.name).toBe(
        'Eustass"Captain"Kid (Premium Card Collection -Leader Collection-)',
      );
    }
  });

  it("filters other games through the Category column", () => {
    const parsed = parseSinglesExport(
      collectr(
        "Binder,Pokemon,Base Set,Charizard,4/102,Rare Holo,Holo,Ungraded,Near Mint,0,1,300.00,0,false,2026-01-01,",
        "One Piece,One Piece,Paramount War,Nami (Alternate Art),OP02-036,SR,Foil,Ungraded,Near Mint,0,1,89.33,0,false,2026-07-20,",
      ),
    );

    expect(parsed).toMatchObject({ ok: true });
    if (parsed.ok) {
      expect(parsed.lines).toHaveLength(1);
      expect(parsed.lines[0]?.compactNumber).toBe("OP02036");
      expect(parsed.skipped).toEqual([
        { line: 2, reason: "other-game", label: "Charizard" },
      ]);
    }
  });

  it("sums the same number across printings — a graded copy still counts", () => {
    const parsed = parseSinglesExport(
      collectr(
        "One Piece,One Piece,Awakening of the New Era,Monkey.D.Luffy (012) (Alternate Art),ST01-012,SR,Foil,PSA 10.0 GEM - MT,Near Mint,220.0000,1,267.57,0,false,2026-05-28,",
        "One Piece,One Piece,Carrying on His Will: 3rd Anniversary Tournament Cards,Monkey.D.Luffy - ST01-012 (3rd Anniversary Tournament 3 Brothers Pack),ST01-012,SR,Normal,Ungraded,Near Mint,0,1,33.02,0,false,2026-06-12,",
      ),
    );

    expect(parsed).toMatchObject({ ok: true });
    if (parsed.ok) {
      const totals = aggregateByNumber(parsed.lines);
      expect(totals.get("ST01012")).toBe(2);
      expect(totals.size).toBe(1);
    }
  });
});

describe("compactNumber and aggregation", () => {
  it("compacts the way the catalog indexes", () => {
    for (const raw of ["OP01-016", "op01 016", "op01016", " OP01-016 "]) {
      expect(compactNumber(raw)).toBe("OP01016");
    }
  });

  it("sums conditions and printings into one quantity per card", () => {
    const totals = aggregateByNumber([
      { line: 2, compactNumber: "OP01016", name: "Nami", quantity: 3 },
      { line: 3, compactNumber: "OP01016", name: "Nami (Alt)", quantity: 2 },
      { line: 4, compactNumber: "OP01025", name: "Zoro", quantity: 1 },
    ]);

    expect(totals.get("OP01016")).toBe(5);
    expect(totals.get("OP01025")).toBe(1);
    expect(totals.size).toBe(2);
  });
});
