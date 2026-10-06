import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { binderAddedLine, binderAddSchema } from "@/lib/binder/add-copy";

const read = (path: string) => readFileSync(path, "utf8");
const flat = (text: string) => text.replace(/\s+/g, " ");

/**
 * Binder round 3, the server half: real pockets, adding at once from the
 * pocket tapped, pasting a list, the short link and a preview picture
 * that is not blank.
 */

describe("real pockets", () => {
  const migration = flat(read("supabase/migrations/20261107090000_binder_pockets.sql"));
  const lib = flat(read("src/lib/binder/binder.ts"));

  it("keeps one card per pocket, checked once per move", () => {
    expect(migration).toContain(
      "unique (binder_id, position) deferrable initially deferred",
    );
  });

  it("moves a card in one call: an empty pocket takes it, a full one slides the run", () => {
    expect(migration).toContain("create or replace function public.binder_place_card(");
    expect(migration).toContain("set position = position + 1");
    expect(lib).toContain('rpc("binder_place_card", {');
  });

  it("gives every existing card the pocket it is drawn in today", () => {
    expect(migration).toContain("order by (position is not null),");
    expect(migration).toContain("case when position is null then created_at end desc");
  });
});

describe("adding at once", () => {
  const lib = flat(read("src/lib/binder/binder.ts"));
  const add = lib.slice(lib.indexOf("export async function addBinderCards("));

  it("starts at the pocket tapped, or after the last card", () => {
    expect(add).toContain("let cursor = startPocket ?? last + 1;");
    expect(add).toContain(
      "const pocket = room > 0 ? nextFreePocket(taken, cursor) : null;",
    );
  });

  it("counts up a card already in the binder instead of a second pocket", () => {
    expect(add).toContain(
      "const quantity = Math.min(99, had.quantity + item.quantity);",
    );
  });

  it("keeps the old single add working, after the last card", () => {
    const single = lib.slice(lib.indexOf("export async function addBinderCard("));
    expect(single.slice(0, 600)).toContain(
      "addBinderCards(playerId, displayName, binderId, [",
    );
  });

  it("takes a batch of up to 120 and says what happened", () => {
    expect(
      binderAddSchema.safeParse({
        items: [{ cardId: "00000000-0000-4000-8000-000000000001" }],
        pocket: 8,
      }).success,
    ).toBe(true);
    expect(binderAddSchema.safeParse({ items: [], pocket: 0 }).success).toBe(false);
    expect(binderAddedLine({ added: 3, merged: 0, skipped: 0 })).toBe("Added 3 cards.");
    expect(binderAddedLine({ added: 1, merged: 1, skipped: 0 })).toBe(
      "Added 1 card. 1 was already here, so its count went up.",
    );
    expect(binderAddedLine({ added: 0, merged: 0, skipped: 2 })).toBe(
      "The binder is full, so 2 cards were left out.",
    );
  });

  it("is open to the website and the app", () => {
    const route = flat(read("src/app/api/v1/binders/[binderId]/cards/route.ts"));
    expect(route).toContain("const batch = binderAddSchema.safeParse(body);");
    expect(route).toContain("export async function PATCH(");
    expect(flat(read("src/lib/binder/actions.ts"))).toContain(
      "export async function addBinderCardsAction(",
    );
  });
});

describe("pasting a list", () => {
  it("is looked up first, with each line's card, and writes nothing", () => {
    const route = flat(read("src/app/api/v1/binders/list-preview/route.ts"));
    expect(route).toContain("const entries = await previewDeckList(lines);");
    expect(route).not.toContain("addBinderCards");
    expect(flat(read("src/lib/players/deck-list-preview.ts"))).toContain(
      "cardId: card.id,",
    );
  });
});

describe("the short link", () => {
  const lib = flat(read("src/lib/binder/binder.ts"));

  it("is made with every binder, and the id still works", () => {
    expect(lib).toContain("share_code: newShareCode(),");
    expect(lib).toContain('.eq("share_code", value)');
    expect(flat(read("src/app/b/[binderId]/page.tsx"))).toContain(
      "binderIdFromLink((await params).binderId)",
    );
  });

  it("backfills a code for every binder that exists", () => {
    const migration = flat(
      read("supabase/migrations/20261107090000_binder_pockets.sql"),
    );
    expect(migration).toContain(
      "set share_code = substr(md5(random()::text || id::text), 1, 8)",
    );
    expect(migration).toContain(
      "create unique index if not exists binders_share_code_idx",
    );
  });
});

describe("the preview picture", () => {
  const image = flat(read("src/lib/binder/share-image.tsx"));

  it("fetches every picture on the server and hands it over as PNG bytes", () => {
    expect(image).toContain(
      'const absolute = url.startsWith("/") ? `${siteUrl()}${url}` : url;',
    );
    expect(image).toContain("data:image/png;base64,");
  });

  it("is the binder: its cover colours and its first page of pockets", () => {
    expect(image).toContain("const edge = resolveVar(cover.edge, colours");
    expect(image).toContain("binder?.cards.find((card) => card.pocket === pocket)");
  });

  it("loads the image encoder lazily", () => {
    expect(image).not.toMatch(/^import\s+.*\bfrom\s+"sharp"/m);
    expect(image).toContain('(await import("sharp")).default');
  });
});
