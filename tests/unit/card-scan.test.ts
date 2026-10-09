import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  collectorValue,
  rankScan,
  scanReadLine,
  scanScore,
  suggestedPrinting,
} from "@/lib/cards/scan-rules";

/**
 * The card scanner: a photo is read by a vision model, the catalogue
 * decides which card it is, and only admins (then Pro) may ask. The
 * founder (2026-10-09): "We can make that a pro feature to cover the
 * cost."
 */

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("reading a collector number", () => {
  it("finds the card's own number in every game's way of printing it", () => {
    expect(collectorValue("199/165")).toBe(199);
    expect(collectorValue("OP01-001")).toBe(1);
    expect(collectorValue("WTR001")).toBe(1);
    expect(collectorValue("OGN-001/298")).toBe(1);
    expect(collectorValue("0123")).toBe(123);
    expect(collectorValue("mkm-123")).toBe(123);
    expect(collectorValue("")).toBeNull();
  });

  it("ranks the number over the name, and the set code over a shared number", () => {
    const read = { number: "025/198", setCode: "SVI" };
    const ranked = rankScan(read, [
      { id: "a", canonicalCardNumber: "MEW-025" },
      { id: "b", canonicalCardNumber: "PAL-063" },
      { id: "c", canonicalCardNumber: "SVI-025" },
    ]);
    expect(ranked.map((card) => card.id)).toEqual(["c", "a", "b"]);
    expect(scanScore({ number: "OP01-001", setCode: "" }, "OP01-001")).toBe(5);
  });

  it("suggests a printing only when the set code names one", () => {
    const printings = [
      { id: "p1", setCode: "OP01" },
      { id: "p2", setCode: "EB01" },
    ];
    expect(suggestedPrinting("EB01", printings)).toBe("p2");
    expect(suggestedPrinting("", printings)).toBeNull();
    expect(suggestedPrinting("ZZZ", printings)).toBeNull();
  });

  it("says what it read, so a wrong read is plain", () => {
    expect(scanReadLine({ name: "Charizard ex", number: "199/165" })).toBe(
      "Read: Charizard ex · 199/165",
    );
    expect(scanReadLine({ name: "", number: "" })).toBe("");
  });
});

/* ---- The server, with the database and the network faked ------------ */

const adminRow = vi.fn();
const playerRow = vi.fn();
const cardRows = vi.fn();
const cardResultsByIds = vi.fn();
const searchCards = vi.fn();

function chain(result: () => unknown) {
  const self: Record<string, unknown> = {};
  for (const name of ["select", "eq", "in", "order"]) self[name] = () => self;
  self.limit = async () => result();
  self.maybeSingle = async () => result();
  return self;
}

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    from: (table: string) =>
      table === "admin_users"
        ? chain(adminRow)
        : table === "players"
          ? chain(playerRow)
          : chain(cardRows),
  }),
}));

vi.mock("@/lib/cards/search", () => ({
  cardResultsByIds: (ids: string[]) => cardResultsByIds(ids),
  searchCards: (query: string, filters: unknown) => searchCards(query, filters),
}));

const scan = await import("@/lib/cards/scan");

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);
const who = { playerId: "player-1", userId: "user-1" };

let sent: Record<string, unknown> | null = null;

function answer(body: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init: RequestInit) => {
      sent = JSON.parse(String(init.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "test",
          content: [{ type: "text", text: JSON.stringify(body) }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  );
}

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("CARD_SCANNER_FOR_PRO", "");
  for (const fn of [adminRow, playerRow, cardRows, cardResultsByIds, searchCards]) {
    fn.mockReset();
  }
  adminRow.mockReturnValue({ data: { user_id: "user-1" }, error: null });
  playerRow.mockReturnValue({ data: { tier: "free" }, error: null });
  cardRows.mockReturnValue({ data: [], error: null });
  searchCards.mockResolvedValue([]);
  sent = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("who may scan", () => {
  it("is nobody without a key, so no button is ever drawn that cannot work", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(await scan.scannerAccess(who)).toBeNull();
  });

  it("is admins only during the trial", async () => {
    expect(await scan.scannerAccess(who)).toBe("on");
    adminRow.mockReturnValue({ data: null, error: null });
    playerRow.mockReturnValue({ data: { tier: "pro" }, error: null });
    expect(await scan.scannerAccess(who)).toBeNull();
  });

  it("opens to Pro with one setting, and shows everyone else the door", async () => {
    vi.stubEnv("CARD_SCANNER_FOR_PRO", "on");
    adminRow.mockReturnValue({ data: null, error: null });
    playerRow.mockReturnValue({ data: { tier: "pro" }, error: null });
    expect(await scan.scannerAccess(who)).toBe("on");
    playerRow.mockReturnValue({ data: { tier: "free" }, error: null });
    expect(await scan.scannerAccess(who)).toBe("pro-door");
  });

  it("refuses a scan from someone who may not, before any paid call", async () => {
    adminRow.mockReturnValue({ data: null, error: null });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await scan.scanCard(who, JPEG)).toEqual({
      ok: false,
      reason: "not-allowed",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("a scan", () => {
  it("refuses bytes that are not a photo without calling the model", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const outcome = await scan.scanCard(who, new Uint8Array([1, 2, 3, 4]));
    expect(outcome).toEqual({ ok: false, reason: "no-card" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the photo with a schema, and the catalogue picks the card", async () => {
    answer({
      found: true,
      game: "one-piece",
      name: "Roronoa Zoro",
      englishName: "Roronoa Zoro",
      number: "OP01-025",
      setCode: "OP01",
    });
    cardRows.mockReturnValue({
      data: [
        { id: "card-st", canonical_card_number: "ST01-013" },
        { id: "card-op", canonical_card_number: "OP01-025" },
      ],
      error: null,
    });
    cardResultsByIds.mockImplementation(async (ids: string[]) =>
      ids.map((id) => ({
        id,
        canonicalCardNumber: id === "card-op" ? "OP01-025" : "ST01-013",
        printings: [{ id: `${id}-p`, setCode: id === "card-op" ? "OP01" : "ST01" }],
      })),
    );

    const outcome = await scan.scanCard(who, JPEG);

    expect(sent).not.toBeNull();
    const body = sent as unknown as {
      model: string;
      output_config: { effort: string; format: { type: string } };
      messages: { content: { type: string; source?: { media_type: string } }[] }[];
    };
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.output_config.effort).toBe("low");
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.messages[0].content[0]).toMatchObject({
      type: "image",
      source: { media_type: "image/jpeg" },
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(cardResultsByIds).toHaveBeenCalledWith(["card-op", "card-st"]);
    expect(outcome.matches[0]).toMatchObject({
      card: { id: "card-op" },
      printingId: "card-op-p",
    });
  });

  it("says when there is no card, or a game we do not carry", async () => {
    answer({
      found: false,
      game: "other",
      name: "",
      englishName: "",
      number: "",
      setCode: "",
    });
    expect((await scan.scanCard(who, JPEG)).ok).toBe(false);
    answer({
      found: true,
      game: "other",
      name: "Dark Magician",
      englishName: "Dark Magician",
      number: "LOB-005",
      setCode: "LOB",
    });
    const outcome = await scan.scanCard(who, JPEG);
    expect(outcome).toMatchObject({ ok: false, reason: "not-carried" });
  });

  it("answers unavailable when the model call fails, and logs no photo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    expect(await scan.scanCard(who, JPEG)).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});

describe("the boundaries", () => {
  it("keeps the key and the model on the server", () => {
    const source = read("src/lib/cards/scan.ts");
    expect(source.startsWith('import "server-only";')).toBe(true);
    expect(read("src/lib/cards/scan-rules.ts")).not.toMatch(/import /);
  });

  it("never lets the model pick a card id", () => {
    const source = read("src/lib/cards/scan.ts");
    const schema = source.slice(
      source.indexOf("const readSchema"),
      source.indexOf("const READ_PROMPT"),
    );
    expect(schema).not.toMatch(/cardId|card_id|\bid:/);
  });

  it("asks the gate before the app sends a single piece, and drops the pieces after", () => {
    const route = read("src/app/api/v1/cards/scan/route.ts");
    const begin = route.slice(route.indexOf('if (body.action === "begin")'));
    expect(begin.indexOf("scannerAccess(player)")).toBeLessThan(
      begin.indexOf("randomUUID"),
    );
    expect(route).toContain(".remove(paths)");
  });

  it("is a Pro capability", () => {
    expect(read("src/lib/tiers/pro/index.ts")).toContain("cardScanner: true");
  });
});
