import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Binder pages read by an agent in the background. The founder
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
      imageUrl: null,
    },
  ],
});

const findScanned = vi.fn();

vi.mock("@/lib/cards/scan", () => ({
  findScanned: (read: unknown) => findScanned(read),
  scannerKey: () => "test-key",
  withoutKeys: (text: string) => text,
}));

const agent = await import("@/lib/cards/page-agent");

const JPEG = {
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
  mediaType: "image/jpeg" as const,
};

const sent: Record<string, unknown>[] = [];
let replies: Record<string, unknown>[] = [];

function message(content: unknown[], stop = "tool_use") {
  return {
    id: "msg",
    type: "message",
    role: "assistant",
    model: "test",
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

beforeEach(() => {
  sent.length = 0;
  findScanned.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init: RequestInit) => {
      sent.push({
        body: JSON.parse(String(init.body)),
        beta: new Headers(init.headers).get("anthropic-beta"),
      });
      const next =
        replies.shift() ?? message([{ type: "text", text: "done" }], "end_turn");
      return new Response(JSON.stringify(next), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the reader's loop", () => {
  it("searches, then answers only with cards its searches returned", async () => {
    findScanned.mockResolvedValue([
      { card: card("zoro", "OP01-025"), printingId: null },
      { card: card("nami", "OP01-016"), printingId: null },
    ]);
    replies = [
      message([
        {
          type: "tool_use",
          id: "t1",
          name: "search_cards",
          input: { query: "Roronoa Zoro", game: "one-piece", number: "OP01-025" },
        },
      ]),
      message([
        {
          type: "tool_use",
          id: "t2",
          name: "submit_page",
          input: {
            pockets: [
              {
                slot: 0,
                state: "card",
                card_id: "zoro",
                printing_id: "zoro-p1",
                alternatives: ["nami", "invented"],
                sure: true,
                note: "number clear",
                read_name: "Roronoa Zoro",
                read_number: "OP01-025",
              },
              {
                slot: 1,
                state: "card",
                card_id: "from-memory",
                printing_id: null,
                alternatives: [],
                sure: true,
                note: "",
                read_name: "Luffy",
                read_number: "",
              },
              {
                slot: 2,
                state: "empty",
                card_id: null,
                printing_id: null,
                alternatives: [],
                sure: true,
                note: "",
                read_name: "",
                read_number: "",
              },
            ],
          },
        },
      ]),
    ];

    const outcome = await agent.readWithAgent({
      mode: "page",
      page: JPEG,
      pockets: [JPEG, JPEG, null, null, null, null, null, null, null],
      games: ["one-piece"],
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.pockets[0]).toMatchObject({
      state: "card",
      cardId: "zoro",
      printingId: "zoro-p1",
      alternatives: ["nami"],
      sure: true,
    });
    /* A card it never searched up is handed back for the player. */
    expect(outcome.pockets[1]).toMatchObject({
      state: "unsure",
      cardId: null,
      sure: false,
    });
    expect(outcome.pockets[2].state).toBe("empty");
    /* A slot it never answered is unsure, never guessed. */
    expect(outcome.pockets[5]).toMatchObject({ state: "unsure", sure: false });

    const first = sent[0].body as {
      model: string;
      fallbacks: string;
      output_config: { effort: string };
      cache_control: { type: string };
      tools: { name: string }[];
      messages: { content: { type: string }[] }[];
    };
    expect(first.model).toBe("claude-sonnet-5-5");
    expect(first.fallbacks).toBe("default");
    expect(sent[0].beta).toContain("server-side-fallback-2026-07-01");
    expect(first.output_config.effort).toBe("medium");
    expect(first.cache_control.type).toBe("ephemeral");
    expect(first.tools.map((tool) => tool.name)).toEqual([
      "search_cards",
      "view_card",
      "submit_page",
    ]);
    /* The whole page and the two pockets that held something. */
    expect(
      first.messages[0].content.filter((block) => block.type === "image"),
    ).toHaveLength(3);
  });

  it("can be switched to another model from a setting", async () => {
    vi.stubEnv("SCAN_AGENT_MODEL", "claude-opus-5-5");
    replies = [message([{ type: "text", text: "nothing" }], "end_turn")];
    await agent.readWithAgent({ mode: "card", page: null, pockets: [JPEG], games: [] });
    expect((sent[0].body as { model: string }).model).toBe("claude-opus-5-5");
    vi.unstubAllEnvs();
  });

  it("gives up on a refusal rather than guessing", async () => {
    replies = [message([], "refusal")];
    const outcome = await agent.readWithAgent({
      mode: "card",
      page: null,
      pockets: [JPEG],
      games: [],
    });
    expect(outcome).toEqual({ ok: false, reason: "unavailable" });
  });

  it("only looks at art for cards it searched, from allowed hosts", () => {
    const source = read("src/lib/cards/page-agent.ts");
    expect(source).toContain("That card was not in your search results.");
    expect(source).toContain("isRenderableImageUrl(url)");
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

describe("recognising like a collector", () => {
  const source = read("src/lib/cards/page-agent.ts");
  const prompt = source.slice(
    source.indexOf("const SYSTEM = ["),
    source.indexOf("const tools"),
  );

  it("recognises from the artwork and its own knowledge, not only from text", () => {
    /* The founder's first page came back all "Text unreadable": the old
       instructions forbade naming a card from memory. */
    expect(prompt).not.toContain("Never name a card from memory");
    expect(prompt).toContain("Use your own knowledge of the games freely.");
    expect(prompt).toContain("most cards can be named from the artwork alone");
  });

  it("still only places cards its searches returned, and says what it saw when it cannot", () => {
    expect(prompt).toContain("must use a card_id");
    expect(prompt).toContain("put the name you recognised in read_name");
    expect(source).toContain("That card was not in your search results.");
  });

  it("searches wide enough for a character with many printings", () => {
    expect(source).toMatch(/findScanned\(\s*\{[\s\S]*?\},\s*12,\s*\)/);
    expect(read("src/lib/cards/scan.ts")).toContain(
      "if (read.number && !nameHasNumber) {",
    );
  });
});
