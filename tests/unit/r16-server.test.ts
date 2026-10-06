import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const flat = (text: string) => text.replace(/\s+/g, " ");

describe("a message keeps the art its cards were offered in", () => {
  const threads = flat(read("src/lib/local/threads.ts"));

  it("writes each card's printing beside it", () => {
    expect(threads).toContain("printing_ids: printingIds,");
    expect(threads).toContain("flarePrintingId: flare.printing_id,");
    expect(flat(read("src/lib/binder/offers.ts"))).toContain(
      "picked.map(({ card }) => card.printingId),",
    );
  });

  it("draws the printing's art, falling back to the card's", () => {
    expect(threads).toContain(
      "const imageUrl = (printing && artByPrinting.get(printing)) || card.imageUrl;",
    );
  });

  it("adds the column, safe to run again", () => {
    expect(
      flat(read("supabase/migrations/20261108090000_message_printings.sql")),
    ).toContain("add column if not exists printing_ids uuid[] not null default '{}'");
  });
});

describe("the chat header carries their handle", () => {
  it("is read with the name", () => {
    expect(flat(read("src/lib/local/threads.ts"))).toContain(
      "withHandle: other?.handle ?? null,",
    );
  });
});

describe("Flare history", () => {
  const history = flat(read("src/lib/flares/history.ts"));

  it("is every Flare no longer open, or found in full", () => {
    expect(history).toContain(
      'flare.status !== "open" || (flare.found_quantity ?? 0) >= flare.quantity',
    );
  });

  it("names who answered, from offers and from messages, once each", () => {
    expect(history).toContain('.from("flare_responses")');
    expect(history).toContain('.from("flare_threads")');
    expect(history).toContain("if (seen.has(key)) continue;");
  });

  it("is open to the app", () => {
    expect(flat(read("src/app/api/v1/flares/history/route.ts"))).toContain(
      "await listFlareHistory(player.playerId)",
    );
  });
});
