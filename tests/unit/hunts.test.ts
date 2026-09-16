import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  draftSummary,
  mergeItems,
  remainingCopies,
  remainingLabel,
} from "@/lib/flares/draft-rules";
import { HUNT_LIMIT, huntLimitFor } from "@/lib/players/hunts";

/**
 * HUNTS, as the founder's model has them: "A Hunt is a persistent named
 * list. A Flare can optionally link its card requests to a Hunt. Each
 * card request tracks its own quantities. Owners can mark cards found
 * outside CardFlare." Progress is counted in copies across the
 * requested list, and there is exactly one record of it per card.
 */
describe("how many hunts a player may keep", () => {
  it("is two on the free tier and fifty on a paid one", () => {
    expect(HUNT_LIMIT.free).toBe(2);
    expect(HUNT_LIMIT.pro).toBe(50);
    expect(huntLimitFor("free")).toBe(2);
    expect(huntLimitFor("pro")).toBe(50);
  });

  it("carries upward, because capabilities accumulate", () => {
    expect(huntLimitFor("ultra")).toBe(50);
    expect(huntLimitFor("max")).toBe(50);
  });

  it("treats an unknown or missing tier as free", () => {
    expect(huntLimitFor(null)).toBe(2);
    expect(huntLimitFor("gold")).toBe(2);
  });
});

describe("what a hunt is made of", () => {
  it("is a row of its own with one request per card", async () => {
    const migration = await readFile(
      "supabase/migrations/20261013090000_hunts_and_posts.sql",
      "utf8",
    );
    expect(migration).toContain("create table public.hunts");
    expect(migration).toContain("create table public.hunt_requests");
    /* The same card twice on one hunt is a bigger number, never a second
       row: the index says so. */
    expect(migration).toMatch(/create unique index hunt_requests_card_idx/);
    /* A posted card points at its request, which is the one record of
       progress for it wherever it is drawn. */
    expect(migration).toContain("hunt_request_id uuid references public.hunt_requests");
  });

  it("recovers only the hunts an account itself named", async () => {
    const migration = await readFile(
      "supabase/migrations/20261013090000_hunts_and_posts.sql",
      "utf8",
    );
    /* Grouped by the account and the label they typed. A guest session's
       label has no account to own a hunt, so it stays where it was. */
    expect(migration).toContain("where f.player_id is not null");
    expect(migration).toContain("group by f.player_id, lower(btrim(f.deck_label))");
  });

  it("keeps one record of progress: the request when linked, the flare otherwise", async () => {
    const hunts = await readFile("src/lib/players/hunts.ts", "utf8");
    /* From the Feed, a posted card in a hunt writes to the request. */
    expect(hunts).toMatch(/if \(flare\.hunt_request_id\)\s+return setRequestFound\(/);
    /* A trade counts once, through the same door. */
    expect(hunts).toContain("export async function recordTradeFound");
    const trades = await readFile("src/lib/trades/repository.ts", "utf8");
    expect(trades).toContain("await recordTradeFound(flareId, flare.quantity)");
  });

  it("lets only the owner move progress, and never below what a trade brought", async () => {
    const hunts = await readFile("src/lib/players/hunts.ts", "utf8");
    expect(hunts).toContain('.eq("player_id", playerId)');
    expect(hunts).toContain('reason: "not-yours"');
    /* Copies a closed trade brought are the floor a tick cannot go under. */
    expect(hunts).toContain("const floor = Math.min(");
    expect(hunts).toContain("Math.max(floor, Math.min(request.quantity_needed");
  });

  it("hides a private hunt from everyone but its owner", async () => {
    const hunts = await readFile("src/lib/players/hunts.ts", "utf8");
    expect(hunts).toContain(
      'if (viewerId !== playerId) query = query.eq("visibility", "public")',
    );
    expect(hunts).toContain(
      'if (data.visibility === "private" && data.player_id !== viewerId) return null',
    );
  });
});

describe("publishing a flare of several cards", () => {
  it("is one post, whose cards point at their hunt requests", async () => {
    const publish = await readFile("src/lib/flares/publish.ts", "utf8");
    expect(publish).toContain('.from("flare_posts").insert(');
    /* Linking never duplicates a card already on the hunt: "keep". */
    expect(publish).toContain('addHuntRequests(input.playerId, huntId, items, "keep")');
    /* An offering post never becomes a hunt request. */
    expect(publish).toContain('if (input.intent === "want" && input.hunt)');
  });

  it("folds the same card twice into more copies, never two lines", () => {
    const merged = mergeItems([
      { cardId: "a", printingId: null, quantity: 1 },
      { cardId: "b", printingId: "p1", quantity: 2 },
      { cardId: "a", printingId: null, quantity: 3 },
      { cardId: "a", printingId: "p2", quantity: 1 },
    ]);
    expect(merged).toEqual([
      { cardId: "a", printingId: null, quantity: 4 },
      { cardId: "b", printingId: "p1", quantity: 2 },
      { cardId: "a", printingId: "p2", quantity: 1 },
    ]);
  });

  it("counts cards and copies as two different things", () => {
    expect(draftSummary([{ quantity: 4 }, { quantity: 2 }, { quantity: 1 }])).toBe(
      "3 cards · 7 copies",
    );
    expect(draftSummary([{ quantity: 1 }])).toBe("1 card · 1 copy");
  });
});

describe("what is still wanted", () => {
  it("reads the request when the card is in a hunt, the flare otherwise", () => {
    const open = { quantity: 4, foundQuantity: 1, status: "open" };
    expect(remainingCopies(open, null)).toBe(3);
    expect(remainingCopies(open, { needed: 4, found: 2 })).toBe(2);
    /* A post that asks for part of a hunt never claims more than it asked. */
    expect(remainingCopies({ ...open, quantity: 2 }, { needed: 10, found: 1 })).toBe(2);
  });

  it("is nothing once the card traded, and never negative", () => {
    expect(
      remainingCopies({ quantity: 2, foundQuantity: 0, status: "traded" }, null),
    ).toBe(0);
    expect(
      remainingCopies({ quantity: 2, foundQuantity: 5, status: "open" }, null),
    ).toBe(0);
    expect(
      remainingCopies(
        { quantity: 2, foundQuantity: 0, status: "open" },
        { needed: 2, found: 9 },
      ),
    ).toBe(0);
  });

  it("says copies left and cards left on the collapsed row", () => {
    expect(remainingLabel([{ remaining: 3 }, { remaining: 2 }, { remaining: 0 }])).toBe(
      "5 copies left · 2 cards",
    );
    expect(remainingLabel([{ remaining: 1 }])).toBe("1 copy left · 1 card");
    expect(remainingLabel([{ remaining: 0 }])).toBe("All found");
  });
});

describe("offering several cards from a post", () => {
  it("is one offer batch, capped at what is still wanted, and never collects anything", async () => {
    const posts = await readFile("src/lib/feed/posts.ts", "utf8");
    expect(posts).toContain("export async function offerItems");
    expect(posts).toContain("const batch = randomUUID()");
    /* Each line is capped at the moment of the offer, and a card answered
       meanwhile is refused by name. */
    expect(posts).toContain("Math.min(left, Math.round(item.quantity))");
    expect(posts).toContain("refused.push(item.flareId)");
    /* Nothing here touches quantity_found or found_quantity. */
    const offer = posts.slice(posts.indexOf("export async function offerItems"));
    expect(offer).not.toContain("quantity_found");
    expect(offer).not.toContain("found_quantity");
  });
});
