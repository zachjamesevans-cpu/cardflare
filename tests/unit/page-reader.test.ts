import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The scanner's reader, with both AI providers faked at the network.
 *
 * The founder (2026-10-13): one batched call per provider, "do not allow
 * the AI model to invent card IDs", confidence "from available evidence"
 * rather than the model's say-so, hybrid sending "only uncertain crops" to
 * OpenAI, and "mark uncertain printings and let the user choose". Every
 * case the brief lists is here: all occupied, some empty, duplicates,
 * standard against alternate art, a shared collector number, a card we
 * cannot find, a failed call, one pocket read again, and the cost cap.
 */

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

type Printing = {
  id: string;
  setCode: string | null;
  setName: string | null;
  printingLabel: string | null;
  variantType: string | null;
  rarity: string | null;
  printingName: string | null;
  isPromo: boolean | null;
  imageUrl: string | null;
};

function card(
  id: string,
  name: string,
  number: string,
  printings?: Partial<Printing>[],
) {
  return {
    id,
    game: "one-piece",
    exactName: name,
    canonicalCardNumber: number,
    cardType: "character",
    colors: ["purple"],
    traits: [],
    cost: 5,
    power: 6000,
    counter: null,
    life: null,
    rarity: "SR",
    effectText: null,
    triggerText: null,
    printings: (printings ?? [{}]).map((p, i) => ({
      id: `${id}-p${i + 1}`,
      setCode: "OP06",
      setName: "Wings of the Captain",
      printingLabel: null,
      variantType: null,
      rarity: "SR",
      printingName: null,
      isPromo: false,
      imageUrl: null,
      ...p,
    })),
  };
}

type Card = ReturnType<typeof card>;
let catalogue: Record<string, Card[]> = {};
const findScanned = vi.fn(async (seen: { englishName: string; name: string }) =>
  (catalogue[(seen.englishName || seen.name).toLowerCase()] ?? []).map((c) => ({
    card: c,
    printingId: null,
  })),
);
const suggestByTraits = vi.fn(async () => [] as unknown[]);

vi.mock("@/lib/cards/scan", () => ({
  findScanned: (seen: { englishName: string; name: string }) => findScanned(seen),
  suggestByTraits: () => suggestByTraits(),
  scannerKey: () => (process.env.ANTHROPIC_API_KEY ?? "").trim(),
  withoutKeys: (text: string) => text,
}));

/* The read cache: off unless a test turns it on. */
let databaseOn = false;
let cached: { hash: string; read: unknown }[] = [];
const cacheReads: string[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => databaseOn,
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const self: Record<string, unknown> = {};
      for (const name of ["select", "in", "eq"]) self[name] = () => self;
      self.upsert = async () => ({ error: null });
      self.insert = async () => ({ error: null });
      self.then = (done: (value: unknown) => unknown) => {
        cacheReads.push(table);
        return done({
          data: table === "scan_recognitions" ? cached : null,
          error: null,
        });
      };
      return self;
    },
  }),
}));

const reader = await import("@/lib/cards/page-reader");
const { DEFAULT_PRICES } = await import("@/lib/cards/scan-settings");

const SETTINGS = {
  mode: "anthropic" as const,
  autoAccept: 0.75,
  reviewFloor: 0.35,
  pageCapCents: 5,
  prices: DEFAULT_PRICES,
};

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const crop = (slot: number, more: Record<string, unknown> = {}) => ({
  slot,
  bytes: new Uint8Array([...JPEG, slot]),
  mediaType: "image/jpeg" as const,
  ...more,
});
const page = (more: Record<number, Record<string, unknown>> = {}) =>
  Array.from({ length: 9 }, (_, slot) => crop(slot, more[slot]));

const seen = (slot: number, more: Record<string, unknown> = {}) => ({
  slot,
  state: "card",
  game: "one-piece",
  name: "Roronoa Zoro",
  englishName: "Roronoa Zoro",
  number: "OP06-118",
  setCode: "OP06",
  rarity: "SR",
  colors: ["purple"],
  power: 6000,
  cost: 5,
  cardType: "character",
  altArt: false,
  artNote: "",
  upsideDown: false,
  sure: true,
  note: "",
  ...more,
});

type Sent = {
  model: string;
  max_tokens?: number;
  output_config?: { effort: string };
  messages?: { content: { type: string; text?: string }[] }[];
  input?: {
    content: { type: string; text?: string; detail?: string; image_url?: string }[];
  }[];
  text?: { format: { type: string; strict: boolean; name: string } };
  store?: boolean;
  reasoning?: { effort: string };
};
const anthropicSent: Sent[] = [];
const openaiSent: Sent[] = [];
const openaiHeaders: Record<string, string>[] = [];
/* What each provider answers: a read of the pockets asked, or a picture pick. */
let anthropicRead: (slots: number[]) => unknown[] = () => [];
let anthropicPicks: (
  pockets: number[],
) => { pocket: number; choice: string }[] = () => [];
let anthropicStatus = 200;
let openaiRead: (slots: number[]) => unknown[] = () => [];

const slotsAsked = (texts: string[]) =>
  texts.flatMap((t) => {
    const m = /\(slot (\d)\):/.exec(t);
    return m ? [Number(m[1])] : [];
  });

function anthropicMessage(body: unknown) {
  return {
    id: "msg",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content: [{ type: "text", text: JSON.stringify(body) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 4000, output_tokens: 500 },
  };
}

beforeEach(() => {
  catalogue = {};
  databaseOn = false;
  cached = [];
  cacheReads.length = 0;
  anthropicSent.length = 0;
  openaiSent.length = 0;
  openaiHeaders.length = 0;
  anthropicStatus = 200;
  anthropicRead = (slots) => slots.map((slot) => seen(slot));
  anthropicPicks = () => [];
  openaiRead = (slots) => slots.map((slot) => seen(slot));
  findScanned.mockClear();
  suggestByTraits.mockReset();
  suggestByTraits.mockResolvedValue([]);
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-key");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init: RequestInit) => {
      const href = String(url);
      if (href.startsWith("https://optcgapi.com/")) {
        return new Response(PNG, { headers: { "content-type": "image/png" } });
      }
      const body = JSON.parse(String(init.body)) as Sent;
      if (href.startsWith("https://api.openai.com/")) {
        openaiSent.push(body);
        openaiHeaders.push(Object.fromEntries(new Headers(init.headers).entries()));
        const asked = slotsAsked(
          (body.input?.[0].content ?? []).map((c) => c.text ?? ""),
        );
        return Response.json({
          status: "completed",
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({ pockets: openaiRead(asked) }),
                },
              ],
            },
          ],
          usage: {
            input_tokens: 3000,
            output_tokens: 400,
            input_tokens_details: { cached_tokens: 0 },
          },
        });
      }
      anthropicSent.push(body);
      if (anthropicStatus !== 200) {
        return Response.json(
          { type: "error", error: { type: "api_error", message: "overloaded" } },
          { status: anthropicStatus },
        );
      }
      const texts = (body.messages?.[0].content ?? []).map((c) => c.text ?? "");
      if (texts[0]?.startsWith("Each pocket below")) {
        const pockets = texts.flatMap((t) => {
          const m = /^Pocket (\d):$/.exec(t);
          return m ? [Number(m[1])] : [];
        });
        return Response.json(anthropicMessage({ picks: anthropicPicks(pockets) }));
      }
      return Response.json(
        anthropicMessage({ pockets: anthropicRead(slotsAsked(texts)) }),
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const readPage = (
  crops: ReturnType<typeof crop>[],
  more: Record<string, unknown> = {},
) => reader.readCrops(crops, { games: ["one-piece"], settings: SETTINGS, ...more });

const imagesIn = (sent: Sent) =>
  (sent.messages?.[0].content ?? []).filter((c) => c.type === "image").length;

describe("one batched read, then the catalogue", () => {
  it("reads all nine pockets in one call and places each by its number", async () => {
    catalogue["roronoa zoro"] = [card("zoro", "Roronoa Zoro", "OP06-118")];
    const outcome = await readPage(page());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(anthropicSent).toHaveLength(1);
    expect(anthropicSent[0].model).toBe("claude-haiku-5-5");
    expect(anthropicSent[0].output_config?.effort).toBe("low");
    expect(imagesIn(anthropicSent[0])).toBe(9);
    expect(outcome.pockets.map((p) => p.position)).toEqual([
      "A1",
      "A2",
      "A3",
      "B1",
      "B2",
      "B3",
      "C1",
      "C2",
      "C3",
    ]);
    for (const pocket of outcome.pockets) {
      expect(pocket).toMatchObject({ state: "found", status: "matched", sure: true });
    }
    expect(outcome.run).toMatchObject({ mode: "anthropic", cards: 9, matched: 9 });
    expect(outcome.run.cents).toBeGreaterThan(0);
  });

  it("never sends an empty pocket, and keeps it empty in its place", async () => {
    catalogue["roronoa zoro"] = [card("zoro", "Roronoa Zoro", "OP06-118")];
    const outcome = await readPage(
      page({ 1: { looksEmpty: true }, 5: { looksEmpty: true } }),
    );
    expect(imagesIn(anthropicSent[0])).toBe(7);
    if (!outcome.ok) throw new Error("read failed");
    expect(outcome.pockets[1]).toMatchObject({
      state: "empty",
      status: "empty",
      position: "A2",
    });
    expect(outcome.pockets[5]).toMatchObject({
      state: "empty",
      status: "empty",
      position: "B3",
    });
    expect(outcome.run.empty).toBe(2);
  });

  it("does not call a pocket empty when the photo saw a card there", async () => {
    anthropicRead = (slots) => slots.map((slot) => ({ ...seen(slot), state: "empty" }));
    const outcome = await readPage([crop(0, { cardSeen: true })]);
    expect(outcome.ok && outcome.pockets[0]).toMatchObject({
      state: "unread",
      status: "unrecognized",
    });
  });

  it("keeps duplicates in their own pockets", async () => {
    catalogue["roronoa zoro"] = [card("zoro", "Roronoa Zoro", "OP06-118")];
    const outcome = await readPage([crop(0), crop(4)]);
    if (!outcome.ok) throw new Error("read failed");
    const [a, b] = outcome.pockets;
    expect(a.state === "found" && a.matches[0].card.id).toBe("zoro");
    expect(b.state === "found" && b.matches[0].card.id).toBe("zoro");
    expect([a.position, b.position]).toEqual(["A1", "B2"]);
  });

  it("takes evidence, not the reader's word: sure but unproven is checked", async () => {
    catalogue["roronoa zoro"] = [
      card("zoro-a", "Roronoa Zoro", "OP01-025"),
      card("zoro-b", "Roronoa Zoro", "OP06-118"),
    ];
    anthropicRead = (slots) =>
      slots.map((slot) => seen(slot, { number: "", sure: true }));
    const outcome = await readPage([crop(0)]);
    if (!outcome.ok) throw new Error("read failed");
    expect(outcome.pockets[0]).toMatchObject({
      state: "found",
      status: "ambiguous",
      sure: false,
    });
    expect(outcome.pockets[0].confidence).toBeLessThan(SETTINGS.autoAccept);
  });
});

describe("the exact printing", () => {
  const art = (url: string, more: Partial<Printing> = {}) => ({
    imageUrl: url,
    ...more,
  });
  const zoroWithAlt = () =>
    card("zoro", "Roronoa Zoro", "OP06-118", [
      art("https://optcgapi.com/base.png"),
      art("https://optcgapi.com/alt.png", {
        variantType: "Alternate Art",
        rarity: "SR",
      }),
    ]);

  it("takes an alternate art when the reader and the pictures agree", async () => {
    catalogue["roronoa zoro"] = [zoroWithAlt()];
    anthropicRead = (slots) => slots.map((slot) => seen(slot, { altArt: true }));
    /* The art word puts the alternate first: A. */
    anthropicPicks = (pockets) => pockets.map((pocket) => ({ pocket, choice: "A" }));
    const outcome = await readPage([crop(0)]);
    if (!outcome.ok) throw new Error("read failed");
    expect(anthropicSent).toHaveLength(2);
    expect(outcome.pockets[0]).toMatchObject({
      status: "matched",
      printingUncertain: false,
    });
    expect(
      outcome.pockets[0].state === "found" && outcome.pockets[0].matches[0].printingId,
    ).toBe("zoro-p2");
  });

  it("does not auto-accept an alternate art the reader did not see", async () => {
    catalogue["roronoa zoro"] = [zoroWithAlt()];
    anthropicRead = (slots) => slots.map((slot) => seen(slot, { altArt: false }));
    /* Regular first, so B is the alternate. */
    anthropicPicks = (pockets) => pockets.map((pocket) => ({ pocket, choice: "B" }));
    const outcome = await readPage([crop(0)]);
    if (!outcome.ok) throw new Error("read failed");
    expect(outcome.pockets[0]).toMatchObject({
      status: "ambiguous",
      printingUncertain: true,
    });
    expect(outcome.pockets[0].reasons).toContain("alternate art not confirmed");
  });

  it("does not auto-accept an alternate art when the reader was unsure", async () => {
    catalogue["roronoa zoro"] = [zoroWithAlt()];
    anthropicRead = (slots) =>
      slots.map((slot) => seen(slot, { altArt: true, sure: false }));
    anthropicPicks = (pockets) => pockets.map((pocket) => ({ pocket, choice: "A" }));
    const outcome = await readPage([crop(0)]);
    expect(outcome.ok && outcome.pockets[0]).toMatchObject({ printingUncertain: true });
    expect(outcome.ok && outcome.pockets[0].status).not.toBe("matched");
  });

  it("leaves the printing to the player when there are no pictures to compare", async () => {
    catalogue["roronoa zoro"] = [
      card("zoro", "Roronoa Zoro", "OP06-118", [{}, { variantType: "Alternate Art" }]),
    ];
    const outcome = await readPage([crop(0)]);
    expect(outcome.ok && outcome.pockets[0]).toMatchObject({
      status: "ambiguous",
      printingUncertain: true,
    });
    expect(
      outcome.ok &&
        outcome.pockets[0].state === "found" &&
        outcome.pockets[0].matches[0].printingId,
    ).toBe(null);
  });

  it("settles a collector number two cards share by the pictures", async () => {
    catalogue["monkey.d.luffy"] = [
      card("luffy-a", "Monkey.D.Luffy", "P-001", [art("https://optcgapi.com/a.png")]),
      card("luffy-b", "Monkey.D.Luffy", "P-001", [art("https://optcgapi.com/b.png")]),
    ];
    anthropicRead = (slots) =>
      slots.map((slot) =>
        seen(slot, {
          name: "Monkey.D.Luffy",
          englishName: "Monkey.D.Luffy",
          number: "P-001",
        }),
      );
    anthropicPicks = (pockets) => pockets.map((pocket) => ({ pocket, choice: "B" }));
    const outcome = await readPage([crop(0)]);
    if (!outcome.ok) throw new Error("read failed");
    expect(
      outcome.pockets[0].state === "found" && outcome.pockets[0].matches[0].card.id,
    ).toBe("luffy-b");
    expect(outcome.pockets[0].status).toBe("matched");
  });

  it("keeps a shared number open when the pictures match neither", async () => {
    catalogue["monkey.d.luffy"] = [
      card("luffy-a", "Monkey.D.Luffy", "P-001", [art("https://optcgapi.com/a.png")]),
      card("luffy-b", "Monkey.D.Luffy", "P-001", [art("https://optcgapi.com/b.png")]),
    ];
    anthropicRead = (slots) =>
      slots.map((slot) =>
        seen(slot, {
          name: "Monkey.D.Luffy",
          englishName: "Monkey.D.Luffy",
          number: "P-001",
        }),
      );
    anthropicPicks = (pockets) => pockets.map((pocket) => ({ pocket, choice: "none" }));
    const outcome = await readPage([crop(0)]);
    expect(outcome.ok && outcome.pockets[0].status).not.toBe("matched");
  });
});

describe("a card we cannot find", () => {
  it("is unrecognized, with the catalogue's closest by traits", async () => {
    const guess = { card: card("zoro", "Roronoa Zoro", "OP06-118"), printingId: null };
    suggestByTraits.mockResolvedValue([guess]);
    anthropicRead = (slots) =>
      slots.map((slot) =>
        seen(slot, { name: "Zorro", englishName: "Zorro", number: "" }),
      );
    const outcome = await readPage([crop(0)]);
    expect(outcome.ok && outcome.pockets[0]).toMatchObject({
      state: "unread",
      status: "unrecognized",
      suggestions: [guess],
    });
  });
});

describe("hybrid: OpenAI for the unsure pockets only", () => {
  beforeEach(() => vi.stubEnv("OPENAI_API_KEY", "sk-test-openai-key-1234567890"));

  it("sends only the unsure pocket, at original detail, with a strict schema", async () => {
    catalogue["roronoa zoro"] = [card("zoro", "Roronoa Zoro", "OP06-118")];
    anthropicRead = (slots) =>
      slots.map((slot) =>
        slot === 1
          ? seen(slot, { name: "Zorro", englishName: "Zorro", number: "" })
          : seen(slot),
      );
    const outcome = await readPage([crop(0), crop(1)], { mode: "hybrid" });
    expect(openaiSent).toHaveLength(1);
    const sent = openaiSent[0];
    expect(sent.model).toBe("gpt-5.4-mini");
    expect(sent.store).toBe(false);
    expect(sent.text?.format).toMatchObject({ type: "json_schema", strict: true });
    const images = (sent.input?.[0].content ?? []).filter(
      (c) => c.type === "input_image",
    );
    expect(images).toHaveLength(1);
    expect(images[0].detail).toBe("original");
    expect(openaiHeaders[0].authorization).toBe("Bearer sk-test-openai-key-1234567890");
    if (!outcome.ok) throw new Error("read failed");
    expect(outcome.run.escalated).toEqual([1]);
    expect(outcome.pockets[1]).toMatchObject({ state: "found", status: "matched" });
  });

  it("asks OpenAI nothing when every pocket is sure", async () => {
    catalogue["roronoa zoro"] = [card("zoro", "Roronoa Zoro", "OP06-118")];
    await readPage([crop(0), crop(1)], { mode: "hybrid" });
    expect(openaiSent).toHaveLength(0);
  });

  it("stops asking once the page has spent its cap", async () => {
    anthropicRead = (slots) =>
      slots.map((slot) =>
        seen(slot, { name: "Zorro", englishName: "Zorro", number: "" }),
      );
    await readPage([crop(0)], {
      mode: "hybrid",
      settings: { ...SETTINGS, pageCapCents: 0 },
    });
    expect(openaiSent).toHaveLength(0);
  });

  it("runs on OpenAI alone in OpenAI mode", async () => {
    catalogue["roronoa zoro"] = [card("zoro", "Roronoa Zoro", "OP06-118")];
    const outcome = await readPage([crop(0)], { mode: "openai" });
    expect(openaiSent).toHaveLength(1);
    expect(anthropicSent).toHaveLength(0);
    expect(outcome.ok && outcome.run.calls.map((c) => c.provider)).toEqual(["openai"]);
  });

  it("falls back to the other provider when the first is down", async () => {
    catalogue["roronoa zoro"] = [card("zoro", "Roronoa Zoro", "OP06-118")];
    anthropicStatus = 500;
    const outcome = await readPage([crop(0)]);
    expect(outcome.ok).toBe(true);
    expect(outcome.run.retries).toBe(1);
    expect(openaiSent).toHaveLength(1);
  });

  it("never writes a key into the log", async () => {
    anthropicStatus = 500;
    await readPage([crop(0)]);
    const logged = JSON.stringify([
      ...vi.mocked(console.info).mock.calls,
      ...vi.mocked(console.error).mock.calls,
    ]);
    expect(logged).not.toContain("sk-test-openai-key");
    expect(logged).not.toContain("sk-ant-test-key");
  });
});

describe("a failed read", () => {
  it("says so rather than guessing, when no provider answers", async () => {
    anthropicStatus = 500;
    const outcome = await readPage([crop(0)]);
    expect(outcome).toMatchObject({ ok: false, reason: "unavailable" });
  });

  it("says there is no key rather than crashing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const outcome = await readPage([crop(0)]);
    expect(outcome).toMatchObject({ ok: false, reason: "no-key" });
    expect(anthropicSent).toHaveLength(0);
  });
});

describe("the read cache and one pocket again", () => {
  it("does not pay twice for the same picture", async () => {
    catalogue["roronoa zoro"] = [card("zoro", "Roronoa Zoro", "OP06-118")];
    databaseOn = true;
    const { createHash } = await import("node:crypto");
    const one = crop(0);
    cached = [
      { hash: createHash("sha256").update(one.bytes).digest("hex"), read: seen(0) },
    ];
    const outcome = await readPage([one]);
    expect(anthropicSent).toHaveLength(0);
    expect(outcome.ok && outcome.run.cached).toBe(1);
    expect(outcome.ok && outcome.pockets[0]).toMatchObject({ status: "matched" });
  });

  it("reads one pocket again with more care, and not from the cache", async () => {
    catalogue["roronoa zoro"] = [card("zoro", "Roronoa Zoro", "OP06-118")];
    databaseOn = true;
    const { createHash } = await import("node:crypto");
    const one = crop(4);
    cached = [
      { hash: createHash("sha256").update(one.bytes).digest("hex"), read: seen(4) },
    ];
    const outcome = await readPage([one], { careful: true });
    expect(anthropicSent).toHaveLength(1);
    expect(anthropicSent[0].output_config?.effort).toBe("medium");
    expect(anthropicSent[0].max_tokens).toBe(6000);
    expect(outcome.ok && outcome.pockets[0]).toMatchObject({ slot: 4, position: "B2" });
  });

  it("lets the benchmark pay for every read itself", async () => {
    databaseOn = true;
    await readPage([crop(0)], { cache: false });
    expect(cacheReads).not.toContain("scan_recognitions");
  });
});

describe("a page photographed upside down", () => {
  it("is noticed from the cards, so the job can turn it", async () => {
    anthropicRead = (slots) =>
      slots.map((slot) => seen(slot, { upsideDown: slot !== 0 }));
    const outcome = await readPage([crop(0), crop(1), crop(2)]);
    expect(outcome.run.upsideDown).toBe(true);
    const jobs = read("src/lib/cards/page-jobs.ts");
    expect(jobs).toContain("if (looked.outcome.run.upsideDown && !corners) {");
    expect(jobs).toContain("corners = [p[2], p[3], p[0], p[1]];");
  });
});

describe("how a reader writes a game", () => {
  it("maps its words to ours, and anything else to other", () => {
    expect(reader.gameOf("One Piece Card Game")).toBe("one-piece");
    expect(reader.gameOf("Magic: The Gathering")).toBe("mtg");
    expect(reader.gameOf("Pokémon")).toBe("pokemon");
    expect(reader.gameOf("Yu-Gi-Oh!")).toBe("other");
    expect(reader.gamesToTry("other", [])).toHaveLength(6);
    expect(reader.gamesToTry("mtg", ["one-piece"])).toEqual(["mtg"]);
  });
});
