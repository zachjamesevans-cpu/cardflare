import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POCKETS_PER_PAGE as BINDER_POCKETS } from "@/lib/binder/pocket-math";
import {
  POCKETS_PER_PAGE,
  addPagesLabel,
  firstEmptyPage,
  pageStatusLine,
  pagesPlacedLine,
  pocketAt,
  pocketCrop,
  startingAtLine,
} from "@/lib/cards/scan-rules";

/**
 * Scanning whole binder pages. The founder (2026-10-09): "scan, let's say
 * 5 pages of their binder into a queue and it auto fills in an actual
 * binder, with the exact same location the cards were in in their
 * binder." Agreed: a second copy counts up, a full pocket is never
 * written over, and nothing is placed before the player has checked it.
 */

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("a page and its pockets", () => {
  it("counts pockets the way the binder does", () => {
    expect(POCKETS_PER_PAGE).toBe(BINDER_POCKETS);
    expect(pocketAt(1, 0)).toBe(0);
    expect(pocketAt(1, 8)).toBe(8);
    expect(pocketAt(4, 4)).toBe(31);
  });

  it("starts at the first page past the last card", () => {
    expect(firstEmptyPage([])).toBe(1);
    expect(firstEmptyPage([0, 1, 2])).toBe(2);
    /* A page with a gap in it is not an empty page. */
    expect(firstEmptyPage([0, 20])).toBe(4);
    expect(firstEmptyPage([899])).toBe(100);
  });

  it("cuts each pocket a little larger than its square, inside the photo", () => {
    const corner = pocketCrop(0, 900, 1260);
    expect(corner.x).toBe(0);
    expect(corner.y).toBe(0);
    expect(corner.width).toBe(Math.round(300 * 1.06));
    const middle = pocketCrop(4, 900, 1260);
    expect(middle.x).toBe(Math.round(300 * 0.94));
    expect(middle.width).toBe(Math.round(300 * 1.12));
    const last = pocketCrop(8, 900, 1260);
    expect(last.x + last.width).toBe(900);
    expect(last.y + last.height).toBe(1260);
  });

  it("says what happened in plain words", () => {
    expect(startingAtLine(4)).toBe("Starting at page 4");
    expect(pageStatusLine(4, 8, 9)).toBe("Page 4 · 8 of 9 read");
    expect(pageStatusLine(5, 0, 0)).toBe("Page 5 · no cards");
    expect(addPagesLabel(1)).toBe("Add 1 page to binder");
    expect(addPagesLabel(5)).toBe("Add 5 pages to binder");
    expect(pagesPlacedLine({ added: 41, merged: 2, occupied: 1, skipped: 0 })).toBe(
      "Placed 41 cards. 2 were already in this binder, so their counts went up. 1 pocket was already full, so that card was left out.",
    );
  });
});

/* ---- Placing pages, with the database faked ---------------------------- */

/*
 * Placing is one database function (binder_place_scanned, in
 * supabase/migrations/20261120090000_scanner_v2.sql), so a failure part
 * way places nothing. Its own behaviour (a pocket per copy, a full pocket
 * asked about, a retry replayed) was run against Postgres; here, what the
 * server sends it and what it makes of the answer.
 */

let binderCards: Record<string, unknown>[] = [];
const calls: { fn: string; args: Record<string, unknown> }[] = [];
let answer: unknown = null;

function chain(result: () => unknown) {
  const self: Record<string, unknown> = {};
  for (const name of ["select", "order", "in", "limit", "eq", "is", "update"])
    self[name] = () => self;
  self.maybeSingle = async () => result();
  self.then = (resolve: (value: unknown) => unknown) => resolve(result());
  return self;
}

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    from: (table: string) =>
      table === "binders"
        ? chain(() => ({ data: { id: "binder-1", for_trade: false }, error: null }))
        : chain(() => ({ data: binderCards, error: null })),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data: answer, error: null };
    },
  }),
}));

const binder = await import("@/lib/binder/binder");

const CARD_A = "00000000-0000-4000-8000-00000000000a";
const CARD_B = "00000000-0000-4000-8000-00000000000b";

beforeEach(() => {
  binderCards = [];
  calls.length = 0;
  answer = {
    ok: true,
    added: 0,
    merged: 0,
    unchanged: 0,
    displaced: 0,
    skipped: 0,
    occupied: 0,
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("placing scanned pages", () => {
  it("sends every card for its exact pocket in one call, each pocket once", async () => {
    answer = {
      ok: true,
      added: 2,
      merged: 0,
      unchanged: 0,
      displaced: 0,
      skipped: 0,
      occupied: 0,
      first_pocket: 27,
    };
    const result = await binder.placeBinderPages("p1", "Zach", "binder-1", [
      { pocket: 31, cardId: CARD_B, printingId: null },
      { pocket: 27, cardId: CARD_A, printingId: null },
      { pocket: 31, cardId: CARD_A, printingId: null },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe("binder_place_scanned");
    expect(calls[0].args).toMatchObject({
      p_binder: "binder-1",
      p_cards: [
        { pocket: 27, card_id: CARD_A, printing_id: null },
        { pocket: 31, card_id: CARD_B, printing_id: null },
      ],
      p_mode: "skip",
      p_key: null,
    });
    expect(result).toMatchObject({ ok: true, added: 2, firstPocket: 27 });
  });

  it("gives two copies of one card a pocket each", async () => {
    await binder.placeBinderPages("p1", "Zach", "binder-1", [
      { pocket: 9, cardId: CARD_A, printingId: null },
      { pocket: 10, cardId: CARD_A, printingId: null },
    ]);
    expect(calls[0].args.p_cards).toEqual([
      { pocket: 9, card_id: CARD_A, printing_id: null },
      { pocket: 10, card_id: CARD_A, printing_id: null },
    ]);
  });

  it("asks before writing over a full pocket, and says which", async () => {
    answer = { ok: false, reason: "occupied", pockets: [27] };
    const result = await binder.placeBinderPages(
      "p1",
      "Zach",
      "binder-1",
      [{ pocket: 27, cardId: CARD_A, printingId: null }],
      { mode: "ask", key: "batch:abc:ask" },
    );
    expect(calls[0].args).toMatchObject({ p_mode: "ask", p_key: "batch:abc:ask" });
    expect(result).toEqual({ ok: false, reason: "occupied", pockets: [27] });
  });

  it("says what moved aside and what was already there", async () => {
    answer = {
      ok: true,
      added: 1,
      merged: 0,
      unchanged: 2,
      displaced: 1,
      skipped: 0,
      occupied: 0,
    };
    const result = await binder.placeBinderPages(
      "p1",
      "Zach",
      "binder-1",
      [{ pocket: 27, cardId: CARD_A, printingId: null }],
      { mode: "replace" },
    );
    expect(result).toMatchObject({ ok: true, added: 1, displaced: 1, unchanged: 2 });
    expect(
      pagesPlacedLine({
        added: 1,
        merged: 0,
        occupied: 0,
        skipped: 0,
        displaced: 1,
        unchanged: 2,
      }),
    ).toBe(
      "Placed 1 card. 2 were already in their pockets. The card that was in its pocket moved to the back of the binder.",
    );
  });

  it("is one transaction that never merges copies and replays a retry", () => {
    const sql = read("supabase/migrations/20261120090000_scanner_v2.sql");
    const fn = sql.slice(
      sql.indexOf("create or replace function public.binder_place_scanned("),
    );
    expect(fn).toContain("for update;");
    expect(fn).toContain("from public.binder_scan_placements");
    expect(fn).toContain("'replayed', true");
    expect(fn).toContain("v_unchanged := v_unchanged + 1;");
    expect(fn).not.toMatch(/set quantity = least\(99, quantity \+ 1\)/);
    expect(fn).toContain("'reason', 'occupied'");
  });
});

/* ---- Reading a page, with the network faked ---------------------------- */

vi.mock("@/lib/cards/search", () => ({
  cardResultsByIds: async (ids: string[]) =>
    ids.map((id) => ({ id, canonicalCardNumber: "OP01-025", printings: [] })),
  searchCards: async () => [],
}));

describe("reading a page", () => {
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const who = { playerId: "page-player", userId: "user-1" };
  const prompts: string[] = [];

  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    prompts.length = 0;
    binderCards = [{ id: "card-zoro", canonical_card_number: "OP01-025" }];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as {
          messages: { content: { type: string; text?: string }[] }[];
        };
        prompts.push(body.messages[0].content[1].text ?? "");
        return new Response(
          JSON.stringify({
            id: "msg",
            type: "message",
            role: "assistant",
            model: "test",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  layout: "one-card",
                  found: true,
                  game: "one-piece",
                  name: "Roronoa Zoro",
                  englishName: "Roronoa Zoro",
                  number: "OP01-025",
                  setCode: "OP01",
                }),
              },
            ],
            stop_reason: "end_turn",
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reads only the pockets that were sent, as pockets, and leaves the rest empty", async () => {
    const scan = await import("@/lib/cards/scan");
    const cells = Array.from({ length: 9 }, (_, slot) => (slot < 2 ? JPEG : null));
    const outcome = await scan.scanPage(who, cells);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.pockets.map((pocket) => pocket.state)).toEqual([
      "found",
      "found",
      "empty",
      "empty",
      "empty",
      "empty",
      "empty",
      "empty",
      "empty",
    ]);
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain("Read only the card in the middle");
  });

  it("refuses a page that is not nine pockets", async () => {
    const scan = await import("@/lib/cards/scan");
    expect(await scan.scanPage(who, [JPEG])).toEqual({ ok: false, reason: "no-card" });
  });
});

describe("the doors", () => {
  it("lets the app send a photo in one request, and keeps the pieces as the fallback", () => {
    const route = read("src/app/api/v1/cards/scan/route.ts");
    for (const action of [
      "read-direct",
      "read-page-direct",
      "read-page",
      "begin",
      "chunk",
    ]) {
      expect(route).toContain(`z.literal("${action}")`);
    }
    expect(read("src/app/api/v1/avatar/route.ts")).toContain('z.literal("direct")');
  });

  it("places pages through the same check on the website and in the app", () => {
    expect(read("src/lib/binder/actions.ts")).toContain(
      "binderPagesSchema.safeParse(input)",
    );
    expect(read("src/app/api/v1/binders/[binderId]/cards/route.ts")).toContain(
      "binderPagesSchema.safeParse(body)",
    );
  });

  it("sends a long queue from the app a few pages at a time, and adds the counts up", () => {
    const api = read("mobile/src/api.ts");
    const place = api.slice(api.indexOf("export async function placePageQueue("));
    expect(place).toContain("const parts = placementParts(placements);");
    expect(place).toContain("pagesPlacedLine(totals)");
    expect(read("src/app/api/v1/binders/[binderId]/cards/route.ts")).toContain(
      "occupied: result.occupied",
    );
  });

  it("counts a page as nine reads against the ceilings", () => {
    const scan = read("src/lib/cards/scan.ts");
    expect(scan).toContain("allowReads(who.playerId, reads)");
    expect(scan).toContain("allowReads(who.playerId, 1)");
  });
});
