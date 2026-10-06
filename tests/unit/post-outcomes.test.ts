import { readFile } from "node:fs/promises";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetApiPlayerMemory } from "@/lib/api/auth";
import { postSummary } from "@/lib/flares/post-summary";

/**
 * What a post did, card by card, and the hunt it leaves behind.
 *
 * The pre-launch audit found four things here, each pinned below:
 *
 * 1. A deck paste's preview spent the post's own rate limit, so a list
 *    previewed a dozen times while typing could not then be posted.
 * 2. A post where some cards failed answered `ok: true` and the
 *    composer said "Posted" — the truth is "Posted 18 of 20 · 2 were
 *    already up", and only the cards that went up are drawn as posted.
 * 3. A deck went up one query at a time and could outlive the function.
 * 4. A new hunt with an empty name was dropped silently, and a hunt was
 *    created even when no card then posted, leaving an empty orphan.
 */

/* ---------------------------------------------------------------- */
/* The words                                                         */
/* ---------------------------------------------------------------- */

describe("saying what a post did", () => {
  it("says nothing extra when every card went up", () => {
    expect(postSummary({ total: 20, posted: 20 })).toBeNull();
  });

  it("names the cards that were already up", () => {
    expect(postSummary({ total: 20, posted: 18, alreadyUp: 2 })).toBe(
      "Posted 18 of 20 · 2 were already up",
    );
    expect(postSummary({ total: 3, posted: 2, alreadyUp: 1 })).toBe(
      "Posted 2 of 3 · 1 was already up",
    );
  });

  it("names failures and a room's cap separately", () => {
    expect(postSummary({ total: 10, posted: 7, alreadyUp: 1, failed: 2 })).toBe(
      "Posted 7 of 10 · 1 was already up · 2 could not be posted",
    );
    expect(postSummary({ total: 10, posted: 6, atCap: true })).toBe(
      "Posted 6 of 10 · 4 did not fit under the Flare cap",
    );
  });

  it("is the same words on both platforms", async () => {
    const [web, app] = await Promise.all([
      readFile("src/lib/flares/post-summary.ts", "utf8"),
      readFile("mobile/src/post-summary.ts", "utf8"),
    ]);
    expect(app).toBe(web);
  });

  it("is what the composer and the paste screen show, on both", async () => {
    for (const file of [
      "mobile/src/screens/flare-composer.tsx",
      "mobile/src/screens/deck-paste.tsx",
      "src/components/flares/flare-composer.tsx",
      "src/components/players/deck-list-form.tsx",
    ]) {
      expect(await readFile(file, "utf8")).toContain("postSummary(");
    }
  });

  it("draws only the cards that went up as posted", async () => {
    const composer = await readFile("mobile/src/screens/flare-composer.tsx", "utf8");
    const onPosted = composer.slice(composer.indexOf("onPosted?.("));
    expect(composer).toContain("result.postedCardIds");
    expect(onPosted.startsWith("onPosted?.(\n        postedItems.map")).toBe(true);
  });
});

describe("a new hunt needs a name", () => {
  it("holds Preview on both platforms until it has one", async () => {
    for (const file of [
      "mobile/src/screens/flare-composer.tsx",
      "src/components/flares/flare-composer.tsx",
    ]) {
      const source = await readFile(file, "utf8");
      expect(source).toContain("huntUnnamed");
      expect(source).toContain('"Name your hunt"');
      expect(source).toMatch(/disabled=\{[^}]*huntUnnamed/);
    }
  });

  it("gives the long publish and paste routes room to finish", async () => {
    for (const file of [
      "src/app/api/v1/flares/publish/route.ts",
      "src/app/api/v1/wants/route.ts",
    ]) {
      expect(await readFile(file, "utf8")).toContain("export const maxDuration = 60");
    }
  });
});

/* ---------------------------------------------------------------- */
/* The server                                                        */
/* ---------------------------------------------------------------- */

const getUser = vi.fn();
const playerForUser = vi.fn();
const insertAreaFlares = vi.fn();
const postAreaFlares = vi.fn();
const createHunt = vi.fn();
const addHuntRequests = vi.fn();
const saveWant = vi.fn();
const findCardsByNumbers = vi.fn();
const previewDeckList = vi.fn();

/* Every write the publish makes, by table. */
const writes: { table: string; op: string; payload?: unknown; filters: unknown[][] }[] =
  [];

function chain(table: string) {
  const c: Record<string, unknown> = {};
  let current: (typeof writes)[number] | null = null;
  for (const method of ["select", "eq", "is", "in", "order", "limit"]) {
    c[method] = (...args: unknown[]) => {
      current?.filters.push([method, ...args]);
      return c;
    };
  }
  for (const op of ["insert", "update", "delete"]) {
    c[op] = (payload?: unknown) => {
      current = { table, op, payload, filters: [] };
      writes.push(current);
      return c;
    };
  }
  c.maybeSingle = () => Promise.resolve({ data: null, error: null });
  c.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(resolve);
  return c;
}

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    auth: { getUser: (...a: unknown[]) => getUser(...a) },
    from: (table: string) => chain(table),
  }),
}));
vi.mock("@/lib/players/accounts", () => ({
  playerForUser: (...a: unknown[]) => playerForUser(...a),
}));
vi.mock("@/lib/local/area", () => ({
  insertAreaFlares: (...a: unknown[]) => insertAreaFlares(...a),
  postAreaFlares: (...a: unknown[]) => postAreaFlares(...a),
}));
vi.mock("@/lib/players/hunts", () => ({
  createHunt: (...a: unknown[]) => createHunt(...a),
  addHuntRequests: (...a: unknown[]) => addHuntRequests(...a),
}));
vi.mock("@/lib/players/wants", () => ({
  saveWant: (...a: unknown[]) => saveWant(...a),
}));
vi.mock("@/lib/lists/repository", () => ({ addFlare: vi.fn() }));
vi.mock("@/lib/cards/search", () => ({
  findCardsByNumbers: (...a: unknown[]) => findCardsByNumbers(...a),
}));
vi.mock("@/lib/players/deck-list-preview", () => ({
  previewDeckList: (...a: unknown[]) => previewDeckList(...a),
}));

const { publishPost } = await import("@/lib/flares/publish");
const wants = await import("@/app/api/v1/wants/route");

const CARDS = ["c1", "c2", "c3"].map((cardId) => ({
  cardId,
  printingId: null,
  quantity: 1,
}));

const input = (over: Partial<Parameters<typeof publishPost>[0]> = {}) => ({
  playerId: "player-1",
  session: null,
  eventId: null,
  intent: "want" as const,
  caption: null,
  items: CARDS,
  hunt: null,
  acceptsTrade: true,
  acceptsCash: false,
  at: null,
  ...over,
});

beforeEach(() => {
  writes.length = 0;
  resetApiPlayerMemory();
  for (const fn of [
    getUser,
    playerForUser,
    insertAreaFlares,
    postAreaFlares,
    createHunt,
    addHuntRequests,
    saveWant,
    findCardsByNumbers,
    previewDeckList,
  ])
    fn.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  saveWant.mockResolvedValue("saved");
  createHunt.mockResolvedValue({ ok: true, huntId: "hunt-1", created: true });
  addHuntRequests.mockResolvedValue({
    ok: true,
    requestIds: ["r1", "r2", "r3"],
  });
  previewDeckList.mockResolvedValue([]);
});

describe("publishing counts each card", () => {
  it("answers posted, already up and failed rather than a bare ok", async () => {
    insertAreaFlares.mockResolvedValue({
      ok: true,
      outcomes: [
        { status: "posted", flareId: "f1" },
        { status: "already-up" },
        { status: "failed" },
      ],
    });

    const result = await publishPost(input());

    expect(result).toMatchObject({
      ok: true,
      total: 3,
      posted: 1,
      alreadyUp: 1,
      failed: 1,
      postedCardIds: ["c1"],
    });
    /* Only the card that went up follows the player onto their list. */
    expect(saveWant).toHaveBeenCalledTimes(1);
  });

  it("posts the whole area post in one call, with the hunt and caption on the rows", async () => {
    insertAreaFlares.mockResolvedValue({
      ok: true,
      outcomes: CARDS.map((_, i) => ({ status: "posted", flareId: `f${i}` })),
    });

    await publishPost(input({ caption: "Trading at locals", hunt: { name: "Zoro" } }));

    expect(insertAreaFlares).toHaveBeenCalledTimes(1);
    const rows = insertAreaFlares.mock.calls[0][1] as Record<string, unknown>[];
    expect(rows.map((row) => row.huntRequestId)).toEqual(["r1", "r2", "r3"]);
    expect(rows[0].note).toBe("Trading at locals");
    /* Nothing written back card by card afterwards. */
    expect(writes.filter((w) => w.table === "flares")).toHaveLength(0);
  });
});

describe("a hunt never outlives a post that did not happen", () => {
  it("refuses a nameless new hunt before writing anything", async () => {
    const result = await publishPost(input({ hunt: { name: "   " } }));

    expect(result).toEqual({ ok: false, reason: "hunt-name" });
    expect(createHunt).not.toHaveBeenCalled();
    expect(insertAreaFlares).not.toHaveBeenCalled();
  });

  it("deletes a hunt it started when no card went up", async () => {
    insertAreaFlares.mockResolvedValue({
      ok: true,
      outcomes: CARDS.map(() => ({ status: "failed" })),
    });

    const result = await publishPost(input({ hunt: { name: "Green Zoro" } }));

    expect(result).toMatchObject({ ok: false });
    expect(writes).toContainEqual(
      expect.objectContaining({
        table: "hunts",
        op: "delete",
        filters: [["eq", "id", "hunt-1"]],
      }),
    );
  });

  it("never deletes a hunt that already existed, even when nothing posted", async () => {
    /* createHunt answers with the hunt already by that name: not new. */
    createHunt.mockResolvedValue({ ok: true, huntId: "hunt-1" });
    insertAreaFlares.mockResolvedValue({
      ok: true,
      outcomes: CARDS.map(() => ({ status: "failed" })),
    });

    await publishPost(input({ hunt: { name: "Green Zoro" } }));

    /* A card on a hunt stays there (hunt-persistence.test.ts). */
    expect(writes.some((w) => w.op === "delete" && w.table !== "flare_posts")).toBe(
      false,
    );
  });

  it("keeps a new hunt when at least one card went up", async () => {
    insertAreaFlares.mockResolvedValue({
      ok: true,
      outcomes: [
        { status: "posted", flareId: "f1" },
        { status: "failed" },
        { status: "failed" },
      ],
    });

    const result = await publishPost(input({ hunt: { name: "Green Zoro" } }));

    expect(result).toMatchObject({ ok: true, posted: 1, failed: 2, huntId: "hunt-1" });
    expect(writes.some((w) => w.table === "hunts" && w.op === "delete")).toBe(false);
  });

  it("is a 400 in words from the route, not 'Unrecognised Flare'", async () => {
    playerForUser.mockResolvedValue({ id: "player-1", display_name: "Kaito" });
    const { POST } = await import("@/app/api/v1/flares/publish/route");

    const response = await POST(
      new Request("https://cardflare.gg/api/v1/flares/publish", {
        method: "POST",
        headers: { authorization: "Bearer jwt-1" },
        body: JSON.stringify({
          intent: "want",
          items: [{ cardId: "11111111-1111-4111-8111-111111111111", quantity: 1 }],
          hunt: { name: "  " },
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "hunt-name",
      message: "Name your hunt.",
    });
  });
});

describe("a deck paste's preview has its own limit", () => {
  const paste = (body: unknown) =>
    wants.POST(
      new Request("https://cardflare.gg/api/v1/wants", {
        method: "POST",
        headers: { authorization: "Bearer jwt-preview" },
        body: JSON.stringify(body),
      }),
    );

  it("previews many times and can still post the list", async () => {
    playerForUser.mockResolvedValue({ id: "player-preview", display_name: "Nami" });
    findCardsByNumbers.mockResolvedValue(new Map([["OP17001", "card-a"]]));
    postAreaFlares.mockResolvedValue({
      ok: true,
      batchId: "b",
      posted: 1,
      alreadyUp: 0,
      failed: 0,
    });

    /* Past the post's own twenty, as a player typing would. */
    for (let i = 0; i < 30; i += 1) {
      expect((await paste({ list: "1x OP17-001", preview: true })).status).toBe(200);
    }

    const saved = await paste({ list: "1x OP17-001" });
    expect(saved.status).toBe(200);
  });

  it("answers per card when a paste posts", async () => {
    playerForUser.mockResolvedValue({ id: "player-counts", display_name: "Usopp" });
    findCardsByNumbers.mockResolvedValue(
      new Map([
        ["OP17001", "card-a"],
        ["OP17002", "card-b"],
      ]),
    );
    postAreaFlares.mockResolvedValue({
      ok: true,
      batchId: "b",
      posted: 1,
      alreadyUp: 1,
      failed: 0,
    });

    const response = await paste({ list: "1x OP17-001\n1x OP17-002" });
    expect(await response.json()).toMatchObject({
      ok: true,
      saved: 1,
      total: 2,
      alreadyUp: 1,
      failed: 0,
    });
  });
});
