import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Binder pages read in the background: one look, the catalogue, a cheap
 * tiebreak. The founder
 * (2026-10-09): "the full binder page scans should be fully agentic... and
 * then they'll get a notification once it's ready." Pro only, twenty pages
 * a day, and nothing placed before the player checks it.
 */

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const card = (id: string, number: string) => ({
  id,
  game: "one-piece",
  exactName: `Card ${id}`,
  canonicalCardNumber: number,
  cardType: null,
  colors: [],
  traits: [],
  cost: null,
  power: null,
  counter: null,
  life: null,
  rarity: null,
  effectText: null,
  triggerText: null,
  printings: [
    {
      id: `${id}-p1`,
      setCode: "OP01",
      setName: "Romance Dawn",
      printingLabel: null,
      variantType: null,
      rarity: null,
      printingName: null,
      isPromo: false,
      imageUrl: null as string | null,
    },
  ],
});

const findScanned = vi.fn();
const suggestByTraits = vi.fn();

vi.mock("@/lib/cards/scan", () => ({
  findScanned: (read: unknown, limit: unknown, traits: unknown) =>
    findScanned(read, limit, traits),
  suggestByTraits: (game: unknown, traits: unknown) => suggestByTraits(game, traits),
  scannerKey: () => "test-key",
  withoutKeys: (text: string) => text,
}));

const reader = await import("@/lib/cards/page-reader");
const { narrowByTraits } = await import("@/lib/cards/scan-rules");

const JPEG = {
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
  mediaType: "image/jpeg" as const,
};
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

type Sent = {
  model: string;
  max_tokens: number;
  output_config: { effort: string; format?: unknown };
  messages: {
    content: { type: string; text?: string; source?: { media_type: string } }[];
  }[];
};
const sent: Sent[] = [];
let replies: unknown[] = [];
const pictures: string[] = [];

function reply(
  body: unknown,
  stop = "end_turn",
  usage = { input_tokens: 10_000, output_tokens: 2_000 },
) {
  return {
    id: "msg",
    type: "message",
    role: "assistant",
    model: "test",
    content: [{ type: "text", text: JSON.stringify(body) }],
    stop_reason: stop,
    stop_sequence: null,
    usage,
  };
}

const pocket = (slot: number, more: Record<string, unknown> = {}) => ({
  slot,
  state: "card",
  game: "one-piece",
  name: "Roronoa Zoro",
  englishName: "Roronoa Zoro",
  number: "",
  setCode: "",
  colors: ["purple"],
  power: 6000,
  cost: 5,
  cardType: "character",
  altArt: false,
  sure: true,
  note: "",
  ...more,
});

const empty = (slot: number) => ({ ...pocket(slot), state: "empty" });

const withArt = (id: string, number: string, urls: string[]) => {
  const base = card(id, number);
  return {
    ...base,
    printings: urls.map((url, index) => ({
      ...base.printings[0],
      id: `${id}-p${index + 1}`,
      imageUrl: url,
    })),
  };
};

beforeEach(() => {
  sent.length = 0;
  pictures.length = 0;
  replies = [];
  findScanned.mockReset();
  suggestByTraits.mockReset();
  findScanned.mockResolvedValue([]);
  suggestByTraits.mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init: RequestInit) => {
      const href = String(url);
      if (href.startsWith("https://optcgapi.com/")) {
        pictures.push(href);
        return new Response(href.endsWith(".html") ? "<html></html>" : PNG, {
          headers: { "content-type": "image/jpeg" },
        });
      }
      sent.push(JSON.parse(String(init.body)) as Sent);
      return new Response(JSON.stringify(replies.shift() ?? reply({ pockets: [] })), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const page = (pockets: (typeof JPEG | null)[]) =>
  reader.readCards({ mode: "page", page: JPEG, pockets, games: ["one-piece"] });

describe("one look, then the catalogue", () => {
  it("reads a whole page in one call and finds each card in the catalogue by what it saw", async () => {
    const zoro = card("zoro", "OP06-118");
    findScanned.mockResolvedValue([{ card: zoro, printingId: null }]);
    replies = [
      reply({
        pockets: [pocket(0), ...Array.from({ length: 8 }, (_, i) => empty(i + 1))],
      }),
    ];

    const outcome = await page([JPEG, null, null, null, null, null, null, null, null]);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(sent).toHaveLength(1);
    expect(sent[0].model).toBe("claude-sonnet-5-5");
    expect(sent[0].output_config.effort).toBe("medium");
    expect(sent[0].output_config.format).toBeTruthy();
    /* The page and the one close-up, sent once. */
    expect(sent[0].messages[0].content.filter((b) => b.type === "image")).toHaveLength(
      2,
    );
    expect(findScanned).toHaveBeenCalledTimes(1);
    expect(findScanned.mock.calls[0][2]).toEqual({
      colors: ["purple"],
      power: 6000,
      cost: 5,
      cardType: "character",
    });
    expect(outcome.pockets[0]).toMatchObject({ state: "found", sure: true });
    expect(outcome.pockets[1]).toEqual({ slot: 1, state: "empty" });
  });

  it("can be switched to another model from a setting", async () => {
    vi.stubEnv("SCAN_AGENT_MODEL", "claude-opus-5-5");
    replies = [reply({ pockets: [empty(0)] })];
    await reader.readCards({ mode: "card", page: null, pockets: [JPEG], games: [] });
    expect(sent[0].model).toBe("claude-opus-5-5");
  });

  it("gives up on a refusal or an unreadable answer rather than guessing", async () => {
    replies = [reply({}, "refusal")];
    expect(
      await reader.readCards({ mode: "card", page: null, pockets: [JPEG], games: [] }),
    ).toEqual({ ok: false, reason: "unavailable" });
  });

  it("marks a slot it never answered as unread, never guessed", async () => {
    replies = [reply({ pockets: [empty(0)] })];
    const outcome = await page(Array(9).fill(null));
    expect(outcome.ok && outcome.pockets[4]).toMatchObject({
      state: "unread",
      read: null,
    });
  });
});

describe("tolerant of how the reader writes a game", () => {
  it("maps its words to ours, and anything else to other", () => {
    expect(reader.gameOf("one-piece")).toBe("one-piece");
    expect(reader.gameOf("One Piece")).toBe("one-piece");
    expect(reader.gameOf("Magic: The Gathering")).toBe("mtg");
    expect(reader.gameOf("Pokémon")).toBe("pokemon");
    expect(reader.gameOf("Yu-Gi-Oh!")).toBe("other");
  });

  it("understands the long names a model actually writes", () => {
    /* The founder's first page: every pocket unread, all of them "One
       Piece Card Game" or the like, filed as a game we do not carry. */
    expect(reader.gameOf("One Piece Card Game")).toBe("one-piece");
    expect(reader.gameOf("One Piece TCG")).toBe("one-piece");
    expect(reader.gameOf("OPTCG")).toBe("one-piece");
    expect(reader.gameOf("Pokémon Trading Card Game")).toBe("pokemon");
    expect(reader.gameOf("Disney Lorcana TCG")).toBe("lorcana");
    expect(reader.gameOf("Flesh and Blood")).toBe("flesh-and-blood");
    expect(reader.gameOf("Riftbound: League of Legends TCG")).toBe("riftbound");
  });

  it("tells the reader the exact words for each game", () => {
    expect(read("src/lib/cards/page-reader.ts")).toContain(
      "game, exactly one of one-piece, riftbound, lorcana, mtg (Magic: The Gathering), pokemon, flesh-and-blood, or other",
    );
  });

  it("looks a card up in the player's own games when the reader named none we carry", async () => {
    findScanned.mockImplementation(async (read: { game: string }) =>
      read.game === "one-piece"
        ? [{ card: card("loki", "OP13-100"), printingId: null }]
        : [],
    );
    replies = [reply({ pockets: [pocket(0, { game: "a card game", name: "Loki" })] })];
    const outcome = await reader.readCards({
      mode: "card",
      page: null,
      pockets: [JPEG],
      games: ["pokemon", "one-piece"],
    });
    expect(
      findScanned.mock.calls.map((call) => (call[0] as { game: string }).game),
    ).toEqual(["pokemon", "one-piece"]);
    expect(outcome.ok && outcome.pockets[0]).toMatchObject({ state: "found" });
    expect(reader.gamesToTry("other", [])).toHaveLength(6);
    expect(reader.gamesToTry("mtg", ["one-piece"])).toEqual(["mtg"]);
  });

  it("does not fail a page over one odd word", async () => {
    findScanned.mockResolvedValue([
      { card: card("zoro", "OP06-118"), printingId: null },
    ]);
    replies = [reply({ pockets: [pocket(0, { game: "One Piece", state: "Card" })] })];
    const outcome = await reader.readCards({
      mode: "card",
      page: null,
      pockets: [JPEG],
      games: [],
    });
    expect(outcome.ok && outcome.pockets[0]).toMatchObject({ state: "found" });
  });
});

describe("the tiebreak", () => {
  it("sends every unsettled pocket to the cheapest model in one call, and puts its pick first", async () => {
    const a = withArt("a", "OP01-025", ["https://optcgapi.com/a.png"]);
    const b = withArt("b", "OP06-118", ["https://optcgapi.com/b.png"]);
    findScanned.mockResolvedValue([
      { card: a, printingId: null },
      { card: b, printingId: null },
    ]);
    replies = [
      reply({
        pockets: [
          pocket(0),
          pocket(1),
          ...Array.from({ length: 7 }, (_, i) => empty(i + 2)),
        ],
      }),
      reply(
        {
          picks: [
            { pocket: 0, choice: "B" },
            { pocket: 1, choice: "none" },
          ],
        },
        "end_turn",
        {
          input_tokens: 5000,
          output_tokens: 200,
        },
      ),
    ];

    const outcome = await page([JPEG, JPEG, null, null, null, null, null, null, null]);

    expect(sent).toHaveLength(2);
    expect(sent[1].model).toBe("claude-haiku-5-5");
    expect(sent[1].output_config.effort).toBe("low");
    /* Two pockets, each its photo and two pictures. */
    expect(sent[1].messages[0].content.filter((b) => b.type === "image")).toHaveLength(
      6,
    );
    /* The picture's type comes from its bytes, not the host's label. */
    const art = sent[1].messages[0].content.filter((b) => b.type === "image")[1];
    expect(art.source?.media_type).toBe("image/png");
    if (!outcome.ok) throw new Error("read failed");
    expect(outcome.pockets[0]).toMatchObject({ state: "found", sure: true });
    expect(
      outcome.pockets[0].state === "found" && outcome.pockets[0].matches[0].card.id,
    ).toBe("b");
    /* "none" leaves the player to choose, flagged. */
    expect(outcome.pockets[1]).toMatchObject({ state: "found", sure: false });
  });

  it("asks nothing when the catalogue settled every pocket", async () => {
    findScanned.mockResolvedValue([
      { card: card("zoro", "OP06-118"), printingId: null },
    ]);
    replies = [reply({ pockets: [pocket(0, { number: "OP06-118" })] })];
    await reader.readCards({ mode: "card", page: null, pockets: [JPEG], games: [] });
    expect(sent).toHaveLength(1);
  });

  it("chooses between a card's printings when the reader saw an alternate art", () => {
    const zoro = withArt("zoro", "OP06-118", [
      "https://optcgapi.com/regular.png",
      "https://optcgapi.com/alt.png",
    ]);
    const options = reader.tiebreakOptions([{ card: zoro, printingId: null }], {
      altArt: true,
      number: "",
      setCode: "",
    });
    expect(options.map((option) => option.printingId)).toEqual(["zoro-p1", "zoro-p2"]);
    expect(
      reader.tiebreakOptions([{ card: zoro, printingId: null }], {
        altArt: false,
        number: "",
        setCode: "",
      }),
    ).toEqual([]);
  });

  it("is skipped once a page has spent its cap", async () => {
    const a = withArt("a", "OP01-025", ["https://optcgapi.com/a.png"]);
    const b = withArt("b", "OP06-118", ["https://optcgapi.com/b.png"]);
    findScanned.mockResolvedValue([
      { card: a, printingId: null },
      { card: b, printingId: null },
    ]);
    /* A look that cost more than the cap on its own. */
    replies = [
      reply({ pockets: [pocket(0)] }, "end_turn", {
        input_tokens: 10_000,
        output_tokens: 20_000,
      }),
    ];
    const outcome = await reader.readCards({
      mode: "card",
      page: null,
      pockets: [JPEG],
      games: [],
    });
    expect(sent).toHaveLength(1);
    expect(outcome.ok && outcome.pockets[0]).toMatchObject({
      state: "found",
      sure: false,
    });
  });
});

describe("might be one of these", () => {
  it("offers the catalogue's closest cards by traits when the name found nothing", async () => {
    const guess = { card: card("zoro", "OP06-118"), printingId: null };
    suggestByTraits.mockResolvedValue([guess]);
    replies = [
      reply({ pockets: [pocket(0, { name: "Zorro", englishName: "Zorro" })] }),
    ];
    const outcome = await reader.readCards({
      mode: "card",
      page: null,
      pockets: [JPEG],
      games: [],
    });
    expect(outcome.ok && outcome.pockets[0]).toMatchObject({
      state: "unread",
      suggestions: [guess],
    });
    expect(suggestByTraits).toHaveBeenCalledWith("one-piece", {
      colors: ["purple"],
      power: 6000,
      cost: 5,
      cardType: "character",
    });
  });
});

describe("what a read costs", () => {
  it("prices each model's tokens, an unknown model as the dearest", () => {
    const usage = { input_tokens: 1_000_000, output_tokens: 100_000 };
    expect(reader.costCents("claude-sonnet-5-5", usage)).toBeCloseTo(300);
    expect(reader.costCents("claude-haiku-5-5", usage)).toBeCloseTo(15);
    expect(reader.costCents("something-new", usage)).toBeCloseTo(1500);
  });

  it("logs every read's cost and keeps a cap on the tiebreak", () => {
    const source = read("src/lib/cards/page-reader.ts");
    expect(source).toContain('console.info("Page reader cost"');
    expect(source).toMatch(/cents < PAGE_CAP_CENTS\s*\?\s*await tiebreak\(asks\)/);
    expect(source).toContain("export const PAGE_CAP_CENTS = 15;");
  });

  it("is no longer an agent loop", () => {
    expect(existsSync(join(root, "src/lib/cards/page-agent.ts"))).toBe(false);
    expect(read("src/lib/cards/page-reader.ts")).not.toContain("tool_use");
  });
});

describe("narrowing by what the reader saw", () => {
  const cards = [
    { id: "red", colors: ["Red"], power: 5000, cost: 4, cardType: "character" },
    { id: "purple", colors: ["Purple"], power: 6000, cost: 5, cardType: "character" },
    {
      id: "purple-leader",
      colors: ["Purple"],
      power: 5000,
      cost: null,
      cardType: "leader",
    },
  ];
  const traits = { colors: ["purple"], power: 6000, cost: 5, cardType: "character" };

  it("keeps the card every trait points at, colours in any case", () => {
    expect(narrowByTraits(cards, traits).map((c) => c.id)).toEqual(["purple"]);
  });

  it("skips a trait that would rule out everything, so a misjudged colour never hides the card", () => {
    expect(
      narrowByTraits(cards, { ...traits, colors: ["green"] }).map((c) => c.id),
    ).toEqual(["purple"]);
    expect(
      narrowByTraits(cards, { colors: [], power: null, cost: null, cardType: "" }),
    ).toHaveLength(3);
  });

  it("lets a number read right outrank the traits", () => {
    expect(read("src/lib/cards/scan.ts")).toMatch(
      /traits && !numbered \? narrowByTraits\(candidates, traits\) : candidates;/,
    );
  });
});

describe("recognising like a collector", () => {
  const source = read("src/lib/cards/page-reader.ts");
  it("recognises from the artwork and its own knowledge, not only from text", () => {
    expect(source).not.toContain("Never name a card from memory");
    expect(source).toContain("Use your own knowledge of the games freely");
    expect(source).toContain("most cards can be named from the artwork alone");
  });

  it("describes, and lets the catalogue and the pictures decide", () => {
    expect(source).not.toContain("card_id");
    expect(source).toContain("findScanned(readOf(named), 6, traitsOf(named))");
  });

  it("trusts the whole page over a close-up cut off-centre", () => {
    expect(source).toContain("trust the whole page and the card's place in the grid");
  });
});

describe("the background queue", () => {
  const jobs = read("src/lib/cards/page-jobs.ts");

  it("is Pro (or admin) only, twenty pages a day, and checks ownership before storing", () => {
    const send = jobs.slice(jobs.indexOf("export async function sendPage("));
    const gate = send.indexOf('(await scannerAccess(who)) !== "on"');
    const owner = send.indexOf("(await binderOwner(input.binderId)) !== who.playerId");
    const store = send.indexOf(".upload(");
    expect(gate).toBeGreaterThan(-1);
    expect(owner).toBeGreaterThan(gate);
    expect(store).toBeGreaterThan(owner);
    expect(send).toContain('return { ok: false, reason: "daily-pages" }');
    expect(read("src/lib/cards/scan-rules.ts")).toContain(
      "export const PAGES_PER_DAY = 20;",
    );
  });

  it("reads after the response, once per page, and retries a dead run at most three times", () => {
    expect(jobs).toContain('readCards({ mode: "page", page, pockets, games })');
    expect(jobs).toContain("afterResponse(() => readPage(row.id));");
    expect(jobs).toContain('.eq("attempts", row.attempts)');
    expect(jobs).toContain("const MAX_ATTEMPTS = 3;");
  });

  it("announces a queue once, when every page is done", () => {
    const announce = jobs.slice(jobs.indexOf("async function announceIfDone("));
    expect(announce).toContain('.is("notified_at", null)');
    expect(announce).toContain("notifyPagesReady(");
  });

  it("keeps the daily sweep short: it marks lost pages failed, it never reads", () => {
    const sweep = jobs.slice(jobs.indexOf("export async function sweepPageScans("));
    expect(sweep).not.toContain("readPage(");
    expect(read("vercel.json")).toContain("/api/cron/page-scans");
  });

  it("removes the photos when a queue is placed or thrown away", () => {
    const close = jobs.slice(jobs.indexOf("async function close("));
    expect(close).toContain(".remove(paths)");
    expect(jobs).toContain("if (result.ok && last) await close(who, batchId);");
  });

  it("gives the long reads the time they need", () => {
    expect(read("src/app/api/v1/scans/pages/route.ts")).toContain(
      "export const maxDuration = 300;",
    );
    expect(read("src/app/profile/binders/[binderId]/page.tsx")).toContain(
      "export const maxDuration = 300;",
    );
  });
});

describe("the notice and the table", () => {
  it("says ready, or says what could not be read", async () => {
    const { pagesReadyCopy } = await import("@/lib/notifications/notify");
    expect(pagesReadyCopy(5, "Trade binder")).toEqual({
      title: "Your 5 pages are ready to check",
      body: "Check them and add them to Trade binder.",
    });
    expect(pagesReadyCopy(1, "Trade binder", 1).body).toContain("1 couldn't be read");
    expect(pagesReadyCopy(0, "Trade binder", 2).title).toBe(
      "Your pages couldn't be read",
    );
  });

  it("keeps every kind of notice it had, and adds pages-ready", () => {
    const migration = read("supabase/migrations/20261112090000_page_scans.sql");
    for (const kind of [
      "offer-received",
      "trade-confirmed",
      "early-board",
      "board-open",
      "new-follower",
      "room-flare",
      "message-received",
      "nearby-match",
      "post-comment",
      "store-post",
      "night-match",
      "night-reminder",
      "pages-ready",
    ]) {
      expect(migration).toContain(`'${kind}'`);
    }
    expect(migration).toContain("values ('scans', 'scans', false");
    expect(migration).toContain(
      "alter table public.page_scans enable row level security;",
    );
  });
});

describe("the push", () => {
  it("is not silenced by a group switch: the player asked for it", () => {
    const notify = read("src/lib/notifications/notify.ts");
    expect(notify).toContain('if (kind !== "pages-ready") {');
  });
});

describe("pieces", () => {
  it("allow a photo up to the scanner's ceiling in the app's 6000-character pieces", () => {
    const route = read("src/app/api/v1/cards/scan/route.ts");
    expect(route).toContain(
      "const CHUNK_MAX_COUNT = Math.ceil((SCAN_MAX_BYTES * 4) / 3 / APP_PIECE_CHARS);",
    );
    expect(read("mobile/src/api.ts")).toContain("const CHUNK = 6000;");
  });
});
